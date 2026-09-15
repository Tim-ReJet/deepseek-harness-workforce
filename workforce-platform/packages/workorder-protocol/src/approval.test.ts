import { describe, expect, it } from "vitest";
import { parseApprovalToken } from "./approval.js";

function token() {
  return {
    workOrderId: "01J00000000000000000000000",
    planHash: "a".repeat(64),
    approver: { id: "human:owner", kind: "human" as const },
    issuedAt: "2026-08-10T10:00:00.000Z",
    expiresAt: "2099-08-10T10:00:00.000Z",
    signature: "signed-token",
  };
}

describe("approval token operation commitment", () => {
  it("preserves a valid operation-set hash", () => {
    expect(parseApprovalToken({
      ...token(),
      operationSetHash: "b".repeat(64),
    }).operationSetHash).toBe("b".repeat(64));
  });

  it("keeps the field optional for non-mutating compatibility", () => {
    expect(parseApprovalToken(token()).operationSetHash).toBeUndefined();
  });

  it("rejects a malformed operation-set hash", () => {
    expect(() => parseApprovalToken({
      ...token(),
      operationSetHash: "not-a-sha256",
    })).toThrow();
  });
});
