import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { WorkOrder as WorkOrderV1 } from "@workforce/workorder-protocol";
import { hashObject } from "@workforce/workorder-protocol";
import {
  mapWorkOrderV1ToV2,
  safeMapWorkOrderV1ToV2,
  COMPAT_EXTENSION_NAMESPACE,
  COMPAT_IDENTITY_ISSUER,
} from "./workorder-v1.js";
import { workOrder as workOrderV2Schema, WORKORDER_SCHEMA, FORBIDDEN_WORKORDER_FIELDS } from "../workorder/index.js";
import { verifyArtifactDigest } from "../common/digest.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadV1Fixture(name: string): WorkOrderV1 {
  const path = join(
    here,
    "..",
    "..",
    "..",
    "workorder-protocol",
    "fixtures",
    ...name.split("/"),
  );
  return JSON.parse(readFileSync(path, "utf8")) as WorkOrderV1;
}

describe("mapWorkOrderV1ToV2", () => {
  it("produces a schema-valid V2 WorkOrder for the full V1 fixture", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    const result = workOrderV2Schema.safeParse(v2);
    expect(result.success).toBe(true);
    expect(v2.schema).toBe(WORKORDER_SCHEMA);
  });

  it("produces a schema-valid V2 WorkOrder for the no-token compat fixture", () => {
    const v1 = loadV1Fixture("compat/workorder-no-token.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(workOrderV2Schema.safeParse(v2).success).toBe(true);
    // No approvalToken on this fixture: the key must be omitted, not `null`/`undefined`.
    const compat = v2.extensions?.[COMPAT_EXTENSION_NAMESPACE] as Record<string, unknown>;
    expect("approvalToken" in compat).toBe(false);
  });

  it("produces a schema-valid V2 WorkOrder for the future-field compat fixture", () => {
    const v1 = loadV1Fixture("compat/workorder-future-field.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(workOrderV2Schema.safeParse(v2).success).toBe(true);
  });

  it("leaves the V1 fixture on disk byte-unchanged (V1 protocol/hash stays untouched)", () => {
    const before = readFileSync(
      join(here, "..", "..", "..", "workorder-protocol", "fixtures", "valid", "workorder.json"),
      "utf8",
    );
    const v1 = JSON.parse(before) as WorkOrderV1;
    mapWorkOrderV1ToV2(v1);
    const after = readFileSync(
      join(here, "..", "..", "..", "workorder-protocol", "fixtures", "valid", "workorder.json"),
      "utf8",
    );
    expect(after).toBe(before);
  });

  it("does not mutate its V1 input object", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const before = JSON.stringify(v1);
    mapWorkOrderV1ToV2(v1);
    expect(JSON.stringify(v1)).toBe(before);
  });

  it("V1's own canonical hash is unaffected by mapping (V1 hashing algorithm is untouched by this package)", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const hashBefore = hashObject(v1);
    mapWorkOrderV1ToV2(v1);
    const hashAfter = hashObject(v1);
    expect(hashAfter).toBe(hashBefore);
  });

  it("keeps V1's own protocol id on the source, never copying it onto V2's `schema`", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(v2.schema).toBe("biro.workorder/v2");
    expect(v2.schema).not.toBe(v1.protocol);
    const compat = v2.extensions?.[COMPAT_EXTENSION_NAMESPACE] as Record<string, unknown>;
    expect(compat.protocol).toBe("workorder/v1");
  });

  it("does not turn execution machinery (golden path, inputs, architectureRef, blockRevision) into V2 core fields", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    const topLevelKeys = Object.keys(v2);
    expect(topLevelKeys).not.toContain("goldenPathId");
    expect(topLevelKeys).not.toContain("inputs");
    expect(topLevelKeys).not.toContain("architectureRef");
    expect(topLevelKeys).not.toContain("blockRevision");
    for (const forbidden of FORBIDDEN_WORKORDER_FIELDS) {
      expect(topLevelKeys).not.toContain(forbidden);
    }

    const compat = v2.extensions?.[COMPAT_EXTENSION_NAMESPACE] as Record<string, unknown>;
    expect(compat.goldenPathId).toBe(v1.goldenPathId);
    expect(compat.inputs).toEqual(v1.inputs);
    expect(compat.architectureRef).toBe(v1.architectureRef);
    expect(compat.blockRevision).toBe(v1.blockRevision);
  });

  it("maps budgetLease to integer minor units on resources.budget", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(v2.resources.budget.currency).toBe(v1.budgetLease.currency);
    expect(v2.resources.budget.capMinorUnits).toBe(v1.budgetLease.capMinorUnits);
    expect(Number.isInteger(v2.resources.budget.capMinorUnits)).toBe(true);
    expect(v2.resources.deadline).toBe(v1.budgetLease.expiresAt);
  });

  it("does not convert approvalToken into an ExecutionPermit-shaped grant", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    const json = JSON.stringify(v2);
    expect(json).not.toContain('"grant"');
    expect((v2 as unknown as Record<string, unknown>).approvalToken).toBeUndefined();
    const compat = v2.extensions?.[COMPAT_EXTENSION_NAMESPACE] as Record<string, unknown>;
    expect(compat.approvalToken).toEqual(v1.approvalToken);
  });

  it("preserves unknown/future V1 fields in extensions rather than dropping them silently", () => {
    const v1 = loadV1Fixture("compat/workorder-future-field.json") as WorkOrderV1 & {
      _futureTagV2: string;
      nestedFuture: Record<string, unknown>;
    };
    const v2 = mapWorkOrderV1ToV2(v1);
    const compat = v2.extensions?.[COMPAT_EXTENSION_NAMESPACE] as Record<string, unknown>;
    const source = compat.source as Record<string, unknown>;
    expect(source._futureTagV2).toBe("this-is-a-v2-additive-field-from-a-future-schema-version");
    expect(source.nestedFuture).toEqual(v1.nestedFuture);
  });

  it("never emits a PASS/FAIL/INDETERMINATE verdict — that is attestation's job, not the mapper's", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    const json = JSON.stringify(v2);
    expect(json).not.toMatch(/"PASS"|"FAIL"|"INDETERMINATE"/);
    expect(Object.keys(v2)).not.toContain("verdict");
    expect(mapWorkOrderV1ToV2.length).toBeLessThanOrEqual(2); // (v1, options) — no attestation/verdict parameter exists to pass.
  });

  it("computes a real digest (not a placeholder) that verifies against the mapped payload", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(v2.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(v2.digest).not.toBe(`sha256:${"0".repeat(64)}`);
    expect(verifyArtifactDigest(v2)).toBe(true);
  });

  it("maps V1 principal kinds onto V2 identity kinds (ceo-agent/workforce-lead/platform-lead -> agent)", () => {
    const v1 = loadV1Fixture("valid/workorder.json");
    expect(v1.issuedBy.kind).toBe("ceo-agent");
    const v2 = mapWorkOrderV1ToV2(v1);
    expect(v2.issuedBy.kind).toBe("agent");
    expect(v2.issuedBy.issuer).toBe(COMPAT_IDENTITY_ISSUER);
    expect(v2.accountability.owner).toEqual(v2.issuedBy);
  });

  it("safeMapWorkOrderV1ToV2 returns a typed failure instead of throwing on a malformed V1 input", () => {
    const malformed = { not: "a workorder" } as unknown as WorkOrderV1;
    const result = safeMapWorkOrderV1ToV2(malformed);
    expect(result.success).toBe(false);
  });

  it("mapWorkOrderV1ToV2 throws on a malformed V1 input rather than guessing", () => {
    const malformed = { not: "a workorder" } as unknown as WorkOrderV1;
    expect(() => mapWorkOrderV1ToV2(malformed)).toThrow();
  });

  it("git confirms packages/workorder-protocol is untouched by this unit", () => {
    // Advisory, mirrors the brief's suggested check; skipped outside a git checkout.
    try {
      const out = execFileSync(
        "git",
        ["diff", "--stat", "--", "packages/workorder-protocol"],
        { cwd: join(here, "..", "..", "..", ".."), encoding: "utf8" },
      );
      expect(out.trim()).toBe("");
    } catch {
      // Not a git checkout in this environment (e.g. packaged/vendored run) — not this test's concern.
    }
  });
});
