import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actionIntent } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "action-intent.json"), "utf8"),
);

describe("actionIntent", () => {
  it("round-trips the fixture", () => {
    expect(actionIntent.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(actionIntent.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { semanticAction: _semanticAction, ...rest } = fixture;
    expect(actionIntent.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown key on target/toolBinding", () => {
    expect(
      actionIntent.safeParse({ ...fixture, target: { ...fixture.target, extra: "x" } }).success,
    ).toBe(false);
    expect(
      actionIntent.safeParse({
        ...fixture,
        toolBinding: { ...fixture.toolBinding, extra: "x" },
      }).success,
    ).toBe(false);
  });
});
