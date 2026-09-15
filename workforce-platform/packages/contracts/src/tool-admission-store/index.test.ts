import { describe, expect, it } from "vitest";
import { generateToolAdmitterTestKey, toVerificationKey } from "../common/dsse.js";
import {
  InMemoryToolAdmissionStore,
  UnknownToolAdmissionRecordError,
} from "./index.js";
import type { ToolAdmissionRecord } from "../tool-admission-record/index.js";

function baseRecord(
  overrides: Partial<Omit<ToolAdmissionRecord, "digest" | "signature">> = {},
): Omit<ToolAdmissionRecord, "digest" | "signature"> {
  return {
    schema: "workforce.tool-admission/v1",
    id: "tool-github-mcp-create-pr",
    identity: {
      providerType: "mcp",
      serverOrPackageId: "github-mcp",
      version: "1.0.0",
      sourceDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      toolName: "create_pull_request",
      inputSchemaDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    },
    canonicalCapabilities: ["scm.pull_request.create"],
    effectClasses: ["scm.pull_request.create"],
    runtimeRequirements: {
      isolationClass: "STANDARD",
      filesystem: { capabilities: [] },
      network: { hosts: ["api.github.com"] },
      credentials: [{ brokerKey: "github/execution-app" }],
      resources: { maxSeconds: 60 },
    },
    outputPolicy: {
      maxBytes: 1048576,
      treatAsData: true,
      secretRedaction: true,
    },
    admittedBy: {
      id: "provider-reviewer",
      kind: "human",
      issuer: "https://auth.example.com",
    },
    admittedAt: "2026-08-28T07:00:00Z",
    status: "ADMITTED",
    provenanceRef: {
      digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    },
    testEvidenceRefs: [
      { digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444" },
    ],
    extensions: {},
    ...overrides,
  };
}

describe("InMemoryToolAdmissionStore", () => {
  it("admit() signs a record and get() returns the stored/signed copy", () => {
    const store = new InMemoryToolAdmissionStore();
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
    const store = new InMemoryToolAdmissionStore();
    const { signingKey, verificationKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const tampered: ToolAdmissionRecord = {
      ...admitted,
      canonicalCapabilities: [...admitted.canonicalCapabilities, "scm.pull_request.merge"],
    };

    expect(store.verify(tampered, [verificationKey]).ok).toBe(false);
  });

  it("verify() fails against a wrong-keyid verification key", () => {
    const store = new InMemoryToolAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const otherKey = generateToolAdmitterTestKey("some-other-keyid");
    const result = store.verify(admitted, [otherKey.verificationKey]);
    expect(result.ok).toBe(false);
  });

  it("revoke() sets status to REVOKED and excludes it from listByStatus('ADMITTED')", () => {
    const store = new InMemoryToolAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    expect(store.listByStatus("ADMITTED")).toHaveLength(1);

    const revoked = store.revoke(admitted.id, "compromised dependency");
    expect(revoked.status).toBe("REVOKED");
    expect(store.listByStatus("ADMITTED")).toHaveLength(0);
    expect(store.listByStatus("REVOKED").map((r) => r.id)).toEqual([admitted.id]);
  });

  it("revoke() throws UnknownToolAdmissionRecordError for an unknown id", () => {
    const store = new InMemoryToolAdmissionStore();
    expect(() => store.revoke("does-not-exist", "n/a")).toThrow(
      UnknownToolAdmissionRecordError,
    );
  });

  it("resetForTest() clears all stored records", () => {
    const store = new InMemoryToolAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    store.admit(baseRecord(), signingKey);
    expect(store.listByStatus("ADMITTED")).toHaveLength(1);

    store.resetForTest();
    expect(store.listByStatus("ADMITTED")).toHaveLength(0);
  });

  it("toVerificationKey derives a working verification key from the signing key", () => {
    const store = new InMemoryToolAdmissionStore();
    const { signingKey } = generateToolAdmitterTestKey();
    const admitted = store.admit(baseRecord(), signingKey);

    const derived = toVerificationKey(signingKey);
    expect(store.verify(admitted, [derived]).ok).toBe(true);
  });
});
