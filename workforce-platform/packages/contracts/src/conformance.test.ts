/**
 * conformance.test.ts — cross-cutting checks that don't belong to a single
 * artifact: V1 stays frozen, every artifact schema exists, and every fixture
 * under fixtures/ parses with its matching schema.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { workOrder } from "./workorder/index.js";
import { delegationPlan } from "./delegation-plan/index.js";
import { cellCoordinationBoard } from "./cell-coordination-board/index.js";
import { executionPermit } from "./execution-permit/index.js";
import { provisioningSpec } from "./provisioning-spec/index.js";
import { validationSpec } from "./validation-spec/index.js";
import { outcomeAttestation } from "./outcome-attestation/index.js";
import { toolAdmissionRecord } from "./tool-admission-record/index.js";
import { providerAdmissionRecord } from "./provider-admission-record/index.js";
import { evidenceIndex } from "./evidence-index/index.js";
import { runManifest } from "./run-manifest/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const fixturesDir = join(here, "..", "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

describe("workorder/v1 stays frozen", () => {
  it("packages/workorder-protocol still exists, unchanged by this unit", () => {
    const v1Path = join(repoRoot, "packages", "workorder-protocol");
    expect(existsSync(v1Path)).toBe(true);
    expect(existsSync(join(v1Path, "src", "workorder.ts"))).toBe(true);

    // Confirm this unit introduced no tracked diff against workorder-protocol.
    // `-c safe.directory=*` is required in CI container jobs: checkout writes
    // safe.directory into the runner-user gitconfig, but the container is root
    // with a different HOME, so git otherwise treats the workspace as "not a
    // git repository" and `diff -- path` becomes `--no-index`.
    const diff = execFileSync(
      "git",
      [
        "-c",
        "safe.directory=*",
        "-C",
        repoRoot,
        "diff",
        "--stat",
        "--",
        "packages/workorder-protocol",
      ],
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});

describe("every pack example round-trips through its matching V2 schema", () => {
  it.each([
    ["workorder.json", workOrder],
    ["delegation-plan.json", delegationPlan],
    ["cell-coordination-board.json", cellCoordinationBoard],
    ["execution-permit.json", executionPermit],
    ["provisioning-spec.json", provisioningSpec],
    ["validation-spec.json", validationSpec],
    ["outcome-attestation.json", outcomeAttestation],
    ["tool-admission-record.json", toolAdmissionRecord],
    ["provider-admission-record.json", providerAdmissionRecord],
    ["evidence-index.json", evidenceIndex],
    ["run-manifest.json", runManifest],
  ] as const)("%s", (file, schema) => {
    const result = (schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(
      loadFixture(file),
    );
    expect(result.success).toBe(true);
  });
});
