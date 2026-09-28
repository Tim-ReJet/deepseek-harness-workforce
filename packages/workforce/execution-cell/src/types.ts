/**
 * Pure Cell Task/Gate/Loop vocabulary: local evaluation and loop lifecycle
 * types only — no Cordis or workflow engine imports (client-safe `./types`
 * outlet mirrors `@deepseek-ai/dsh-goal/types`).
 *
 * @module @deepseek-ai/dsh-workforce-execution-cell/types
 */

/** Local gate verdict — never equated with Workforce OutcomeAttestation.verdict. */
export type CellGateVerdict = 'PASS' | 'FAIL' | 'INDETERMINATE'

/** Why the bounded loop stopped — infrastructure vocabulary, not a gate verdict. */
export type CellLoopStopReason =
  | 'converged'
  | 'attempts-exhausted'
  | 'no-progress'
  | 'cancelled'

/** Caller-supplied bounds; field names mirror DelegationPlan.recursion. */
export interface CellLoopConfig {
  readonly maxIterations: number
  readonly maxChildDepth: number
  readonly noProgressThreshold: number
  readonly maxCost?: number
  readonly maxWallMs?: number
}

/** Unsigned local evaluation for one task attempt. */
export interface CellGate {
  readonly verdict: CellGateVerdict
  readonly reason: string
  readonly evidenceRefs: readonly string[]
}

/** Host context passed into each {@link CellTask.run}. */
export interface CellTaskContext {
  /** 1-based attempt index within the current loop run. */
  readonly attempt: number
  /** Depth of repair/delegation nesting within this Cell (0 = root task lane). */
  readonly childDepth: number
  readonly signal?: AbortSignal
}

/** One deterministic or agentic unit executed inside the loop. */
export interface CellTask {
  readonly id: string
  /**
   * Run one unit of work and return its local gate evaluation.
   * Must not throw for expected denials — surface them as a FAIL gate.
   * @param ctx - attempt index, depth, and optional cancel signal.
   * @returns the attempt record including its gate.
   */
  run(ctx: CellTaskContext): Promise<CellTaskAttempt>
}

/** Outcome of one task invocation before workflow materialization. */
export interface CellTaskAttempt {
  readonly taskId: string
  readonly gate: CellGate
  /** Optional opaque cost units consumed by this attempt (caller-defined). */
  readonly costUnits?: number
}

/** One loop iteration after workflow settlement is folded in. */
export interface CellLoopAttemptRecord {
  readonly iteration: number
  readonly taskId: string
  readonly childDepth: number
  readonly gate: CellGate
  readonly workflowStopReason?: 'completed' | 'cancelled' | 'error'
  readonly workflowError?: string
}

/** Full loop outcome — carries gates and stopReason, never a Workforce verdict. */
export interface CellLoopResult {
  readonly attempts: readonly CellLoopAttemptRecord[]
  readonly stopReason: CellLoopStopReason
  /** Gate from the last recorded attempt, if any. */
  readonly finalGate?: CellGate
}

/** Draft EvidenceIndex payload before digest/rootDigest are finalized. */
export interface EvidenceIndexDraft {
  readonly schema: 'workforce.evidence-index/v1'
  readonly workOrderId: string
  readonly runId: string
  readonly cellId: string
  readonly agency: readonly ProviderEvidenceRefDraft[]
  readonly enforcement: readonly ProviderEvidenceRefDraft[]
  readonly workload: readonly ProviderEvidenceRefDraft[]
  readonly effects: readonly DigestRefDraft[]
  readonly evaluations: readonly DigestRefDraft[]
  readonly children: readonly DigestRefDraft[]
  readonly requiredProducerStatus: readonly RequiredProducerStatusDraft[]
  readonly rootDigest: string
  readonly extensions?: Record<string, Record<string, unknown>>
}

/** ProviderEvidenceRef-shaped row used while assembling an export draft. */
export interface ProviderEvidenceRefDraft {
  readonly producer: string
  readonly digest: string
  readonly mediaType?: string
}

/** digestRef-shaped stub for not-yet-landed receipt types. */
export interface DigestRefDraft {
  readonly digest: string
}

/** requiredProducerStatus row for this exporter. */
export interface RequiredProducerStatusDraft {
  readonly producer: string
  readonly status: 'PRESENT' | 'MISSING' | 'PARTIAL'
}
