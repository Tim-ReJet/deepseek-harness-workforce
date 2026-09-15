import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { providerAdmissionRecord } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "provider-admission-record.json"), "utf8"),
);

describe("providerAdmissionRecord", () => {
  it("round-trips the pack example fixture", () => {
    expect(providerAdmissionRecord.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(
      providerAdmissionRecord.safeParse({ ...fixture, unknownField: "nope" }).success,
    ).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      providerAdmissionRecord.safeParse({ ...fixture, extensions: { "supply-chain": { x: 1 } } })
        .success,
    ).toBe(true);
  });

  it("restricts status to ADMITTED/QUARANTINED/DENIED/REVOKED", () => {
    expect(providerAdmissionRecord.safeParse({ ...fixture, status: "REJECTED" }).success).toBe(
      false,
    );
    for (const status of ["ADMITTED", "QUARANTINED", "DENIED", "REVOKED"]) {
      expect(providerAdmissionRecord.safeParse({ ...fixture, status }).success).toBe(true);
    }
  });

  it("restricts type to the plan-18 provider type union", () => {
    expect(providerAdmissionRecord.safeParse({ ...fixture, type: "docker-image" }).success).toBe(
      false,
    );
    for (const type of [
      "dsh-plugin",
      "dsh-bundle",
      "nono-package",
      "runtime-image",
      "agent-provider",
      "effect-provider",
      "validation-provider",
      "model-adapter",
    ]) {
      expect(providerAdmissionRecord.safeParse({ ...fixture, type }).success).toBe(true);
    }
  });

  it("requiredIsolation is a bare non-empty string, not a shared IsolationClass type", () => {
    expect(
      providerAdmissionRecord.safeParse({ ...fixture, requiredIsolation: "" }).success,
    ).toBe(false);
    expect(
      providerAdmissionRecord.safeParse({ ...fixture, requiredIsolation: "SANDBOXED" }).success,
    ).toBe(true);
  });

  it("defaults dependsOn to an empty array when omitted", () => {
    const { dependsOn: _dependsOn, ...withoutDependsOn } = fixture;
    const result = providerAdmissionRecord.safeParse(withoutDependsOn);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
    }
  });

  it("accepts optional sbomRef / vulnerabilityReportRef / expiresAt", () => {
    expect(
      providerAdmissionRecord.safeParse({
        ...fixture,
        expiresAt: "2027-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
    const { sbomRef: _sbomRef, vulnerabilityReportRef: _vulnerabilityReportRef, ...minimal } =
      fixture;
    expect(providerAdmissionRecord.safeParse(minimal).success).toBe(true);
  });
});
