import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runManifest } from "./index.js";
import { outcomeAttestation } from "../outcome-attestation/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "run-manifest.json"), "utf8"),
);
const attestationFixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "outcome-attestation.json"), "utf8"),
);

describe("runManifest", () => {
  it("round-trips the fixture", () => {
    expect(runManifest.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(runManifest.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      runManifest.safeParse({ ...fixture, extensions: { "workforce.audit": { x: 1 } } }).success,
    ).toBe(true);
  });

  it("rejects run status PASS/FAIL — infrastructure status is not a verdict (invariant 2)", () => {
    expect(runManifest.safeParse({ ...fixture, status: "PASS" }).success).toBe(false);
    expect(runManifest.safeParse({ ...fixture, status: "FAIL" }).success).toBe(false);
    for (const status of ["pending", "running", "sealed", "aborted", "cancelled"]) {
      expect(runManifest.safeParse({ ...fixture, status }).success).toBe(true);
    }
  });

  it("rejects closureState PASS/FAIL — closure is lifecycle, not a verdict", () => {
    expect(runManifest.safeParse({ ...fixture, closureState: "PASS" }).success).toBe(false);
    for (const closureState of ["open", "closing", "closed"]) {
      expect(runManifest.safeParse({ ...fixture, closureState }).success).toBe(true);
    }
  });

  it("never carries a top-level verdict field (invariant 2/3)", () => {
    expect(runManifest.safeParse({ ...fixture, verdict: "PASS" }).success).toBe(false);
  });

  it("rejects a nested evidenceIndex with an unknown key", () => {
    const tampered = {
      ...fixture,
      evidenceIndex: { ...fixture.evidenceIndex, unknownField: "nope" },
    };
    expect(runManifest.safeParse(tampered).success).toBe(false);
  });

  it("OutcomeAttestation stays a distinct export — RunManifest is never merged into it, and vice versa (invariant 1)", () => {
    // RunManifest does not validate as an OutcomeAttestation...
    expect(outcomeAttestation.safeParse(fixture).success).toBe(false);
    // ...and OutcomeAttestation does not validate as a RunManifest.
    expect(runManifest.safeParse(attestationFixture).success).toBe(false);
  });
});
