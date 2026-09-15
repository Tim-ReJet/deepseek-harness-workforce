import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { delegationPlan } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "delegation-plan.json"), "utf8"),
);

describe("delegationPlan", () => {
  it("round-trips the pack example fixture", () => {
    expect(delegationPlan.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(delegationPlan.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      delegationPlan.safeParse({ ...fixture, extensions: { "workforce.audit": { note: "x" } } })
        .success,
    ).toBe(true);
  });

  it("references WorkOrder only by digest, not by embedding it", () => {
    const parsed = delegationPlan.parse(fixture);
    expect(parsed.workOrder).toEqual({ digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
  });

  it("seals ownedPaths on workers (ADR-029 grant source)", () => {
    const parsed = delegationPlan.parse(fixture);
    expect(parsed.workers?.[0]?.ownedPaths).toContain("packages/api/");
  });
});
