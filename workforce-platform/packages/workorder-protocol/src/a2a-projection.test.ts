import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEvidenceBundle } from "./evidence.js";
import {
  projectEvidenceBundleToArtifact,
  projectEventNarrativeToTextPart,
  projectWorkOrderStateToA2A,
  projectWorkOrderToA2ATask,
  type A2ATaskState,
} from "./a2a-projection.js";
import type { WorkOrderState } from "./state-machine.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/valid");

const STATE_MAP: Array<[WorkOrderState, A2ATaskState]> = [
  ["RECEIVED", "submitted"],
  ["PLANNED", "working"],
  ["APPROVED", "working"],
  ["APPLYING", "working"],
  ["VERIFYING", "working"],
  ["VERIFIED", "working"],
  ["COMPLETED", "completed"],
  ["FAILED", "failed"],
  ["REJECTED", "rejected"],
  ["COMPENSATION_ISSUED", "working"],
  ["COMPENSATION_CONFIRMED", "working"],
  ["ROLLED_BACK", "failed"],
];

describe("projectWorkOrderStateToA2A", () => {
  it.each(STATE_MAP)("maps %s to Hermes %s", (state, expected) => {
    expect(projectWorkOrderStateToA2A(state)).toBe(expected);
  });

  it("maps PLANNED + ApprovalRequired sidecar to input-required", () => {
    expect(projectWorkOrderStateToA2A("PLANNED", {
      approvalRequired: {
        planHash: "a".repeat(64),
        requiredApprovals: ["human:owner"],
        requestedAt: "2026-08-13T00:00:00.000Z",
      },
    })).toBe("input-required");
  });

  it("does not treat ApprovalRequired as input-required after APPROVED", () => {
    expect(projectWorkOrderStateToA2A("APPROVED", {
      approvalRequired: {
        planHash: "a".repeat(64),
        requiredApprovals: ["human:owner"],
        requestedAt: "2026-08-13T00:00:00.000Z",
      },
    })).toBe("working");
  });

  it("maps cancellation rejected_before_apply to canceled", () => {
    expect(projectWorkOrderStateToA2A("REJECTED", {
      cancellation: { status: "rejected_before_apply" },
    })).toBe("canceled");
  });

  it("keeps effect_settling cancellation as working", () => {
    expect(projectWorkOrderStateToA2A("APPLYING", {
      cancellation: { status: "effect_settling" },
    })).toBe("working");
  });

  it("maps failed_after_settlement cancellation to failed", () => {
    expect(projectWorkOrderStateToA2A("FAILED", {
      cancellation: { status: "failed_after_settlement" },
    })).toBe("failed");
  });

  it("maps ROLLED_BACK + cancellation to canceled", () => {
    expect(projectWorkOrderStateToA2A("ROLLED_BACK", {
      cancellation: { status: "rejected_before_apply" },
    })).toBe("canceled");
  });
});

describe("projectEventNarrativeToTextPart", () => {
  it("projects the mandatory narrative as a Hermes text Part", () => {
    expect(projectEventNarrativeToTextPart({
      narrative: "Plan sealed; waiting for owner approval.",
    })).toEqual({
      kind: "text",
      text: "Plan sealed; waiting for owner approval.",
    });
  });
});

describe("projectEvidenceBundleToArtifact", () => {
  it("projects a valid EvidenceBundle as an immutable Artifact", () => {
    const bundle = parseEvidenceBundle(
      JSON.parse(readFileSync(join(FIXTURES, "evidence-bundle.json"), "utf8")),
    );
    const artifact = projectEvidenceBundleToArtifact(bundle);
    expect(artifact.name).toBe("evidence-bundle");
    expect(artifact.parts).toHaveLength(1);
    expect(artifact.parts[0]).toMatchObject({
      kind: "data",
      data: {
        workOrderId: bundle.workOrderId,
        planHash: bundle.planHash,
        signature: bundle.signature,
      },
    });
  });
});

describe("projectWorkOrderToA2ATask", () => {
  it("assembles Task.status, Artifact, and narrative Parts without inventing send", () => {
    const bundle = parseEvidenceBundle(
      JSON.parse(readFileSync(join(FIXTURES, "evidence-bundle.json"), "utf8")),
    );
    const task = projectWorkOrderToA2ATask({
      workOrderId: bundle.workOrderId,
      state: "COMPLETED",
      events: [{
        narrative: "WorkOrder completed with a signed evidence bundle.",
      }],
      evidence: bundle,
    });
    expect(task.id).toBe(bundle.workOrderId);
    expect(task.status.state).toBe("completed");
    expect(task.history?.[0]?.parts[0]).toEqual({
      kind: "text",
      text: "WorkOrder completed with a signed evidence bundle.",
    });
    expect(task.artifacts?.[0]?.name).toBe("evidence-bundle");
  });
});
