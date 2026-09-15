import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executionPermit } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "execution-permit.json"), "utf8"),
);
const networkGrantFixture = JSON.parse(
  readFileSync(
    join(here, "..", "..", "fixtures", "execution-permit-network-grant.json"),
    "utf8",
  ),
);

describe("executionPermit", () => {
  it("round-trips the pack example fixture", () => {
    expect(executionPermit.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(executionPermit.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      executionPermit.safeParse({ ...fixture, extensions: { "workforce.cell": { hint: "x" } } })
        .success,
    ).toBe(true);
  });

  it("types grant.capabilities/effects as narrowable lists", () => {
    const parsed = executionPermit.parse(fixture);
    expect(Array.isArray(parsed.grant.capabilities)).toBe(true);
    expect(Array.isArray(parsed.grant.effects)).toBe(true);

    // A later re-issuance subsetting the grant must still validate.
    const narrowed = {
      ...fixture,
      grant: { ...fixture.grant, capabilities: [fixture.grant.capabilities[0]], effects: [] },
    };
    expect(executionPermit.safeParse(narrowed).success).toBe(true);
  });

  it("carries signature as an opaque string, no key material", () => {
    const parsed = executionPermit.parse(fixture);
    expect(typeof parsed.signature).toBe("string");
  });

  // CONTRACT-004: additive grant.networkAccess field.
  it("still validates the base fixture with grant.networkAccess absent", () => {
    const parsed = executionPermit.parse(fixture);
    expect(parsed.grant.networkAccess).toBeUndefined();
  });

  it("validates the network-grant fixture with grant.networkAccess present", () => {
    const result = executionPermit.safeParse(networkGrantFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grant.networkAccess).toEqual([
        { destination: "registry.npmjs.org", purpose: "dependency installation" },
      ]);
    }
  });

  it("treats an absent networkAccess and an empty networkAccess as equally 'no network grant' at the shape level", () => {
    const absent = executionPermit.parse(fixture);
    const empty = executionPermit.parse({
      ...fixture,
      grant: { ...fixture.grant, networkAccess: [] },
    });
    expect(absent.grant.networkAccess ?? []).toEqual([]);
    expect(empty.grant.networkAccess).toEqual([]);
  });

  it("keeps grant .strict() — rejects an unknown key inside grant even with networkAccess present", () => {
    const result = executionPermit.safeParse({
      ...networkGrantFixture,
      grant: { ...networkGrantFixture.grant, unknownGrantField: "nope" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a networkAccess entry with an empty destination", () => {
    const result = executionPermit.safeParse({
      ...fixture,
      grant: { ...fixture.grant, networkAccess: [{ destination: "" }] },
    });
    expect(result.success).toBe(false);
  });
});
