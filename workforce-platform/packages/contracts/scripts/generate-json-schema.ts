/**
 * generate-json-schema.ts — derives packages/contracts/schemas/*.schema.json
 * from the Zod schemas in src/. Zod is the canonical source; JSON Schema is
 * generated, never hand-maintained separately (pack decision: don't
 * hand-maintain TypeScript and JSON Schema as two sources of truth).
 *
 * Run: pnpm -F @reactorjet/workforce-contracts generate:schemas
 * Verified in CI by src/schema-parity.test.ts, which regenerates in-memory
 * and diffs against the committed files.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { workOrder } from "../src/workorder/index.js";
import { delegationPlan } from "../src/delegation-plan/index.js";
import { cellCoordinationBoard } from "../src/cell-coordination-board/index.js";
import { executionPermit } from "../src/execution-permit/index.js";
import { provisioningSpec } from "../src/provisioning-spec/index.js";
import { validationSpec } from "../src/validation-spec/index.js";
import { outcomeAttestation } from "../src/outcome-attestation/index.js";
import { toolAdmissionRecord } from "../src/tool-admission-record/index.js";
import { providerAdmissionRecord } from "../src/provider-admission-record/index.js";
import { evidenceIndex } from "../src/evidence-index/index.js";
import { runManifest } from "../src/run-manifest/index.js";
import { executionProfile } from "../src/execution-profile/index.js";
import { policyDecision } from "../src/policy-decision/index.js";
import { agentInstanceRef, assignmentRef, agentMessage } from "../src/agent-instance/index.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMAS_DIR = join(here, "..", "schemas");

export const ARTIFACT_SCHEMAS: Record<string, { schema: unknown; name: string }> = {
  "workorder.v2.schema.json": { schema: workOrder, name: "WorkOrder" },
  "delegation-plan.v1.schema.json": { schema: delegationPlan, name: "DelegationPlan" },
  "cell-coordination-board.v1.schema.json": {
    schema: cellCoordinationBoard,
    name: "CellCoordinationBoard",
  },
  "execution-permit.v1.schema.json": { schema: executionPermit, name: "ExecutionPermit" },
  "provisioning-spec.v1.schema.json": { schema: provisioningSpec, name: "ProvisioningSpec" },
  "validation-spec.v1.schema.json": { schema: validationSpec, name: "ValidationSpec" },
  "outcome-attestation.v1.schema.json": { schema: outcomeAttestation, name: "OutcomeAttestation" },
  "tool-admission-record.v1.schema.json": {
    schema: toolAdmissionRecord,
    name: "ToolAdmissionRecord",
  },
  "provider-admission-record.v1.schema.json": {
    schema: providerAdmissionRecord,
    name: "ProviderAdmissionRecord",
  },
  "evidence-index.v1.schema.json": { schema: evidenceIndex, name: "EvidenceIndex" },
  "run-manifest.v1.schema.json": { schema: runManifest, name: "RunManifest" },
  "execution-profile.v1.schema.json": { schema: executionProfile, name: "ExecutionProfile" },
  "policy-decision.v1.schema.json": { schema: policyDecision, name: "PolicyDecision" },
  "agent-instance-ref.v1.schema.json": { schema: agentInstanceRef, name: "AgentInstanceRef" },
  "assignment-ref.v1.schema.json": { schema: assignmentRef, name: "AssignmentRef" },
  "agent-message.v1.schema.json": { schema: agentMessage, name: "AgentMessage" },
};

export function generateAll(): Record<string, object> {
  const out: Record<string, object> = {};
  for (const [file, { schema, name }] of Object.entries(ARTIFACT_SCHEMAS)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out[file] = zodToJsonSchema(schema as any, name);
  }
  return out;
}

function main() {
  mkdirSync(SCHEMAS_DIR, { recursive: true });
  const generated = generateAll();
  for (const [file, json] of Object.entries(generated)) {
    writeFileSync(join(SCHEMAS_DIR, file), JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  // eslint-disable-next-line no-console
  console.log(`Wrote ${Object.keys(generated).length} JSON Schema files to ${SCHEMAS_DIR}`);
}

main();
