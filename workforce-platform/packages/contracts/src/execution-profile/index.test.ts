import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executionProfile, PROFILE_IDS } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "fixtures");

const FIXTURE_BY_PROFILE_ID: Record<(typeof PROFILE_IDS)[number], string> = {
  "workspace-autonomy": "execution-profile-workspace-autonomy.json",
  "bounded-operations": "execution-profile-bounded-operations.json",
  "high-assurance": "execution-profile-high-assurance.json",
};

function loadFixture(file: string) {
  return JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
}

describe("executionProfile", () => {
  it.each(PROFILE_IDS)("round-trips the %s pack example fixture", (id) => {
    const fixture = loadFixture(FIXTURE_BY_PROFILE_ID[id]);
    const parsed = executionProfile.safeParse(fixture);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.profileId).toBe(id);
  });

  // Plan §4's own preset table, copied verbatim, so the shipped fixtures
  // are traceable word-for-word to POSTURE_REALIGNMENT_PLAN.md §4 rather
  // than paraphrased.
  it("matches plan §4's preset table verbatim", () => {
    expect(loadFixture(FIXTURE_BY_PROFILE_ID["workspace-autonomy"])).toMatchObject({
      executionExperience:
        "Broad activity within allocated repositories, documents, scratch storage, compute, and configured network/model access. Scripts, experiments, dependency installation, and internal delegation do not require repeated permission requests.",
      acceptanceBehavior:
        "Deliver artifacts and the specified practical checks. Same-run verification is allowed. No universal independent attestation.",
    });
    expect(loadFixture(FIXTURE_BY_PROFILE_ID["bounded-operations"])).toMatchObject({
      executionExperience:
        "Adds explicitly scoped external operations, such as creating PRs, updating selected records, or sending permitted messages. Each controlled operation uses current authorization and appropriate recovery semantics.",
      acceptanceBehavior:
        "Use the receipts, readback, or checks appropriate to the operation. Routine operations stay automatic inside the grant.",
    });
    expect(loadFixture(FIXTURE_BY_PROFILE_ID["high-assurance"])).toMatchObject({
      executionExperience:
        "The same work model with additional mandatory restrictions selected for the workload or deployment. It grants no extra authority by itself.",
      acceptanceBehavior:
        "Require the named independent checks, protected evidence, signatures, approvals, or stronger isolation. Do not enable every possible control merely because this preset is selected.",
    });
  });

  it("rejects an unknown top-level key", () => {
    const fixture = loadFixture(FIXTURE_BY_PROFILE_ID["workspace-autonomy"]);
    expect(executionProfile.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("rejects an unknown profileId — closed enum, not an open string", () => {
    const fixture = loadFixture(FIXTURE_BY_PROFILE_ID["workspace-autonomy"]);
    expect(
      executionProfile.safeParse({ ...fixture, profileId: "unlimited-god-mode" }).success,
    ).toBe(false);
  });

  it("requires profileVersion to be a positive integer", () => {
    const fixture = loadFixture(FIXTURE_BY_PROFILE_ID["workspace-autonomy"]);
    expect(executionProfile.safeParse({ ...fixture, profileVersion: 0 }).success).toBe(false);
    expect(executionProfile.safeParse({ ...fixture, profileVersion: -1 }).success).toBe(false);
    expect(executionProfile.safeParse({ ...fixture, profileVersion: 1.5 }).success).toBe(false);
    expect(executionProfile.safeParse({ ...fixture, profileVersion: "1" }).success).toBe(false);
  });

  // Invariant (plan §4): "The effective permission set comes from
  // organizational policy, the WorkOrder, its delegation chain, and
  // current grants—not the preset's name." A profile must never itself
  // carry a capability/effect/grant-shaped field — mirrors how AGENT-001
  // enforces Invariant 13 with a denylist/shape check.
  it("carries no capabilities/effects/grant/permissions-shaped field (plan §4 invariant)", () => {
    const shapeKeys = Object.keys(executionProfile.shape);
    const forbiddenSubstrings = ["capabilit", "effect", "grant", "permission"];
    for (const key of shapeKeys) {
      const lowerKey = key.toLowerCase();
      for (const forbidden of forbiddenSubstrings) {
        expect(lowerKey.includes(forbidden)).toBe(false);
      }
    }
  });
});
