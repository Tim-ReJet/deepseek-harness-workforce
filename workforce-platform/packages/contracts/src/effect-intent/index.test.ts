import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectIntent } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "effect-intent.json"), "utf8"),
);

describe("effectIntent", () => {
  it("round-trips the fixture", () => {
    expect(effectIntent.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(effectIntent.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("rejects an unknown key on target", () => {
    expect(
      effectIntent.safeParse({ ...fixture, target: { ...fixture.target, extra: "nope" } })
        .success,
    ).toBe(false);
  });

  it("tolerates target without an optional version", () => {
    const { version: _omit, ...target } = fixture.target;
    expect(effectIntent.safeParse({ ...fixture, target }).success).toBe(true);
  });

  it("accepts an arbitrary desiredChange payload", () => {
    expect(
      effectIntent.safeParse({ ...fixture, desiredChange: { anything: [1, 2, 3] } }).success,
    ).toBe(true);
  });

  it("accepts empty preconditions", () => {
    expect(effectIntent.safeParse({ ...fixture, preconditions: [] }).success).toBe(true);
  });

  it("rejects an empty idempotencyKey", () => {
    expect(effectIntent.safeParse({ ...fixture, idempotencyKey: "" }).success).toBe(false);
  });

  it("rejects a non-positive effectVersion", () => {
    expect(effectIntent.safeParse({ ...fixture, effectVersion: 0 }).success).toBe(false);
  });
});
