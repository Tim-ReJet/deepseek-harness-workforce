/**
 * provider-admission-store/index.ts — an in-memory admission gate for
 * `ProviderAdmissionRecord`. Mirrors the shape of this repo's other
 * in-memory admission gates (e.g. `apps/api/src/fleet-admission.ts`):
 * `admit`/`revoke`-style mutation, a synchronous `get`/`list` read surface,
 * and a `resetForTest()` escape hatch — no database, no network.
 *
 * Signing/verification is CONTRACT-002's DSSE envelope
 * (`../common/dsse.js`), reusing `generateToolAdmitterTestKey` per this
 * unit's brief rather than inventing a new `provider-admitter` SignerRole.
 */
import {
  createDsseEnvelope,
  verifyDsseEnvelope,
  dsseEnvelope,
  type DsseVerifyResult,
  type SignerRole,
  type SigningKey,
  type VerificationKey,
} from "../common/dsse.js";
import { computeArtifactDigest, canonicalizeJcs } from "../common/digest.js";
import {
  providerAdmissionRecord,
  type ProviderAdmissionRecord,
  type ProviderAdmissionStatus,
} from "../provider-admission-record/index.js";

export const PROVIDER_ADMISSION_PAYLOAD_TYPE =
  "application/vnd.workforce.provider-admission-record+json" as const;

export class UnknownProviderAdmissionRecordError extends Error {
  constructor(id: string) {
    super(`Unknown provider admission record "${id}".`);
    this.name = "UnknownProviderAdmissionRecordError";
  }
}

/**
 * Sign a `ProviderAdmissionRecord` payload (everything but `signature`) and
 * return the base64 DSSE signature to store in the record's opaque
 * `signature` field. The record's own `digest` is expected to already be
 * set (computed over everything but `digest`/`signature`).
 */
function signRecordPayload(
  record: ProviderAdmissionRecord,
  signingKey: SigningKey<SignerRole>,
): string {
  const { signature: _signature, ...unsigned } = record;
  const payload = Buffer.from(canonicalizeJcs(unsigned), "utf8");
  const envelope = createDsseEnvelope(PROVIDER_ADMISSION_PAYLOAD_TYPE, payload, [signingKey]);
  // Store the whole envelope, base64-encoded, in the opaque `signature` string —
  // this keeps `ProviderAdmissionRecord.signature` a bare string per the record
  // schema while still carrying a real DSSE envelope (keyid + sig) inside it.
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

/**
 * Verify a `ProviderAdmissionRecord`'s `signature` against a set of
 * verification keys. Recomputes the DSSE PAE over the record's own fields
 * (minus `signature`), so any tampering with the payload — or a signature
 * minted by an unknown/wrong key — fails verification.
 */
export function verifyProviderAdmissionRecord(
  record: ProviderAdmissionRecord,
  verificationKeys: ReadonlyArray<VerificationKey<SignerRole>>,
): DsseVerifyResult {
  const decoded = dsseEnvelope.safeParse(
    (() => {
      try {
        return JSON.parse(Buffer.from(record.signature, "base64").toString("utf8"));
      } catch {
        return undefined;
      }
    })(),
  );
  if (!decoded.success) {
    return { ok: false, verifiedKeyIds: [], errors: ["signature is not a valid encoded DSSE envelope"] };
  }
  const envelope = decoded.data;
  const { signature: _signature, ...unsigned } = record;
  const expectedPayload = Buffer.from(canonicalizeJcs(unsigned), "utf8").toString("base64");
  if (envelope.payload !== expectedPayload) {
    return { ok: false, verifiedKeyIds: [], errors: ["envelope payload does not match record contents"] };
  }
  return verifyDsseEnvelope(envelope, verificationKeys);
}

export class InMemoryProviderAdmissionStore {
  private records = new Map<string, ProviderAdmissionRecord>();

  /**
   * Sign and store a `ProviderAdmissionRecord`. The record's `digest` is
   * (re)computed from its own fields and its `signature` is (re)signed with
   * `signingKey`; both overwrite whatever the caller supplied, so a caller
   * cannot admit a record with a digest/signature it fabricated itself.
   */
  admit(
    record: Omit<ProviderAdmissionRecord, "digest" | "signature">,
    signingKey: SigningKey<SignerRole>,
  ): ProviderAdmissionRecord {
    // computeArtifactDigest strips `digest`/`signature` before hashing, so the
    // placeholder values here never affect the computed digest.
    const computedDigest = computeArtifactDigest({ ...record, digest: undefined, signature: undefined });
    const withDigest = {
      ...record,
      digest: computedDigest,
      signature: "placeholder",
    } as ProviderAdmissionRecord;
    const signature = signRecordPayload(withDigest, signingKey);
    const signed = providerAdmissionRecord.parse({ ...withDigest, signature });
    this.records.set(signed.id, signed);
    return signed;
  }

  /** Verify a stored (or externally supplied) record's signature. */
  verify(
    record: ProviderAdmissionRecord,
    verificationKeys: ReadonlyArray<VerificationKey<SignerRole>>,
  ): DsseVerifyResult {
    return verifyProviderAdmissionRecord(record, verificationKeys);
  }

  get(id: string): ProviderAdmissionRecord | undefined {
    return this.records.get(id);
  }

  listByStatus(status: ProviderAdmissionStatus): ProviderAdmissionRecord[] {
    return [...this.records.values()].filter((r) => r.status === status);
  }

  /** Transition a stored record to REVOKED, recording `reason` in `extensions`. */
  revoke(id: string, reason: string): ProviderAdmissionRecord {
    const existing = this.records.get(id);
    if (!existing) {
      throw new UnknownProviderAdmissionRecordError(id);
    }
    const revoked: ProviderAdmissionRecord = {
      ...existing,
      status: "REVOKED",
      extensions: {
        ...existing.extensions,
        "workforce.provider-admission.revocation": { reason },
      },
    };
    this.records.set(id, revoked);
    return revoked;
  }

  /**
   * Ids of stored records that declare `providerId` in their `dependsOn`
   * list — a simple in-memory index, not a general dependency graph.
   */
  impactedBy(providerId: string): string[] {
    return [...this.records.values()]
      .filter((r) => r.dependsOn.includes(providerId))
      .map((r) => r.id);
  }

  /** Clear all stored records. Test-only escape hatch, mirrors this repo's other in-memory gates. */
  resetForTest(): void {
    this.records.clear();
  }
}
