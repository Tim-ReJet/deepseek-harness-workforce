import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { provisioningSpec } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "provisioning-spec.json"), "utf8"),
);

describe("provisioningSpec", () => {
  it("round-trips the pack example fixture", () => {
    expect(provisioningSpec.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(provisioningSpec.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      provisioningSpec.safeParse({ ...fixture, extensions: { "kubernetes.native": { ns: "x" } } })
        .success,
    ).toBe(true);
  });
});
