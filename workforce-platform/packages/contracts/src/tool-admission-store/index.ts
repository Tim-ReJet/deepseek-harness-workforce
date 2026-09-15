/**
 * tool-admission-store/index.ts — an in-memory admission gate for
 * `ToolAdmissionRecord`. Mirrors the shape of this repo's other in-memory
 * admission gates (e.g. `provider-admission-store/`, `apps/api/src/
 * fleet-admission.ts`): `admit`/`revoke`-style mutation, a synchronous
 * `get`/`list` read surface, and a `resetForTest()` escape hatch — no
 * database, no network, no MCP discovery gateway.
 *
 * Signing/verification is CONTRACT-002's DSSE envelope (`../common/dsse.js`),
 * reusing the already-landed `generateToolAdmitterTestKey` / `tool-admitter`
 * SignerRole rather than inventing a new one.
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
  toolAdmissionRecord,
  toolAdmissionStatus,
  type ToolAdmissionRecord,
} from "../tool-admission-record/index.js";
import type { z } from "zod";

type ToolAdmissionStatus = z.infer<typeof toolAdmissionStatus>;

export const TOOL_ADMISSION_PAYLOAD_TYPE =
  "application/vnd.workforce.tool-admission-record+json" as const;

export class UnknownToolAdmissionRecordError extends Error {
  constructor(id: string) {
    super(`Unknown tool admission record "${id}".`);
    this.name = "UnknownToolAdmissionRecordError";
  }
}

/**
 * Sign a `ToolAdmissionRecord` payload (everything but `signature`) and
 * return the base64 DSSE signature to store in the record's opaque
 * `signature` field. The record's own `digest` is expected to already be
 * set (computed over everything but `digest`/`signature`).
 */
function signRecordPayload(
  record: ToolAdmissionRecord,
  signingKey: SigningKey<SignerRole>,
): string {
  const { signature: _signature, ...unsigned } = record;
  const payload = Buffer.from(canonicalizeJcs(unsigned), "utf8");
  const envelope = createDsseEnvelope(TOOL_ADMISSION_PAYLOAD_TYPE, payload, [signingKey]);
  // Store the whole envelope, base64-encoded, in the opaque `signature` string —
  // this keeps `ToolAdmissionRecord.signature` a bare string per the record
  // schema while still carrying a real DSSE envelope (keyid + sig) inside it.
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

/**
 * Verify a `ToolAdmissionRecord`'s `signature` against a set of
 * verification keys. Recomputes the DSSE PAE over the record's own fields
 * (minus `signature`), so any tampering with the payload — or a signature
 * minted by an unknown/wrong key — fails verification.
 */
export function verifyToolAdmissionRecord(
  record: ToolAdmissionRecord,
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

export class InMemoryToolAdmissionStore {
  private records = new Map<string, ToolAdmissionRecord>();

  /**
   * Sign and store a `ToolAdmissionRecord`. The record's `digest` is
   * (re)computed from its own fields and its `signature` is (re)signed with
   * `signingKey`; both overwrite whatever the caller supplied, so a caller
   * cannot admit a record with a digest/signature it fabricated itself.
   */
  admit(
    record: Omit<ToolAdmissionRecord, "digest" | "signature">,
    signingKey: SigningKey<SignerRole>,
  ): ToolAdmissionRecord {
    // computeArtifactDigest strips `digest`/`signature` before hashing, so the
    // placeholder values here never affect the computed digest.
    const computedDigest = computeArtifactDigest({ ...record, digest: undefined, signature: undefined });
    const withDigest = {
      ...record,
      digest: computedDigest,
      signature: "placeholder",
    } as ToolAdmissionRecord;
    const signature = signRecordPayload(withDigest, signingKey);
    const signed = toolAdmissionRecord.parse({ ...withDigest, signature });
    this.records.set(signed.id, signed);
    return signed;
  }

  /** Verify a stored (or externally supplied) record's signature. */
  verify(
    record: ToolAdmissionRecord,
    verificationKeys: ReadonlyArray<VerificationKey<SignerRole>>,
  ): DsseVerifyResult {
    return verifyToolAdmissionRecord(record, verificationKeys);
  }

  get(id: string): ToolAdmissionRecord | undefined {
    return this.records.get(id);
  }

  listByStatus(status: ToolAdmissionStatus): ToolAdmissionRecord[] {
    return [...this.records.values()].filter((r) => r.status === status);
  }

  /** Transition a stored record to REVOKED, recording `reason` in `extensions`. */
  revoke(id: string, reason: string): ToolAdmissionRecord {
    const existing = this.records.get(id);
    if (!existing) {
      throw new UnknownToolAdmissionRecordError(id);
    }
    const revoked: ToolAdmissionRecord = {
      ...existing,
      status: "REVOKED",
      extensions: {
        ...existing.extensions,
        "workforce.tool-admission.revocation": { reason },
      },
    };
    this.records.set(id, revoked);
    return revoked;
  }

  /** Clear all stored records. Test-only escape hatch, mirrors this repo's other in-memory gates. */
  resetForTest(): void {
    this.records.clear();
  }
}
