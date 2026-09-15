import type { CellCoordinationBoard, DelegationPlan } from "@reactorjet/workforce-contracts";

type PathMirrorEntry = CellCoordinationBoard["pathMirror"][number];

/** Build pathMirror entries from sealed DelegationPlan workers (non-glob paths only). */
export function pathMirrorFromDelegationPlan(plan: DelegationPlan): PathMirrorEntry[] {
  const entries: PathMirrorEntry[] = [];
  for (const worker of plan.workers ?? []) {
    for (const path of worker.ownedPaths) {
      if (path.includes("*")) continue;
      entries.push({
        path,
        ownerWorkerId: worker.id,
        source: "delegation-plan",
      });
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path) || a.ownerWorkerId.localeCompare(b.ownerWorkerId));
  return entries;
}

export function pathMirrorsEqual(
  a: readonly PathMirrorEntry[],
  b: readonly PathMirrorEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.path !== right.path ||
      left.ownerWorkerId !== right.ownerWorkerId ||
      left.source !== right.source
    ) {
      return false;
    }
  }
  return true;
}

export function pathMirrorMatchesDelegationPlan(
  pathMirror: readonly PathMirrorEntry[],
  plan: DelegationPlan,
): boolean {
  return pathMirrorsEqual(pathMirror, pathMirrorFromDelegationPlan(plan));
}
