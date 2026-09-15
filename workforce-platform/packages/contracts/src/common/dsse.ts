/**
 * dsse.ts — DSSE (Dead Simple Signing Envelope) envelope type + verification
 * interface for V2's signed artifacts (`ExecutionPermit`, `OutcomeAttestation`,
 * `ToolAdmissionRecord`). https://github.com/secure-systems-lab/dsse
 *
 * This module types the envelope and implements the PAE (pre-authentication
 * encoding) + sign/verify primitives; it holds no production key material —
 * `generateTestSigningKey` exists only for in-process tests to mint
 * throwaway Ed25519 keypairs.
 *
 * Signer identity model: `PermitIssuerSigningKey`/`OutcomeAttestorSigningKey`
 * (and their `VerificationKey` counterparts) are branded by role so a permit
 * cannot be signed with an outcome-attestor key or vice versa without an
 * explicit, visible cast — encoding the spec's "Permit Issuer key and
 * Outcome Attestor key are different identities" requirement in the type
 * system, not just in prose.
 */
import { z } from "zod";
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";

// ---------------------------------------------------------------------------
// Envelope shape
// ---------------------------------------------------------------------------

export const dsseSignature = z
  .object({
    /** Identifies which key signed — opaque, not verified against a PKI here. */
    keyid: z.string(),
    /** base64-encoded raw signature bytes. */
    sig: z.string().min(1),
  })
  .strict();
export type DsseSignature = z.infer<typeof dsseSignature>;

export const dsseEnvelope = z
  .object({
    /** Media type of the (pre-base64) payload, e.g. `application/vnd.workforce.execution-permit+json`. */
    payloadType: z.string().min(1),
    /** base64-encoded raw payload bytes. */
    payload: z.string().min(1),
    signatures: z.array(dsseSignature).min(1),
  })
  .strict();
export type DsseEnvelope = z.infer<typeof dsseEnvelope>;

// ---------------------------------------------------------------------------
// Signer role model — Permit Issuer and Outcome Attestor are distinct
// identities, encoded as distinct branded types rather than a shared shape.
// ---------------------------------------------------------------------------

export type SignerRole = "permit-issuer" | "outcome-attestor" | "tool-admitter";

declare const roleBrand: unique symbol;

/** A private signing key, branded so it can only be used for its own role. */
export interface SigningKey<Role extends SignerRole = SignerRole> {
  readonly [roleBrand]: Role;
  readonly keyId: string;
  readonly role: Role;
  readonly privateKey: KeyObject;
}

/** A public verification key, branded the same way as its matching signing key. */
export interface VerificationKey<Role extends SignerRole = SignerRole> {
  readonly [roleBrand]: Role;
  readonly keyId: string;
  readonly role: Role;
  readonly publicKey: KeyObject;
}

export type PermitIssuerSigningKey = SigningKey<"permit-issuer">;
export type PermitIssuerVerificationKey = VerificationKey<"permit-issuer">;
export type OutcomeAttestorSigningKey = SigningKey<"outcome-attestor">;
export type OutcomeAttestorVerificationKey = VerificationKey<"outcome-attestor">;
export type ToolAdmitterSigningKey = SigningKey<"tool-admitter">;
export type ToolAdmitterVerificationKey = VerificationKey<"tool-admitter">;

interface TestKeyPair<Role extends SignerRole> {
  signingKey: SigningKey<Role>;
  verificationKey: VerificationKey<Role>;
}

/**
 * Generate an in-process Ed25519 test keypair for the given role. Test-only:
 * no persistence, no KMS/HSM, never a production key. Every call returns a
 * fresh keypair unless `keyId` is reused deliberately (e.g. to test rotation).
 */
function generateTestKeyPairForRole<Role extends SignerRole>(
  role: Role,
  keyId: string = `test-${role}-${createHash("sha256").update(`${role}:${Math.random()}`).digest("hex").slice(0, 12)}`,
): TestKeyPair<Role> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signingKey = { keyId, role, privateKey } as SigningKey<Role>;
  const verificationKey = { keyId, role, publicKey } as VerificationKey<Role>;
  return { signingKey, verificationKey };
}

/** Mint a test-only Permit Issuer Ed25519 keypair. */
export function generatePermitIssuerTestKey(keyId?: string): TestKeyPair<"permit-issuer"> {
  return generateTestKeyPairForRole("permit-issuer", keyId);
}

/** Mint a test-only Outcome Attestor Ed25519 keypair — a distinct identity from the Permit Issuer. */
export function generateOutcomeAttestorTestKey(keyId?: string): TestKeyPair<"outcome-attestor"> {
  return generateTestKeyPairForRole("outcome-attestor", keyId);
}

/** Mint a test-only Tool Admitter Ed25519 keypair. */
export function generateToolAdmitterTestKey(keyId?: string): TestKeyPair<"tool-admitter"> {
  return generateTestKeyPairForRole("tool-admitter", keyId);
}

/** Re-derive a `VerificationKey` from a `SigningKey` (same keyId/role, public half only). */
export function toVerificationKey<Role extends SignerRole>(
  signingKey: SigningKey<Role>,
): VerificationKey<Role> {
  return {
    keyId: signingKey.keyId,
    role: signingKey.role,
    publicKey: createPublicKey(signingKey.privateKey),
  } as VerificationKey<Role>;
}

// ---------------------------------------------------------------------------
// PAE — pre-authentication encoding (DSSE §"Signature Definition")
// ---------------------------------------------------------------------------

/**
 * `PAE(type, body) = "DSSEv1" + SP + LEN(type) + SP + type + SP + LEN(body) + SP + body`
 * with `LEN(s)` the ASCII decimal encoding of the byte length of `s`. This is
 * what is actually signed/verified — never the raw payload — so a signature
 * cannot be replayed against a different `payloadType`.
 */
export function preAuthenticationEncoding(payloadType: string, payload: Uint8Array): Buffer {
  const typeBuf = Buffer.from(payloadType, "utf8");
  const parts = [
    Buffer.from("DSSEv1 ", "ascii"),
    Buffer.from(`${typeBuf.length} `, "ascii"),
    typeBuf,
    Buffer.from(` ${payload.length} `, "ascii"),
    Buffer.from(payload),
  ];
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Sign / verify
// ---------------------------------------------------------------------------

/**
 * Build a DSSE envelope for `payload` under `payloadType`, signed by every
 * key in `signingKeys` (one `DsseSignature` per key, in order).
 */
export function createDsseEnvelope(
  payloadType: string,
  payload: Uint8Array,
  signingKeys: ReadonlyArray<SigningKey<SignerRole>>,
): DsseEnvelope {
  if (signingKeys.length === 0) {
    throw new Error("createDsseEnvelope: at least one signing key is required");
  }
  const pae = preAuthenticationEncoding(payloadType, payload);
  const signatures = signingKeys.map((key) => ({
    keyid: key.keyId,
    // Ed25519 in Node's `sign`/`verify` takes a null digest algorithm.
    sig: nodeSign(null, pae, key.privateKey).toString("base64"),
  }));
  return {
    payloadType,
    payload: Buffer.from(payload).toString("base64"),
    signatures,
  };
}

export interface DsseVerifyResult {
  ok: boolean;
  /** keyIds whose signature verified against the supplied verification keys. */
  verifiedKeyIds: string[];
  errors: string[];
}

/**
 * Verify a DSSE envelope's signatures against a set of known verification
 * keys. `ok` is true iff at least `minimumValidSignatures` (default 1)
 * signatures verify against a *known* key for the envelope's `payloadType`;
 * unknown `keyid`s and byte-for-byte tampering are both reported as errors
 * rather than throwing, so callers can distinguish "no valid signer" from
 * "malformed envelope".
 */
export function verifyDsseEnvelope(
  envelope: DsseEnvelope,
  verificationKeys: ReadonlyArray<VerificationKey<SignerRole>>,
  options: { minimumValidSignatures?: number } = {},
): DsseVerifyResult {
  const minimumValidSignatures = options.minimumValidSignatures ?? 1;
  const errors: string[] = [];
  const verifiedKeyIds: string[] = [];

  let payload: Buffer;
  try {
    payload = Buffer.from(envelope.payload, "base64");
  } catch {
    return { ok: false, verifiedKeyIds: [], errors: ["payload is not valid base64"] };
  }
  const pae = preAuthenticationEncoding(envelope.payloadType, payload);

  const byKeyId = new Map(verificationKeys.map((k) => [k.keyId, k] as const));
  for (const signature of envelope.signatures) {
    const key = byKeyId.get(signature.keyid);
    if (!key) {
      errors.push(`no verification key known for keyid ${signature.keyid}`);
      continue;
    }
    let sigBytes: Buffer;
    try {
      sigBytes = Buffer.from(signature.sig, "base64");
    } catch {
      errors.push(`signature for keyid ${signature.keyid} is not valid base64`);
      continue;
    }
    const valid = nodeVerify(null, pae, key.publicKey, sigBytes);
    if (valid) {
      verifiedKeyIds.push(signature.keyid);
    } else {
      errors.push(`signature for keyid ${signature.keyid} did not verify`);
    }
  }

  return { ok: verifiedKeyIds.length >= minimumValidSignatures, verifiedKeyIds, errors };
}

/** Decode a DSSE envelope's payload back to bytes (no verification performed). */
export function decodeDssePayload(envelope: DsseEnvelope): Buffer {
  return Buffer.from(envelope.payload, "base64");
}

// re-export so callers that only need key material don't need node:crypto directly
export { createPrivateKey };
