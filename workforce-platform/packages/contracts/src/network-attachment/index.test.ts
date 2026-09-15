import { describe, expect, it } from "vitest";
import { NETWORK_ATTACHMENT_SPEC_SCHEMA, networkAttachmentSpec } from "./index.js";

const valid = {
  schema: NETWORK_ATTACHMENT_SPEC_SCHEMA,
  id: "net-attach-01",
  kind: "netbird-resource",
  resources: [{ id: "res-01", kind: "postgres", locator: "10.20.0.5/32" }],
  allowedFlows: [{ protocol: "TCP", port: 5432, direction: "egress", to: "res-01" }],
  tenantId: "tenant-01",
  workOrderId: "wo-01",
  cellId: "cell-01",
  expiresAt: "2026-08-29T12:00:00Z",
  evidenceRequired: true,
} as const;

describe("networkAttachmentSpec", () => {
  it("parses a valid spec", () => {
    const result = networkAttachmentSpec.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(networkAttachmentSpec.safeParse({ ...valid, unknownField: "nope" }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(networkAttachmentSpec.safeParse({ ...valid, kind: "internet" }).success).toBe(false);
  });

  it("rejects a spec missing a required field", () => {
    const { tenantId, ...withoutTenantId } = valid;
    expect(networkAttachmentSpec.safeParse(withoutTenantId).success).toBe(false);
  });

  it("rejects a resource ref with an unknown key", () => {
    expect(
      networkAttachmentSpec.safeParse({
        ...valid,
        resources: [{ ...valid.resources[0], secret: "nope" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a flow with an invalid protocol", () => {
    expect(
      networkAttachmentSpec.safeParse({
        ...valid,
        allowedFlows: [{ ...valid.allowedFlows[0], protocol: "HTTP" }],
      }).success,
    ).toBe(false);
  });
});
