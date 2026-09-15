/**
 * dsse.test.ts — DSSE envelope sign/verify, PAE, and the Permit
 * Issuer / Outcome Attestor distinct-identity type model. All keys here are
 * generated in-process for the test only — no production keys.
 */
import { describe, expect, it } from "vitest";
import {
  createDsseEnvelope,
  verifyDsseEnvelope,
  preAuthenticationEncoding,
  generatePermitIssuerTestKey,
  generateOutcomeAttestorTestKey,
  toVerificationKey,
  dsseEnvelope,
} from "./dsse.js";

describe("preAuthenticationEncoding", () => {
  it("matches the DSSE PAE formula for a known vector", () => {
    const payload = Buffer.from("hello", "utf8");
    const pae = preAuthenticationEncoding("text/plain", payload);
    expect(pae.toString("utf8")).toBe("DSSEv1 10 text/plain 5 hello");
  });

  it("is sensitive to payloadType (prevents cross-type replay)", () => {
    const payload = Buffer.from("x", "utf8");
    const a = preAuthenticationEncoding("type-a", payload);
    const b = preAuthenticationEncoding("type-b", payload);
    expect(a.equals(b)).toBe(false);
  });
});

describe("createDsseEnvelope / verifyDsseEnvelope", () => {
  it("round-trips: a payload signed by the Permit Issuer key verifies against its verification key", () => {
    const { signingKey, verificationKey } = generatePermitIssuerTestKey();
    const payload = Buffer.from(JSON.stringify({ hello: "permit" }), "utf8");
    const envelope = createDsseEnvelope(
      "application/vnd.workforce.execution-permit+json",
      payload,
      [signingKey],
    );

    expect(dsseEnvelope.safeParse(envelope).success).toBe(true);

    const result = verifyDsseEnvelope(envelope, [verificationKey]);
    expect(result.ok).toBe(true);
    expect(result.verifiedKeyIds).toEqual([signingKey.keyId]);
    expect(result.errors).toEqual([]);
  });

  it("fails verification if one byte of the payload changes after signing", () => {
    const { signingKey, verificationKey } = generatePermitIssuerTestKey();
    const payload = Buffer.from("original-payload", "utf8");
    const envelope = createDsseEnvelope("text/plain", payload, [signingKey]);

    const tamperedPayload = Buffer.from(envelope.payload, "base64");
    tamperedPayload[0] = tamperedPayload[0] ^ 0xff; // flip one byte
    const tampered = { ...envelope, payload: tamperedPayload.toString("base64") };

    const result = verifyDsseEnvelope(tampered, [verificationKey]);
    expect(result.ok).toBe(false);
  });

  it("fails verification against the wrong key (Permit Issuer signature checked with Outcome Attestor key)", () => {
    const permitIssuer = generatePermitIssuerTestKey();
    const outcomeAttestor = generateOutcomeAttestorTestKey();
    const payload = Buffer.from("payload", "utf8");
    const envelope = createDsseEnvelope("text/plain", payload, [permitIssuer.signingKey]);

    // The outcome attestor's verification key doesn't know this keyid at all,
    // so it must not silently accept.
    const result = verifyDsseEnvelope(envelope, [outcomeAttestor.verificationKey]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/no verification key known/);
  });

  it("Permit Issuer and Outcome Attestor are different key identities (distinct keyIds, distinct roles)", () => {
    const permitIssuer = generatePermitIssuerTestKey();
    const outcomeAttestor = generateOutcomeAttestorTestKey();
    expect(permitIssuer.signingKey.keyId).not.toBe(outcomeAttestor.signingKey.keyId);
    expect(permitIssuer.signingKey.role).toBe("permit-issuer");
    expect(outcomeAttestor.signingKey.role).toBe("outcome-attestor");
  });

  it("supports multiple signatures on one envelope", () => {
    const permitIssuer = generatePermitIssuerTestKey();
    const outcomeAttestor = generateOutcomeAttestorTestKey();
    const payload = Buffer.from("multi-signed", "utf8");
    const envelope = createDsseEnvelope("text/plain", payload, [
      permitIssuer.signingKey,
      outcomeAttestor.signingKey,
    ]);

    expect(envelope.signatures).toHaveLength(2);
    const result = verifyDsseEnvelope(envelope, [
      permitIssuer.verificationKey,
      outcomeAttestor.verificationKey,
    ]);
    expect(result.ok).toBe(true);
    expect(result.verifiedKeyIds.sort()).toEqual(
      [permitIssuer.signingKey.keyId, outcomeAttestor.signingKey.keyId].sort(),
    );
  });

  it("toVerificationKey derives the public counterpart of a signing key", () => {
    const { signingKey } = generatePermitIssuerTestKey();
    const derived = toVerificationKey(signingKey);
    const payload = Buffer.from("derived-key-check", "utf8");
    const envelope = createDsseEnvelope("text/plain", payload, [signingKey]);
    expect(verifyDsseEnvelope(envelope, [derived]).ok).toBe(true);
  });

  it("rejects an envelope with zero signing keys", () => {
    expect(() => createDsseEnvelope("text/plain", Buffer.from("x"), [])).toThrow();
  });
});
