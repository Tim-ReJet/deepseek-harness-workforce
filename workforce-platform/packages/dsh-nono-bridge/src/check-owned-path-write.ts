import type { ActionIntent, DelegationPlan } from "@reactorjet/workforce-contracts";
import { gateOwnedPathWrite } from "@workforce/cell-coordination-board";
import type { CheckActionIntentResult } from "./check-action-intent.js";
import { checkActionIntent } from "./check-action-intent.js";
import type { CapabilityManifest } from "@workforce/permit-compiler";

/** Extract repo-relative path from ActionIntent parameters when present. */
export function actionIntentRelativePath(intent: ActionIntent): string | null {
  const pathParam = intent.parameters.path;
  if (typeof pathParam === "string" && pathParam.length > 0) return pathParam;
  if (intent.target.type === "filesystem" && intent.target.id) return intent.target.id;
  return null;
}

export interface CheckActionIntentWithOwnedPathsInput {
  intent: ActionIntent;
  manifest: CapabilityManifest;
  delegationPlan: DelegationPlan;
  workerId: string;
}

/**
 * Plan 16 permit check plus ADR-029 sealed ownedPaths gate. Board state is
 * intentionally not an input: tickets cannot widen filesystem authority.
 */
export function checkActionIntentWithOwnedPaths(
  input: CheckActionIntentWithOwnedPathsInput,
): CheckActionIntentResult {
  const permit = checkActionIntent(input.intent, input.manifest);
  if (!permit.allowed) return permit;

  const relativePath = actionIntentRelativePath(input.intent);
  if (!relativePath) {
    return {
      allowed: false,
      reason:
        "ActionIntent has no filesystem path (parameters.path or filesystem target.id); " +
        "cannot verify sealed ownedPaths.",
      missingCapabilities: [],
    };
  }

  const pathGate = gateOwnedPathWrite({
    delegationPlan: input.delegationPlan,
    workerId: input.workerId,
    relativePath,
  });
  if (!pathGate.allowed) {
    return { allowed: false, reason: pathGate.reason, missingCapabilities: [] };
  }

  return permit;
}
