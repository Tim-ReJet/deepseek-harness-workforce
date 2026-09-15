/**
 * workforce.cell-coordination-board/v1 — in-Cell multi-agent coordination
 * state (ADR-029 / SWARM-02). Not an authority artifact: path write authority
 * mirrors DelegationPlan.workers[].ownedPaths only; the board never grants
 * permits, budgets, or ownership.
 */
import { z } from "zod";
import { digest, digestRef } from "../common/digest.js";
import { id } from "../common/ids.js";
import { rfc3339 } from "../common/time.js";

export const CELL_COORDINATION_BOARD_SCHEMA = "workforce.cell-coordination-board/v1" as const;

/** Validation hooks for propose → validate → commit (Cell coordination service). */
export const CELL_COORDINATION_BOARD_VALIDATION_HOOKS = [
  "schemaStrict",
  "planDigestMatch",
  "revisionMatch",
  "pathMirrorImmutable",
  "pathHintsSubset",
  "ticketConflict",
  "lockCapability",
  "noAuthorityFields",
  "wakeInvariant",
] as const;

export const cellCoordinationBoardValidationHook = z.enum(CELL_COORDINATION_BOARD_VALIDATION_HOOKS);
export type CellCoordinationBoardValidationHook = z.infer<typeof cellCoordinationBoardValidationHook>;

const boardDigestRef = digestRef.extend({
  mediaType: z.string().optional(),
});

const agentProvenance = z
  .object({
    agentInstanceId: z.string().min(1),
    spiffeId: z.string().optional(),
    workerId: z.string().min(1).optional(),
  })
  .strict();

const pathMirrorEntry = z
  .object({
    path: z.string().min(1),
    ownerWorkerId: z.string().min(1),
    source: z.literal("delegation-plan"),
  })
  .strict();

export const boardTicketStatus = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
export type BoardTicketStatus = z.infer<typeof boardTicketStatus>;

const taskResultOutcome = z.enum(["success", "failure", "partial", "blocked"]);

const commitSha = z.string().regex(/^[0-9a-f]{7,40}$/);

const taskResultReport = z
  .object({
    outcome: taskResultOutcome,
    reportedAt: rfc3339,
    commitSha: commitSha.optional(),
    evidence: z.array(boardDigestRef).optional(),
    summary: z.string().optional(),
  })
  .strict();

export const boardTicket = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    status: boardTicketStatus,
    priority: z.number().int().min(0).max(4),
    assignee: agentProvenance.optional(),
    dependsOn: z.array(z.string()).optional(),
    ownedPathHints: z.array(z.string()).optional(),
    reportTaskResult: taskResultReport.optional(),
  })
  .strict();
export type BoardTicket = z.infer<typeof boardTicket>;

export const residualLock = z
  .object({
    path: z.string().min(1),
    lockToken: z.string().min(16),
    leaseToken: z.string().optional(),
    issuedAt: rfc3339,
    expiresAt: rfc3339,
    holderProvenance: agentProvenance.optional(),
    issuerRef: z.string().min(1),
  })
  .strict();
export type ResidualLock = z.infer<typeof residualLock>;

const boardPatch = z
  .object({
    ticketsUpsert: z.array(boardTicket).optional(),
    ticketsRemove: z.array(z.string()).optional(),
    residualLocksUpsert: z.array(residualLock).optional(),
    residualLocksRemove: z.array(z.string()).optional(),
  })
  .strict();

export const boardWriteProposal = z
  .object({
    proposalId: z.string().min(1),
    proposer: agentProvenance,
    proposedAt: rfc3339,
    expectedRevision: z.number().int().min(1),
    delegationPlanDigest: digest,
    patch: boardPatch,
  })
  .strict();
export type BoardWriteProposal = z.infer<typeof boardWriteProposal>;

/** Namespaced extensions; must not carry authority fields (runtime-enforced). */
const boardExtension = z.record(z.string(), z.unknown()).optional();

export const cellCoordinationBoard = z
  .object({
    schema: z.literal(CELL_COORDINATION_BOARD_SCHEMA),
    id,
    cellId: z.string().min(1),
    runId: z.string().min(1),
    delegationPlanDigest: digest,
    boardDigest: digest,
    revision: z.number().int().min(1),
    pathMirror: z.array(pathMirrorEntry),
    tickets: z.array(boardTicket),
    residualLocks: z.array(residualLock).optional(),
    pendingProposals: z.array(boardWriteProposal).optional(),
    extension: boardExtension,
  })
  .strict();

export type CellCoordinationBoard = z.infer<typeof cellCoordinationBoard>;
