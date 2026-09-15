/**
 * state-machine.ts — the pure lifecycle guards for `workorder/v1`.
 *
 * Two responsibilities:
 *  1. Legal transitions (`canTransition` / `nextStates` / `reduceEvents`).
 *  2. The apply-authorization guard (`checkApplyAuthorization`) — the code that
 *     enforces "no APPLYING of an irreversible/over-budget plan without a
 *     plan-hash-matching approval token".
 *
 * Everything here is a pure function. No clock, no IO — the caller passes `now`.
 */

import type { WorkOrderEvent } from "./events.js";
import type { Plan } from "./events.js";
import type { ApprovalToken } from "./approval.js";
import { computePlanHash } from "./hash.js";

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * Lifecycle states. Note `APPLIED` is intentionally NOT a state: it is a
 * per-step event emitted while the WorkOrder is in `APPLYING`.
 */
export const WORK_ORDER_STATES = [
  "RECEIVED",
  "PLANNED",
  "APPROVED",
  "REJECTED",
  "APPLYING",
  "VERIFYING",
  "VERIFIED",
  "FAILED",
  "COMPENSATION_ISSUED",
  "COMPENSATION_CONFIRMED",
  "ROLLED_BACK",
  "COMPLETED",
] as const;
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number];

/**
 * The transition table.
 *
 *   RECEIVED -> PLANNED
 *   PLANNED  -> APPROVED | REJECTED
 *   APPROVED -> APPLYING
 *   APPLYING -> VERIFYING | FAILED
 *   VERIFYING-> VERIFIED  | FAILED
 *   VERIFIED -> COMPLETED | COMPENSATION_ISSUED
 *   FAILED   -> COMPENSATION_ISSUED
 *   COMPLETED -> COMPENSATION_ISSUED
 *   COMPENSATION_ISSUED    -> COMPENSATION_CONFIRMED
 *   COMPENSATION_CONFIRMED -> ROLLED_BACK
 *   REJECTED | ROLLED_BACK -> (terminal)
 *   COMPLETED is a happy-path milestone, not FAILED; an explicit compensate
 *   API may leave it for COMPENSATION_ISSUED. There is no COMPLETED → FAILED.
 */
const TRANSITIONS: Record<WorkOrderState, readonly WorkOrderState[]> = {
  RECEIVED: ["PLANNED"],
  PLANNED: ["APPROVED", "REJECTED"],
  APPROVED: ["APPLYING"],
  REJECTED: [],
  APPLYING: ["VERIFYING", "FAILED"],
  VERIFYING: ["VERIFIED", "FAILED"],
  VERIFIED: ["COMPLETED", "COMPENSATION_ISSUED"],
  FAILED: ["COMPENSATION_ISSUED"],
  COMPENSATION_ISSUED: ["COMPENSATION_CONFIRMED"],
  COMPENSATION_CONFIRMED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
  COMPLETED: ["COMPENSATION_ISSUED"],
};

export const TERMINAL_STATES: readonly WorkOrderState[] = [
  "REJECTED",
  "ROLLED_BACK",
];

export function isWorkOrderState(x: string): x is WorkOrderState {
  return (WORK_ORDER_STATES as readonly string[]).includes(x);
}

/** The states reachable in one step from `state`. */
export function nextStates(state: WorkOrderState): readonly WorkOrderState[] {
  return TRANSITIONS[state];
}

/** True iff `from -> to` is a legal single transition. */
export function canTransition(from: WorkOrderState, to: WorkOrderState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** True iff `state` is terminal (no outgoing transitions). */
export function isTerminal(state: WorkOrderState): boolean {
  return TRANSITIONS[state].length === 0;
}

// ---------------------------------------------------------------------------
// Protocol errors
// ---------------------------------------------------------------------------

export type ProtocolErrorCode =
  | "EMPTY_SEQUENCE"
  | "SEQ_NOT_MONOTONIC"
  | "WORK_ORDER_ID_MISMATCH"
  | "ILLEGAL_TRANSITION"
  | "ILLEGAL_START"
  | "APPLIED_OUTSIDE_APPLYING"
  | "APPROVAL_REQUIRED"
  | "PLAN_HASH_MISMATCH"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_WORK_ORDER_MISMATCH";

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Event-sequence reduction (transition + monotonic-seq enforcement)
// ---------------------------------------------------------------------------

export interface ReduceResult {
  /** Final lifecycle state after applying every event. */
  state: WorkOrderState;
  /** The WorkOrder id shared by every event. */
  workOrderId: string;
}

/**
 * Replay an ordered event sequence, enforcing:
 *  - non-empty,
 *  - strictly increasing `seq`,
 *  - a single shared `workOrderId`,
 *  - a `RECEIVED` first event,
 *  - `APPLIED` only while in `APPLYING`,
 *  - every other transition legal per the table.
 *
 * Returns the final state, or throws a `ProtocolError` describing the first
 * violation. Pure: does not mutate its input.
 */
export function reduceEvents(events: readonly WorkOrderEvent[]): ReduceResult {
  if (events.length === 0) {
    throw new ProtocolError("EMPTY_SEQUENCE", "event sequence is empty");
  }

  let prevSeq = Number.NEGATIVE_INFINITY;
  let state: WorkOrderState | null = null;
  const workOrderId = events[0].workOrderId;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    if (ev.seq <= prevSeq) {
      throw new ProtocolError(
        "SEQ_NOT_MONOTONIC",
        `seq is not strictly increasing at index ${i}: ${ev.seq} <= ${prevSeq}`,
      );
    }
    prevSeq = ev.seq;

    if (ev.workOrderId !== workOrderId) {
      throw new ProtocolError(
        "WORK_ORDER_ID_MISMATCH",
        `event at index ${i} has workOrderId ${ev.workOrderId}, expected ${workOrderId}`,
      );
    }

    if (ev.type === "APPLIED") {
      if (state !== "APPLYING") {
        throw new ProtocolError(
          "APPLIED_OUTSIDE_APPLYING",
          `APPLIED event at index ${i} is only legal in APPLYING state (was ${state})`,
        );
      }
      continue; // per-step evidence; does not change state
    }

    if (state === null) {
      if (ev.type !== "RECEIVED") {
        throw new ProtocolError(
          "ILLEGAL_START",
          `first event must be RECEIVED, was ${ev.type}`,
        );
      }
      state = "RECEIVED";
      continue;
    }

    if (!canTransition(state, ev.type)) {
      throw new ProtocolError(
        "ILLEGAL_TRANSITION",
        `illegal transition ${state} -> ${ev.type} at index ${i}`,
      );
    }
    state = ev.type;
  }

  // `state` is non-null here: a non-empty sequence with a legal RECEIVED start.
  return { state: state as WorkOrderState, workOrderId };
}

// ---------------------------------------------------------------------------
// Apply authorization — the PLANNED-gate enforcement point
// ---------------------------------------------------------------------------

export interface ApplyAuthorizationInput {
  /** The plan Workforce is about to apply. */
  plan: Plan;
  /** The approval token on the WorkOrder, if any. */
  approvalToken?: ApprovalToken;
  /** The WorkOrder id, cross-checked against the token. */
  workOrderId: string;
  /**
   * Remaining budget lease in minor units. If provided and the plan's estimate
   * exceeds it, approval is required regardless of the `requiresApproval` flag.
   */
  remainingLeaseMinorUnits?: number;
  /** Current time (ISO). Required to check token expiry; caller supplies it. */
  now: string;
}

export interface ApplyAuthorizationResult {
  ok: boolean;
  code?: ProtocolErrorCode;
  reason?: string;
}

/**
 * Decide whether a plan may move `APPROVED -> APPLYING`.
 *
 * A plan requires approval iff it contains an irreversible step, sets
 * `requiresApproval`, or (when a lease is supplied) exceeds the remaining lease.
 * When approval is required, a token must be present, name this WorkOrder,
 * commit to this exact plan's hash, and not be expired.
 *
 * Returns a result object (does not throw) so callers can branch; use
 * `assertApplyAuthorized` for the throwing variant.
 */
export function checkApplyAuthorization(
  input: ApplyAuthorizationInput,
): ApplyAuthorizationResult {
  const { plan, approvalToken, workOrderId, remainingLeaseMinorUnits, now } = input;

  const overBudget =
    remainingLeaseMinorUnits !== undefined &&
    plan.estimatedCostMinorUnits > remainingLeaseMinorUnits;
  const hasIrreversible = plan.changes.some((c) => c.tier === "irreversible");
  const requiresApproval = plan.requiresApproval || hasIrreversible || overBudget;

  if (!requiresApproval) {
    return { ok: true };
  }

  if (!approvalToken) {
    return {
      ok: false,
      code: "APPROVAL_REQUIRED",
      reason: overBudget
        ? "plan exceeds the remaining budget lease and has no approval token"
        : "plan requires approval (irreversible/over-budget) and has no approval token",
    };
  }

  if (approvalToken.workOrderId !== workOrderId) {
    return {
      ok: false,
      code: "APPROVAL_WORK_ORDER_MISMATCH",
      reason: `approval token is for ${approvalToken.workOrderId}, not ${workOrderId}`,
    };
  }

  const expected = computePlanHash(
    plan as unknown as Record<string, unknown> & { planHash: string },
  );
  if (approvalToken.planHash !== expected) {
    return {
      ok: false,
      code: "PLAN_HASH_MISMATCH",
      reason: `approval token planHash ${approvalToken.planHash} does not match current plan hash ${expected}`,
    };
  }

  if (now > approvalToken.expiresAt) {
    return {
      ok: false,
      code: "APPROVAL_EXPIRED",
      reason: `approval token expired at ${approvalToken.expiresAt} (now ${now})`,
    };
  }

  return { ok: true };
}

/** Throwing variant of {@link checkApplyAuthorization}. */
export function assertApplyAuthorized(input: ApplyAuthorizationInput): void {
  const result = checkApplyAuthorization(input);
  if (!result.ok) {
    throw new ProtocolError(result.code ?? "APPROVAL_REQUIRED", result.reason ?? "apply not authorized");
  }
}
