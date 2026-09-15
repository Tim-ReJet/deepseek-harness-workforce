import {
  boardWriteProposal,
  cellCoordinationBoard,
  verifyArtifactDigest,
  type BoardWriteProposal,
  type CellCoordinationBoard,
  type CellCoordinationBoardValidationHook,
  type DelegationPlan,
} from "@reactorjet/workforce-contracts";
import { applyBoardPatch } from "./apply-patch.js";
import { computeBoardDigest, verifyBoardDigest } from "./board-digest.js";
import { pathMirrorFromDelegationPlan, pathMirrorsEqual } from "./path-mirror.js";
import { pathMatchesOwnedGrant, workerOwnedPaths } from "./owned-paths.js";

export type ValidationFailure = {
  ok: false;
  hook: CellCoordinationBoardValidationHook;
  reason: string;
};

export type ValidationSuccess = { ok: true; nextBoard: CellCoordinationBoard };

const AUTHORITY_FIELD_NAMES = new Set([
  "permit",
  "executionPermit",
  "grant",
  "capabilities",
  "budget",
  "policyBundle",
  "ownedPaths",
  "networkAccess",
  "effectEnvelope",
  "authorityCeiling",
]);

function findForbiddenAuthorityField(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenAuthorityField(value[i], [...path, String(i)]);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (AUTHORITY_FIELD_NAMES.has(key)) {
      return [...path, key].join(".");
    }
    const hit = findForbiddenAuthorityField(nested, [...path, key]);
    if (hit) return hit;
  }
  return null;
}

function sealedPlanDigest(plan: DelegationPlan): string {
  if (!verifyArtifactDigest(plan)) {
    throw new Error("validateBoardCommit: sealed DelegationPlan digest mismatch");
  }
  return plan.digest;
}

function validatePathHintsSubset(
  patch: BoardWriteProposal["patch"],
  plan: DelegationPlan,
): ValidationFailure | null {
  for (const ticket of patch.ticketsUpsert ?? []) {
    if (!ticket.ownedPathHints?.length) continue;
    const workerId = ticket.assignee?.workerId;
    if (!workerId) {
      return {
        ok: false,
        hook: "pathHintsSubset",
        reason: `Ticket "${ticket.id}" has ownedPathHints but no assignee.workerId.`,
      };
    }
    const owned = workerOwnedPaths(plan, workerId);
    for (const hint of ticket.ownedPathHints) {
      if (!pathMatchesOwnedGrant(hint, owned)) {
        return {
          ok: false,
          hook: "pathHintsSubset",
          reason:
            `Ticket "${ticket.id}" ownedPathHint "${hint}" is not a subset of worker ` +
            `"${workerId}" sealed ownedPaths.`,
        };
      }
    }
  }
  return null;
}

function validateTicketConflict(nextBoard: CellCoordinationBoard): ValidationFailure | null {
  const ids = nextBoard.tickets.map((t) => t.id);
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      hook: "ticketConflict",
      reason: "Duplicate ticket ids after patch.",
    };
  }
  const idSet = new Set(ids);
  for (const ticket of nextBoard.tickets) {
    for (const dep of ticket.dependsOn ?? []) {
      if (!idSet.has(dep)) {
        return {
          ok: false,
          hook: "ticketConflict",
          reason: `Ticket "${ticket.id}" depends on missing ticket "${dep}".`,
        };
      }
    }
  }
  return null;
}

function validateLockCapability(nextBoard: CellCoordinationBoard): ValidationFailure | null {
  for (const lock of nextBoard.residualLocks ?? []) {
    if (lock.lockToken.length < 16) {
      return {
        ok: false,
        hook: "lockCapability",
        reason: `Residual lock on "${lock.path}" has lockToken shorter than 16 chars.`,
      };
    }
    if (!lock.issuerRef.trim()) {
      return {
        ok: false,
        hook: "lockCapability",
        reason: `Residual lock on "${lock.path}" missing issuerRef.`,
      };
    }
  }
  return null;
}

/**
 * Run all nine CELL_COORDINATION_BOARD validation hooks for a commit.
 * Does not persist; returns the next board with revision+1 and fresh boardDigest.
 */
export function validateBoardCommit(input: {
  board: CellCoordinationBoard;
  proposal: BoardWriteProposal;
  sealedDelegationPlan: DelegationPlan;
}): ValidationSuccess | ValidationFailure {
  const proposalParse = boardWriteProposal.safeParse(input.proposal);
  if (!proposalParse.success) {
    return {
      ok: false,
      hook: "schemaStrict",
      reason: `BoardWriteProposal schema rejection: ${proposalParse.error.message}`,
    };
  }
  const proposal = proposalParse.data;

  const planDigest = sealedPlanDigest(input.sealedDelegationPlan);
  if (proposal.delegationPlanDigest !== planDigest) {
    return {
      ok: false,
      hook: "planDigestMatch",
      reason: "Proposal delegationPlanDigest does not match sealed DelegationPlan.",
    };
  }
  if (input.board.delegationPlanDigest !== planDigest) {
    return {
      ok: false,
      hook: "planDigestMatch",
      reason: "Board delegationPlanDigest does not match sealed DelegationPlan.",
    };
  }

  if (proposal.expectedRevision !== input.board.revision) {
    return {
      ok: false,
      hook: "revisionMatch",
      reason: `Expected revision ${proposal.expectedRevision} but board is at ${input.board.revision}.`,
    };
  }

  const forbidden = findForbiddenAuthorityField(proposal.patch);
  if (forbidden) {
    return {
      ok: false,
      hook: "noAuthorityFields",
      reason: `Patch carries forbidden authority field at ${forbidden}.`,
    };
  }

  const hintsFailure = validatePathHintsSubset(proposal.patch, input.sealedDelegationPlan);
  if (hintsFailure) return hintsFailure;

  const patched = applyBoardPatch(input.board, proposal.patch);
  if (!pathMirrorsEqual(patched.pathMirror, input.board.pathMirror)) {
    return {
      ok: false,
      hook: "pathMirrorImmutable",
      reason: "Patch attempted to alter pathMirror; path ownership is DelegationPlan-only.",
    };
  }

  const expectedMirror = pathMirrorFromDelegationPlan(input.sealedDelegationPlan);
  if (!pathMirrorsEqual(patched.pathMirror, expectedMirror)) {
    return {
      ok: false,
      hook: "pathMirrorImmutable",
      reason: "Board pathMirror does not match sealed DelegationPlan workers.",
    };
  }

  const ticketFailure = validateTicketConflict(patched);
  if (ticketFailure) return ticketFailure;

  const lockFailure = validateLockCapability(patched);
  if (lockFailure) return lockFailure;

  const nextRevision = input.board.revision + 1;
  const nextBoardCandidate: CellCoordinationBoard = {
    ...patched,
    revision: nextRevision,
    boardDigest: input.board.boardDigest,
  };

  const boardParse = cellCoordinationBoard.safeParse(nextBoardCandidate);
  if (!boardParse.success) {
    return {
      ok: false,
      hook: "schemaStrict",
      reason: `Resulting board schema rejection: ${boardParse.error.message}`,
    };
  }

  const finalized: CellCoordinationBoard = {
    ...boardParse.data,
    boardDigest: computeBoardDigest({
      ...boardParse.data,
      boardDigest: input.board.boardDigest,
    }),
  };

  if (!verifyBoardDigest(finalized)) {
    return {
      ok: false,
      hook: "schemaStrict",
      reason: "Internal boardDigest computation failed verification.",
    };
  }

  return { ok: true, nextBoard: finalized };
}
