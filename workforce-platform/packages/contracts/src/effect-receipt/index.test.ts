import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectReceipt } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "effect-receipt.json"), "utf8"),
);

describe("effectReceipt", () => {
  it("round-trips the fixture", () => {
    expect(effectReceipt.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(effectReceipt.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("restricts state to the plan 15 receipt states", () => {
    expect(effectReceipt.safeParse({ ...fixture, state: "PENDING" }).success).toBe(false);
  });

  it("tolerates a receipt without providerId/externalEffectId", () => {
    const { providerId: _p, externalEffectId: _e, ...rest } = fixture;
    expect(effectReceipt.safeParse(rest).success).toBe(true);
  });

  it("accepts every declared receipt state", () => {
    for (const state of ["COMMITTED", "FAILED", "UNKNOWN", "COMPENSATED", "COMPENSATION_FAILED"]) {
      expect(effectReceipt.safeParse({ ...fixture, state }).success).toBe(true);
    }
  });
});
