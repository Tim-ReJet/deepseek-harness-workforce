import type { DelegationPlan } from "@reactorjet/workforce-contracts";

/** Normalize a repo-relative path for prefix / glob checks. */
export function normalizeRelativePath(relativePath: string): string {
  const trimmed = relativePath.replace(/^\.\/+/, "").replace(/\\/g, "/");
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

/** True when `relativePath` falls under one of the worker's sealed ownedPaths grants. */
export function pathMatchesOwnedGrant(
  relativePath: string,
  ownedPaths: readonly string[],
): boolean {
  const normalized = normalizeRelativePath(relativePath);
  for (const grant of ownedPaths) {
    const g = grant.replace(/\\/g, "/");
    if (g.includes("*")) {
      const prefix = g.replace(/\*\*.*$/, "").replace(/\*.*$/, "");
      if (normalized === prefix || normalized.startsWith(prefix)) return true;
      continue;
    }
    if (normalized === g) return true;
    const dirPrefix = g.endsWith("/") ? g : `${g}/`;
    if (normalized.startsWith(dirPrefix)) return true;
  }
  return false;
}

export function workerOwnedPaths(plan: DelegationPlan, workerId: string): readonly string[] {
  return plan.workers?.find((w) => w.id === workerId)?.ownedPaths ?? [];
}

export function workerOwnsPath(
  plan: DelegationPlan,
  workerId: string,
  relativePath: string,
): boolean {
  return pathMatchesOwnedGrant(relativePath, workerOwnedPaths(plan, workerId));
}

export interface OwnedPathWriteGateInput {
  delegationPlan: DelegationPlan;
  workerId: string;
  relativePath: string;
}

/**
 * nono-facing path gate: authority comes only from the sealed DelegationPlan.
 * Board tickets / hints never widen this decision.
 */
export function gateOwnedPathWrite(input: OwnedPathWriteGateInput): {
  allowed: boolean;
  reason: string;
} {
  if (!workerOwnsPath(input.delegationPlan, input.workerId, input.relativePath)) {
    return {
      allowed: false,
      reason:
        `Filesystem write to "${normalizeRelativePath(input.relativePath)}" denied: ` +
        `worker "${input.workerId}" has no sealed ownedPaths grant (board cannot override).`,
    };
  }
  return {
    allowed: true,
    reason: "Path is within worker sealed ownedPaths.",
  };
}
