#!/usr/bin/env node
/**
 * validate-pack-examples.ts — checks the pack's examples/*.json against this
 * package's Zod schemas, one artifact at a time.
 *
 * Plan 01 (biro-workforce-v2-implementation-pack/plans/01-*.md) says schemas
 * and fixtures come from one source, and G0 requires "all examples validate."
 * This script is the mechanical half of that check: load each named pack
 * example, safeParse it with the matching schema exported from
 * src/<artifact>/index.ts, and report success/failure per example — the same
 * schema/fixture pairing src/conformance.test.ts already exercises for the
 * package's own fixtures.
 *
 * Read-only: this script never writes to the pack or to fixtures/. Run it,
 * read the report, and fix drift by hand (see
 * CONTRACT-work: fix-example-drift task notes).
 *
 * Usage: tsx conformance/validate-pack-examples.ts [--pack-dir <path>]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { workOrder } from "../src/workorder/index.js";
import { delegationPlan } from "../src/delegation-plan/index.js";
import { cellCoordinationBoard } from "../src/cell-coordination-board/index.js";
import { executionPermit } from "../src/execution-permit/index.js";
import { provisioningSpec } from "../src/provisioning-spec/index.js";
import { validationSpec } from "../src/validation-spec/index.js";
import { runManifest } from "../src/run-manifest/index.js";
import { evidenceIndex } from "../src/evidence-index/index.js";
import { outcomeAttestation } from "../src/outcome-attestation/index.js";
import { toolAdmissionRecord } from "../src/tool-admission-record/index.js";

const here = dirname(fileURLToPath(import.meta.url));

// The pack example file name differs from the fixture name for workorder
// (pack: workorder-v2.json, fixture: workorder.json) — see
// src/conformance.test.ts for the fixture-side pairing.
const ARTIFACTS: Array<{ exampleFile: string; schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } } }> = [
  { exampleFile: "delegation-plan.json", schema: delegationPlan },
  { exampleFile: "cell-coordination-board.json", schema: cellCoordinationBoard },
  { exampleFile: "execution-permit.json", schema: executionPermit },
  { exampleFile: "outcome-attestation.json", schema: outcomeAttestation },
  { exampleFile: "provisioning-spec.json", schema: provisioningSpec },
  { exampleFile: "tool-admission-record.json", schema: toolAdmissionRecord },
  { exampleFile: "validation-spec.json", schema: validationSpec },
  { exampleFile: "workorder-v2.json", schema: workOrder },
  { exampleFile: "run-manifest.json", schema: runManifest },
  { exampleFile: "evidence-index.json", schema: evidenceIndex },
];

function resolvePackDir(): string {
  const flagIdx = process.argv.indexOf("--pack-dir");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return process.argv[flagIdx + 1];
  }
  // Default: sibling repo checkout, matching this session's fixed repo roots.
  return join(here, "..", "..", "..", "..", "biro-workforce-v2-implementation-pack", "examples");
}

function main() {
  const packDir = resolvePackDir();
  if (!existsSync(packDir)) {
    console.error(`[FAIL] pack examples dir not found: ${packDir}`);
    process.exit(1);
  }

  let failures = 0;
  for (const { exampleFile, schema } of ARTIFACTS) {
    const path = join(packDir, exampleFile);
    if (!existsSync(path)) {
      failures++;
      console.error(`[FAIL] ${exampleFile}: not found at ${path}`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, "utf8"));
    const result = schema.safeParse(data);
    if (result.success) {
      console.log(`[ok]   ${exampleFile}`);
    } else {
      failures++;
      console.error(`[FAIL] ${exampleFile}: ${JSON.stringify(result.error)}`);
    }
  }

  if (failures > 0) {
    console.error(`${failures}/${ARTIFACTS.length} pack example(s) failed validation`);
    process.exit(1);
  }
  console.log(`all ${ARTIFACTS.length} pack examples validate`);
}

main();
