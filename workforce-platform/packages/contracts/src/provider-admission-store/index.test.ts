import { describe, expect, it } from "vitest";
import { generateToolAdmitterTestKey, toVerificationKey } from "../common/dsse.js";
import {
  InMemoryProviderAdmissionStore,
  UnknownProviderAdmissionRecordError,
} from "./index.js";
import type { ProviderAdmissionRecord } from "../provider-admission-record/index.js";

function baseRecord(
  overrides: Partial<Omit<ProviderAdmissionRecord, "digest" | "signature">> = {},
): Omit<ProviderAdmissionRecord, "digest" | "signature"> {
  return {
    schema: "workforce.provider-admission/v1",
    id: "provider-dsh-slack-notify",
    type: "dsh-plugin",
    source: {
      publisher: {
        id: "reactorjet-supply-chain",
        kind: "service",
        issuer: "https://auth.example.com",
      },
      version: "2.3.1",
      digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
    version: "2.3.1",
    provenanceRef: {
      digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    },
    testEvidenceRefs: [
      { digest: "sha256:6666666666666666666666666666666666666666666666666666666666666666" },
    ],
    capabilities: ["notify.slack.post_message"],
    effectClasses: ["notify.slack.post_message"],
    requiredIsolation: "STANDARD",
    status: "ADMITTED",
    admittedAt: "2026-08-28T07:00:00Z",
    admittedBy: {
      id: "provider-reviewer",
      kind: "human",
      issuer: "https://auth.example.com",
    },
    dependsOn: [],
    ...overrides,
  };
}

describe("InMemoryProviderAdmissionStore", () => {
  it("admit() signs a record and get() returns the stored/signed copy", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey, verificationKey } = generateToolAdmitterTestKey();

    const admitted = store.admit(baseRecord(), signingKey);

    expect(admitted.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(admitted.signature.length).toBeGreaterThan(0);
    expect(store.get(admitted.id)).toEqual(admitted);

    const verified = store.verify(admitted, [verificationKey]);
    expect(verified.ok).toBe(true);
    expect(verified.verifiedKeyIds).toEqual([signingKey.keyId]);
  });

  it("verify() fails against a tampered payload", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey, verificationKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const tampered: ProviderAdmissionRecord = {
      ...admitted,
      capabilities: [...admitted.capabilities, "notify.slack.delete_message"],
    };

    expect(store.verify(tampered, [verificationKey]).ok).toBe(false);
  });

  it("verify() fails against a wrong-keyid verification key", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const otherKey = generateToolAdmitterTestKey("some-other-keyid");
    const result = store.verify(admitted, [otherKey.verificationKey]);
    expect(result.ok).toBe(false);
  });

  it("revoke() sets status to REVOKED and excludes it from listByStatus('ADMITTED')", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    expect(store.listByStatus("ADMITTED")).toHaveLength(1);

    const revoked = store.revoke(admitted.id, "compromised dependency");
    expect(revoked.status).toBe("REVOKED");
    expect(store.listByStatus("ADMITTED")).toHaveLength(0);
    expect(store.listByStatus("REVOKED").map((r) => r.id)).toEqual([admitted.id]);
  });

  it("revoke() throws UnknownProviderAdmissionRecordError for an unknown id", () => {
    const store = new InMemoryProviderAdmissionStore();
    expect(() => store.revoke("does-not-exist", "n/a")).toThrow(
      UnknownProviderAdmissionRecordError,
    );
  });

  it("impactedBy() returns ids of records that depend on the given provider", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();

    store.admit(baseRecord({ id: "base-provider" }), signingKey);
    store.admit(
      baseRecord({ id: "dependent-provider", dependsOn: ["base-provider"] }),
      signingKey,
    );
    store.admit(baseRecord({ id: "unrelated-provider" }), signingKey);

    expect(store.impactedBy("base-provider")).toEqual(["dependent-provider"]);
    expect(store.impactedBy("no-such-provider")).toEqual([]);
  });

  it("resetForTest() clears all stored records", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    store.admit(baseRecord(), signingKey);
    expect(store.listByStatus("ADMITTED")).toHaveLength(1);

    store.resetForTest();
    expect(store.listByStatus("ADMITTED")).toHaveLength(0);
  });

  it("toVerificationKey derives a working verification key from the signing key", () => {
    const store = new InMemoryProviderAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const derived = toVerificationKey(signingKey);
    expect(store.verify(admitted, [derived]).ok).toBe(true);
  });
});
