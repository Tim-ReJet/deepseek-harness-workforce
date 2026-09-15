import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectDefinition } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "effect-definition.json"), "utf8"),
);

describe("effectDefinition", () => {
  it("round-trips the scm.branch.push fixture", () => {
    expect(effectDefinition.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(effectDefinition.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("defaults requiredEvidence to an empty array when omitted", () => {
    const { requiredEvidence: _omit, ...rest } = fixture;
    const result = effectDefinition.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiredEvidence).toEqual([]);
    }
  });

  it("restricts category to the plan 15 enum", () => {
    expect(effectDefinition.safeParse({ ...fixture, category: "destructive" }).success).toBe(
      false,
    );
  });

  it("restricts defaultRiskClass to C0-C4", () => {
    expect(effectDefinition.safeParse({ ...fixture, defaultRiskClass: "C5" }).success).toBe(
      false,
    );
  });

  it("rejects a non-positive version", () => {
    expect(effectDefinition.safeParse({ ...fixture, version: 0 }).success).toBe(false);
  });
});
