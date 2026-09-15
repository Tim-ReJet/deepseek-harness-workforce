/**
 * Read-only Hermes/A2A projection of workorder/v1.
 *
 * Maps WorkOrder lifecycle (+ ApprovalRequired / cancellation sidecars) onto
 * Hermes Task.status, EvidenceBundle onto Artifact, and event narrative onto
 * a text Part. This is a view — it does not add message/send or change the
 * /a2a/workorder/v1 wire.
 */

import type { EvidenceBundle } from "./evidence.js";
import type { WorkOrderEvent } from "./events.js";
import type { WorkOrderState } from "./state-machine.js";

/** Hermes Task.status values we project onto. */
export const A2A_TASK_STATES = [
  "submitted",
  "working",
  "input-required",
  "completed",
  "canceled",
  "failed",
  "rejected",
] as const;
export type A2ATaskState = (typeof A2A_TASK_STATES)[number];

export interface A2ATaskStatus {
  state: A2ATaskState;
}

export interface A2ATextPart {
  kind: "text";
  text: string;
}

export interface A2ADataPart {
  kind: "data";
  data: Record<string, unknown>;
}

export type A2APart = A2ATextPart | A2ADataPart;

export interface A2AArtifact {
  name: string;
  parts: A2APart[];
}

export interface A2AMessage {
  role: "agent";
  parts: A2APart[];
}

export interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  history?: A2AMessage[];
  artifacts?: A2AArtifact[];
}

/** Durable pending-human-approval sidecar (not a workorder/v1 event). */
export interface ApprovalRequiredSidecar {
  planHash: string;
  requiredApprovals: string[];
  requestedAt: string;
}

/** Cooperative-cancellation sidecar (not a workorder/v1 event). */
export interface CancellationSidecar {
  status:
    | "rejected_before_apply"
    | "effect_settling"
    | "effect_unknown"
    | "failed_after_settlement";
}

export interface A2AProjectionSidecars {
  approvalRequired?: ApprovalRequiredSidecar;
  cancellation?: CancellationSidecar;
}

const STATE_TO_A2A: Record<WorkOrderState, A2ATaskState> = {
  RECEIVED: "submitted",
  PLANNED: "working",
  APPROVED: "working",
  APPLYING: "working",
  VERIFYING: "working",
  VERIFIED: "working",
  COMPLETED: "completed",
  FAILED: "failed",
  REJECTED: "rejected",
  COMPENSATION_ISSUED: "working",
  COMPENSATION_CONFIRMED: "working",
  ROLLED_BACK: "failed",
};

/**
 * Project a WorkOrder lifecycle state, optionally upgraded by sidecars that
 * live beside the v1 event union.
 *
 * Sidecar precedence: cancellation (terminal disposition) then ApprovalRequired
 * (only while still PLANNED).
 */
export function projectWorkOrderStateToA2A(
  state: WorkOrderState,
  sidecars: A2AProjectionSidecars = {},
): A2ATaskState {
  const cancellation = sidecars.cancellation?.status;
  if (cancellation === "rejected_before_apply") return "canceled";
  if (cancellation === "failed_after_settlement") return "failed";
  if (cancellation === "effect_settling" || cancellation === "effect_unknown") {
    return "working";
  }
  if (state === "PLANNED" && sidecars.approvalRequired) return "input-required";
  return STATE_TO_A2A[state];
}

/** Project the mandatory event narrative as a Hermes text Part. */
export function projectEventNarrativeToTextPart(
  event: Pick<WorkOrderEvent, "narrative">,
): A2ATextPart {
  return { kind: "text", text: event.narrative };
}

/** Project a signed EvidenceBundle as an immutable data Artifact. */
export function projectEvidenceBundleToArtifact(bundle: EvidenceBundle): A2AArtifact {
  return {
    name: "evidence-bundle",
    parts: [{
      kind: "data",
      data: {
        workOrderId: bundle.workOrderId,
        planHash: bundle.planHash,
        signature: bundle.signature,
        steps: bundle.steps,
        complianceAttestation: bundle.complianceAttestation,
        costActuals: bundle.costActuals,
        auditSegment: bundle.auditSegment,
      },
    }],
  };
}

export function projectWorkOrderToA2ATask(input: {
  workOrderId: string;
  state: WorkOrderState;
  events?: readonly Pick<WorkOrderEvent, "narrative">[];
  evidence?: EvidenceBundle;
  approvalRequired?: ApprovalRequiredSidecar;
  cancellation?: CancellationSidecar;
}): A2ATask {
  const task: A2ATask = {
    id: input.workOrderId,
    status: {
      state: projectWorkOrderStateToA2A(input.state, {
        approvalRequired: input.approvalRequired,
        cancellation: input.cancellation,
      }),
    },
  };
  if (input.events?.length) {
    task.history = input.events.map((event) => ({
      role: "agent" as const,
      parts: [projectEventNarrativeToTextPart(event)],
    }));
  }
  if (input.evidence) {
    task.artifacts = [projectEvidenceBundleToArtifact(input.evidence)];
  }
  return task;
}
