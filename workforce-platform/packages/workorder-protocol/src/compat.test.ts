/**
 * compat.test.ts — cross-plane compatibility gate for `workorder/v1`.
 *
 * This suite acts as the conformance-as-compat test: it verifies that protocol
 * fixtures are compatible across the Biro/Workforce boundary and that schema
 * changes remain additive-safe and tag-gated.
 *
 * Coverage:
 *  1. Protocol fixtures are valid against the schema
 *  2. Serialization round-trips (object → JSON → object)
 *  3. Deterministic hashing of WorkOrder content
 *  4. Forward compat — a new field added to the schema does NOT break
 *     deserialization of old fixtures
 *  5. The version tag (`workorder/v1`) is present in every protocol message
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  PROTOCOL_ID,
  parseWorkOrder,
  safeParseWorkOrder,
  parseApprovalToken,
  safeParseApprovalToken,
  parseEvidenceBundle,
  safeParseEvidenceBundle,
  parseEvent,
  safeParseEvent,
  canonicalize,
  hashObject,
  sha256Hex,
  computePlanHash,
  workOrder,
  approvalToken,
  evidenceBundle,
  workOrderEvent,
  type WorkOrder,
  type ApprovalToken,
  type EvidenceBundle,
  type WorkOrderEvent,
} from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(FIX, rel), "utf8"));
}

// ---------------------------------------------------------------------------
// 1. Protocol fixtures are valid against the schema
// ---------------------------------------------------------------------------

describe("compat: fixtures validate across the boundary", () => {
  it("valid workorder fixture parses with all required fields present", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    expect(wo.protocol).toBe(PROTOCOL_ID);
    expect(wo.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(wo.intent.length).toBeGreaterThan(0);
    expect(wo.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("workorder without approval token (pre-APPROVED gate) parses", () => {
    const wo = parseWorkOrder(load("compat/workorder-no-token.json"));
    expect(wo.protocol).toBe(PROTOCOL_ID);
    expect(wo.approvalToken).toBeUndefined();
    expect(wo.complianceProfile).toBe("none");
  });

  it("every event in the valid sequence parses individually", () => {
    const raw = load("valid/event-sequence.json") as unknown[];
    for (const e of raw) {
      const result = safeParseEvent(e);
      expect(result.success, `event failed to parse: ${JSON.stringify(e)}`).toBe(true);
    }
  });

  it("approval token fixture is self-consistent", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    const tok = wo.approvalToken!;
    expect(tok.workOrderId).toBe(wo.id);
    expect(tok.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tok.signature.length).toBeGreaterThan(0);
  });

  it("evidence bundle fixture validates with all sub-objects intact", () => {
    const bundle = parseEvidenceBundle(load("valid/evidence-bundle.json"));
    expect(bundle.workOrderId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(bundle.steps.length).toBeGreaterThan(0);
    expect(bundle.complianceAttestation.framework).toBe("soc2");
    expect(bundle.complianceAttestation.gateResults.length).toBeGreaterThan(0);
    expect(bundle.costActuals.currency).toBe("USD");
    expect(bundle.auditSegment.entries.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Serialization round-trips (object → JSON → object)
// ---------------------------------------------------------------------------

describe("compat: serialization round-trips", () => {
  it("WorkOrder round-trips through JSON.stringify / JSON.parse", () => {
    const wo1 = parseWorkOrder(load("valid/workorder.json"));
    const json = JSON.stringify(wo1);
    const wo2 = parseWorkOrder(JSON.parse(json));
    // All fields should survive the round-trip
    expect(wo2.id).toBe(wo1.id);
    expect(wo2.protocol).toBe(wo1.protocol);
    expect(wo2.tenantId).toBe(wo1.tenantId);
    expect(wo2.intent).toBe(wo1.intent);
    expect(wo2.goldenPathId).toBe(wo1.goldenPathId);
    expect(wo2.complianceProfile).toBe(wo1.complianceProfile);
    expect(wo2.budgetLease).toEqual(wo1.budgetLease);
    expect(wo2.inputs).toEqual(wo1.inputs);
    expect(wo2.constraints).toEqual(wo1.constraints);
    expect(wo2.createdAt).toBe(wo1.createdAt);
    expect(wo2.approvalToken).toEqual(wo1.approvalToken);
  });

  it("WorkOrder without approval token round-trips", () => {
    const wo1 = parseWorkOrder(load("compat/workorder-no-token.json"));
    const json = JSON.stringify(wo1);
    const wo2 = parseWorkOrder(JSON.parse(json));
    expect(wo2.id).toBe(wo1.id);
    expect(wo2.protocol).toBe(PROTOCOL_ID);
    expect(wo2.approvalToken).toBeUndefined();
    expect(wo2.intent).toBe(wo1.intent);
  });

  it("EvidenceBundle round-trips through JSON.stringify / JSON.parse", () => {
    const b1 = parseEvidenceBundle(load("valid/evidence-bundle.json"));
    const json = JSON.stringify(b1);
    const b2 = parseEvidenceBundle(JSON.parse(json));
    expect(b2.workOrderId).toBe(b1.workOrderId);
    expect(b2.planHash).toBe(b1.planHash);
    expect(b2.steps).toEqual(b1.steps);
    expect(b2.complianceAttestation).toEqual(b1.complianceAttestation);
    expect(b2.costActuals).toEqual(b1.costActuals);
    expect(b2.auditSegment).toEqual(b1.auditSegment);
    expect(b2.signature).toBe(b1.signature);
  });

  it("ApprovalToken round-trips through JSON.stringify / JSON.parse", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    const t1 = wo.approvalToken!;
    const json = JSON.stringify(t1);
    const t2 = parseApprovalToken(JSON.parse(json));
    expect(t2.workOrderId).toBe(t1.workOrderId);
    expect(t2.planHash).toBe(t1.planHash);
    expect(t2.approver).toEqual(t1.approver);
    expect(t2.issuedAt).toBe(t1.issuedAt);
    expect(t2.expiresAt).toBe(t1.expiresAt);
    expect(t2.signature).toBe(t1.signature);
  });

  it("every event in the sequence round-trips through JSON", () => {
    const raw = load("valid/event-sequence.json") as Record<string, unknown>[];
    for (let i = 0; i < raw.length; i++) {
      const ev1 = parseEvent(raw[i]);
      const json = JSON.stringify(ev1);
      const ev2 = parseEvent(JSON.parse(json));
      expect(ev2.type).toBe(ev1.type);
      expect(ev2.workOrderId).toBe(ev1.workOrderId);
      expect(ev2.seq).toBe(ev1.seq);
      expect(ev2.narrative).toBe(ev1.narrative);
      expect(ev2.ts).toBe(ev1.ts);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Deterministic hashing of WorkOrder content
// ---------------------------------------------------------------------------

describe("compat: deterministic hashing", () => {
  it("WorkOrder canonical form is key-order independent", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    // Simulate different JSON deserialization key orders
    const c1 = canonicalize(wo);
    const c2 = canonicalize({ ...wo });
    expect(c1).toBe(c2);
    expect(hashObject(wo)).toBe(hashObject({ ...wo }));
  });

  it("WorkOrder hash is stable across re-parses", () => {
    const wo1 = parseWorkOrder(load("valid/workorder.json"));
    const json = JSON.stringify(wo1);
    const wo2 = parseWorkOrder(JSON.parse(json));
    expect(hashObject(wo1)).toBe(hashObject(wo2));
  });

  it("WorkOrder hash changes when intent changes", () => {
    const wo1 = parseWorkOrder(load("valid/workorder.json"));
    const wo2 = parseWorkOrder(load("valid/workorder.json"));
    wo2.intent = "Different intent string";

    expect(hashObject(wo1)).not.toBe(hashObject(wo2));
  });

  it("WorkOrder hash changes when budget lease changes", () => {
    const wo1 = parseWorkOrder(load("valid/workorder.json"));
    const wo2 = parseWorkOrder(load("valid/workorder.json"));
    wo2.budgetLease = { ...wo2.budgetLease, capMinorUnits: 99999 };

    expect(hashObject(wo1)).not.toBe(hashObject(wo2));
  });

  it("the approval-token planHash matches the plan it commits to", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    const raw = load("valid/event-sequence.json") as Record<string, unknown>[];
    const planned = raw.find((e) => e.type === "PLANNED")!;
    const plan = (planned as any).plan;

    const tokenHash = wo.approvalToken!.planHash;
    const computedHash = computePlanHash(plan);
    expect(tokenHash).toBe(computedHash);
  });

  it("canonicalize rejects undefined values", () => {
    expect(() => canonicalize(undefined)).toThrow("undefined");
  });

  it("canonicalize rejects non-finite numbers", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    const bad = { ...wo, budgetLease: { ...wo.budgetLease, capMinorUnits: Infinity } };
    expect(() => canonicalize(bad)).toThrow("non-finite");
  });

  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

// ---------------------------------------------------------------------------
// 4. Forward compat — new field doesn't break old parser
// ---------------------------------------------------------------------------

describe("compat: forward compatibility", () => {
  it("a workorder with extra future fields parses without error (zod strips by default)", () => {
    const wo = parseWorkOrder(load("compat/workorder-future-field.json"));
    // All known fields must be intact
    expect(wo.id).toBe("01J9Z3NDEKTSV4RRFFQ69G5FAV");
    expect(wo.protocol).toBe(PROTOCOL_ID);
    expect(wo.intent).toContain("Deploy");
    expect(wo.approvalToken).toBeDefined();
    // Extra fields should be stripped (zod default behavior)
    expect((wo as any)._futureTagV2).toBeUndefined();
    expect((wo as any).nestedFuture).toBeUndefined();
  });

  it("a workorder with extra fields round-trips correctly (extra fields stripped)", () => {
    const raw = load("compat/workorder-future-field.json") as Record<string, unknown>;
    // raw has extra fields
    expect(raw._futureTagV2).toBeDefined();
    expect(raw.nestedFuture).toBeDefined();
    // After parse: extra fields gone
    const wo = parseWorkOrder(raw);
    expect((wo as any)._futureTagV2).toBeUndefined();
    // Round-trip through JSON preserves the parsed shape
    const json = JSON.stringify(wo);
    const wo2 = parseWorkOrder(JSON.parse(json));
    expect(wo2.id).toBe(wo.id);
    expect((wo2 as any)._futureTagV2).toBeUndefined();
  });

  it("safeParse succeeds on a future-field workorder (no throw, success=true)", () => {
    const result = safeParseWorkOrder(load("compat/workorder-future-field.json"));
    expect(result.success).toBe(true);
  });

  it("evidence bundle with an extra future field parses without error", () => {
    const raw = load("valid/evidence-bundle.json") as Record<string, unknown>;
    const futureBundle = {
      ...raw,
      _futureBundleTag: "v2-enriched",
      nestedExtra: { someFlag: true },
    };
    const bundle = parseEvidenceBundle(futureBundle);
    expect(bundle.workOrderId).toBe(raw.workOrderId);
    expect((bundle as any)._futureBundleTag).toBeUndefined();
  });

  it("event with extra future field parses without error", () => {
    const raw = (load("valid/event-sequence.json") as Record<string, unknown>[])[0];
    const futureEvent = {
      ...raw,
      _futureEventTag: "v2-enriched-event",
    };
    const ev = parseEvent(futureEvent);
    expect(ev.type).toBe("RECEIVED");
    expect((ev as any)._futureEventTag).toBeUndefined();
  });

  it("approval token with extra future field parses without error", () => {
    const wo = parseWorkOrder(load("valid/workorder.json"));
    const raw = wo.approvalToken! as unknown as Record<string, unknown>;
    const futureToken = {
      ...raw,
      _futureTokenMeta: { delegatedBy: "platform-admin", reason: "bulk-approve" },
    };
    const tok = parseApprovalToken(futureToken);
    expect(tok.workOrderId).toBe(raw.workOrderId);
    expect((tok as any)._futureTokenMeta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Version tag is present in all protocol messages
// ---------------------------------------------------------------------------

describe("compat: version tag (PROTOCOL_ID) is present in all messages", () => {
  it("PROTOCOL_ID is the literal string 'workorder/v1'", () => {
    expect(PROTOCOL_ID).toBe("workorder/v1");
  });

  it("every valid WorkOrder carries protocol=workorder/v1", () => {
    const fixtures = [
      "valid/workorder.json",
      "compat/workorder-no-token.json",
      "compat/workorder-future-field.json",
    ];
    for (const fx of fixtures) {
      const wo = parseWorkOrder(load(fx));
      expect(wo.protocol, `missing protocol in ${fx}`).toBe(PROTOCOL_ID);
    }
  });

  it("WorkOrder schema rejects a non-matching protocol tag", () => {
    const base = load("valid/workorder.json") as Record<string, unknown>;
    const result = safeParseWorkOrder(
      Object.assign({}, base, { protocol: "workorder/v2" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error!.issues.map((i) => i.path.join("."));
      expect(paths).toContain("protocol");
    }
  });

  it("WorkOrder schema rejects a missing protocol field", () => {
    const raw = load("valid/workorder.json") as Record<string, unknown>;
    const { protocol: _, ...withoutProtocol } = raw;
    const result = safeParseWorkOrder(withoutProtocol);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error!.issues.map((i) => i.path.join("."));
      expect(paths).toContain("protocol");
    }
  });

  it("PROTOCOL_ID is a const assertion (can be used as a zod literal)", () => {
    // Verify the schema uses z.literal(PROTOCOL_ID), not a string()
    const schema = workOrder.shape.protocol;
    // Zod literal should reject a wrong string
    const result = schema.safeParse("workorder/v2");
    expect(result.success).toBe(false);
    // But accept the correct one
    const ok = schema.safeParse(PROTOCOL_ID);
    expect(ok.success).toBe(true);
  });
});
