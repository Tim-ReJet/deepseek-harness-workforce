import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validationSpec } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "validation-spec.json"), "utf8"),
);

describe("validationSpec", () => {
  it("round-trips the pack example fixture", () => {
    expect(validationSpec.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(validationSpec.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      validationSpec.safeParse({ ...fixture, extensions: { "browser-validator": { seed: 1 } } })
        .success,
    ).toBe(true);
  });

  it("names an explicit indeterminate case so missing evidence can't become PASS", () => {
    const parsed = validationSpec.parse(fixture);
    expect(parsed.verdictPolicy.indeterminate.length).toBeGreaterThan(0);
  });
});
