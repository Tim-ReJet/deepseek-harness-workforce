import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { outcomeAttestation } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "outcome-attestation.json"), "utf8"),
);

describe("outcomeAttestation", () => {
  it("round-trips the pack example fixture", () => {
    expect(outcomeAttestation.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(outcomeAttestation.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(
      false,
    );
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      outcomeAttestation.safeParse({ ...fixture, extensions: { "workforce.audit": { x: 1 } } })
        .success,
    ).toBe(true);
  });

  it("restricts verdict to PASS/FAIL/INDETERMINATE", () => {
    expect(outcomeAttestation.safeParse({ ...fixture, verdict: "MAYBE" }).success).toBe(false);
    for (const v of ["PASS", "FAIL", "INDETERMINATE"]) {
      expect(outcomeAttestation.safeParse({ ...fixture, verdict: v }).success).toBe(true);
    }
  });

  it("references a run by digest only — it never embeds RunManifest (invariant 1)", () => {
    const parsed = outcomeAttestation.parse(fixture);
    expect(parsed.run).toEqual({ digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
  });
});
