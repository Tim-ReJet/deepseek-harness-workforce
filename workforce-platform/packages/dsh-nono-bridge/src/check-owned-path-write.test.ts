import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionIntent,
  computeArtifactDigest,
  delegationPlan,
  executionPermit,
} from "@reactorjet/workforce-contracts";
import { compilePermitToManifest } from "@workforce/permit-compiler";
import { checkActionIntentWithOwnedPaths } from "./check-owned-path-write.js";

const here = dirname(fileURLToPath(import.meta.url));
const planRaw = delegationPlan.parse(
  JSON.parse(readFileSync(join(here, "../../contracts/fixtures/delegation-plan.json"), "utf8")),
);
const planFixture = { ...planRaw, digest: computeArtifactDigest(planRaw) };

const permitFixture = executionPermit.parse(
  JSON.parse(readFileSync(join(here, "../../contracts/fixtures/execution-permit.json"), "utf8")),
);

describe("checkActionIntentWithOwnedPaths", () => {
  it("denies writes outside sealed ownedPaths even when manifest grants workdir", () => {
    const manifest = compilePermitToManifest(permitFixture, { workdir: "/cell/workspace" });
    const intent = actionIntent.parse({
      schema: "workforce.action-intent/v1",
      id: "01JINTENT000000000000000001",
      workOrderId: "01JWORK0000000000000000001",
      runId: "01JRUN00000000000000000001",
      cellId: "01JCELL0000000000000000001",
      taskId: "01JTASK0000000000000000001",
      semanticAction: "scm.repository.write",
      target: { type: "filesystem", id: "packages/api/main.ts" },
      parameters: { path: "packages/web/app.tsx" },
      toolBinding: { toolName: "write_file", version: "1" },
      createdAt: "2026-09-14T12:00:00Z",
      digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });

    const result = checkActionIntentWithOwnedPaths({
      intent,
      manifest,
      delegationPlan: planFixture,
      workerId: "worker-api",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("ownedPaths");
  });
});
