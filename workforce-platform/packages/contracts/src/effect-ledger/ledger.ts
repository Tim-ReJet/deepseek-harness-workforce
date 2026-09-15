/**
 * ledger.ts — pure in-memory effect-reservation ledger (plan 15's
 * "Effect Ledger reservation" + effect state machine), scoped to this
 * slice's in-memory subset: no Postgres, no `effect_events` append log, no
 * real concurrent writers. A `Map` keyed by idempotency key stands in for
 * the unique-index reservation race described in the plan; tests exercise
 * transition legality and fencing sequentially, not real concurrency.
 *
 * Design choice (documented per the brief): `reserve()` inserts a row
 * directly in `RESERVED` state on first call rather than modeling the
 * `PROPOSED`→`AUTHORIZED`→`RESERVED` prefix — those two earlier states are
 * still legal transition targets via `transition()` for a caller that wants
 * to model them explicitly (e.g. starting a row at `PROPOSED` some other
 * way), but `reserve()` itself is the "insert or lock ledger row by
 * idempotency key" step (plan 15, reservation transaction step 5), which is
 * exactly the RESERVED step in the runtime path.
 */

export const EFFECT_LEDGER_STATES = [
  "PROPOSED",
  "AUTHORIZED",
  "RESERVED",
  "EXECUTING",
  "COMMITTED",
  "FAILED",
  "UNKNOWN",
  "COMPENSATING",
  "COMPENSATED",
  "COMPENSATION_FAILED",
] as const;
export type EffectLedgerState = (typeof EFFECT_LEDGER_STATES)[number];

export interface EffectLedgerRow {
  effectId: string;
  idempotencyKey: string;
  requestDigest: string;
  state: EffectLedgerState;
  ownerFence: number;
}

export interface ReserveInput {
  effectId: string;
  idempotencyKey: string;
  requestDigest: string;
  ownerFence: number;
}

export interface TransitionOptions {
  ownerFence: number;
}

/** Legal forward edges of the plan 15 effect state machine. */
const LEGAL_EDGES: Record<EffectLedgerState, readonly EffectLedgerState[]> = {
  PROPOSED: ["AUTHORIZED"],
  AUTHORIZED: ["RESERVED"],
  RESERVED: ["EXECUTING"],
  EXECUTING: ["COMMITTED", "FAILED", "UNKNOWN"],
  COMMITTED: ["COMPENSATING"],
  FAILED: [],
  UNKNOWN: [],
  COMPENSATING: ["COMPENSATED", "COMPENSATION_FAILED", "UNKNOWN"],
  COMPENSATED: [],
  COMPENSATION_FAILED: [],
};

/** States in which the effect's outcome is not settled enough to pass. */
const BLOCKING_STATES: ReadonlySet<EffectLedgerState> = new Set([
  "UNKNOWN",
  "EXECUTING",
  "COMPENSATING",
  "COMPENSATION_FAILED",
]);

export class EffectLedger {
  private readonly rows = new Map<string, EffectLedgerRow>();

  /**
   * First call for an idempotency key inserts a new `RESERVED` row. A
   * repeat call with the same key returns the existing row unchanged (no
   * duplicate reservation, no re-fencing) — the idempotent-replay case.
   */
  reserve(input: ReserveInput): EffectLedgerRow {
    const existing = this.rows.get(input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const row: EffectLedgerRow = {
      effectId: input.effectId,
      idempotencyKey: input.idempotencyKey,
      requestDigest: input.requestDigest,
      state: "RESERVED",
      ownerFence: input.ownerFence,
    };
    this.rows.set(input.idempotencyKey, row);
    return row;
  }

  /**
   * Advance a row's state. Throws on an unknown key, an illegal edge, or a
   * stale fence (`ownerFence` lower than the row's current fence — a
   * superseded Cell generation trying to write).
   */
  transition(
    idempotencyKey: string,
    nextState: EffectLedgerState,
    options: TransitionOptions,
  ): EffectLedgerRow {
    const row = this.rows.get(idempotencyKey);
    if (!row) {
      throw new Error(`EffectLedger: no row for idempotency key ${idempotencyKey}`);
    }
    if (options.ownerFence < row.ownerFence) {
      throw new Error(
        `EffectLedger: stale owner fence ${options.ownerFence} < ${row.ownerFence} for ${idempotencyKey}`,
      );
    }
    const allowed = LEGAL_EDGES[row.state];
    if (!allowed.includes(nextState)) {
      throw new Error(`EffectLedger: illegal transition ${row.state} -> ${nextState}`);
    }
    row.state = nextState;
    row.ownerFence = options.ownerFence;
    return row;
  }

  getByKey(idempotencyKey: string): EffectLedgerRow | undefined {
    return this.rows.get(idempotencyKey);
  }
}

/**
 * `false` while the effect's outcome is unsettled (`UNKNOWN`, still
 * `EXECUTING`/`COMPENSATING`, or a failed compensation) — these must block
 * a final PASS-style check per plan 15 ("`UNKNOWN` is first-class and
 * blocks final PASS when the effect is relevant"). `true` only once the
 * effect has reached a settled, verified-good terminal state.
 */
export function allowsAssurancePass(row: EffectLedgerRow): boolean {
  if (BLOCKING_STATES.has(row.state)) {
    return false;
  }
  return row.state === "COMMITTED" || row.state === "COMPENSATED";
}
