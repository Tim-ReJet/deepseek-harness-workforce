import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceIndex } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "evidence-index.json"), "utf8"),
);

describe("evidenceIndex", () => {
  it("round-trips the fixture", () => {
    expect(evidenceIndex.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(evidenceIndex.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      evidenceIndex.safeParse({ ...fixture, extensions: { "workforce.audit": { x: 1 } } })
        .success,
    ).toBe(true);
  });

  it("rejects a providerEvidenceRef missing its producer", () => {
    const tampered = {
      ...fixture,
      agency: [{ digest: fixture.agency[0].digest }],
    };
    expect(evidenceIndex.safeParse(tampered).success).toBe(false);
  });

  it("restricts requiredProducerStatus.status to PRESENT/MISSING/PARTIAL", () => {
    const tampered = {
      ...fixture,
      requiredProducerStatus: [{ producer: "dsh-agent", status: "PASS" }],
    };
    expect(evidenceIndex.safeParse(tampered).success).toBe(false);
    for (const status of ["PRESENT", "MISSING", "PARTIAL"]) {
      const ok = {
        ...fixture,
        requiredProducerStatus: [{ producer: "dsh-agent", status }],
      };
      expect(evidenceIndex.safeParse(ok).success).toBe(true);
    }
  });

  it("never carries a verdict field — evidence indexing is not attestation (invariant 3)", () => {
    expect(evidenceIndex.safeParse({ ...fixture, verdict: "PASS" }).success).toBe(false);
  });
});
