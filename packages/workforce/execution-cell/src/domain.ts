/**
 * Host-side Cell loop helpers: workflow engine typing and gate comparison
 * utilities. Kept separate from ./types.ts because these import
 * `@deepseek-ai/dsh-workflow`.
 *
 * @module @deepseek-ai/dsh-workforce-execution-cell
 */

import type { WorkflowEngine } from '@deepseek-ai/dsh-workflow'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { CellGate, CellLoopConfig, CellTask, CellTaskAttempt } from './types.ts'

export type { WorkflowEngine }

/** Producer name stamped on EvidenceIndex agency rows from this package. */
export const EXECUTION_CELL_EVIDENCE_PRODUCER =
  '@deepseek-ai/dsh-workforce-execution-cell' as const

/** Workflow meta block for each attempt-cycle run. */
export const CELL_LOOP_ATTEMPT_META = {
  name: 'cell-loop-attempt',
  description: 'One Cell Task/Gate attempt cycle materialized through the workflow engine seam.',
} as const

/** Inputs required to drive the loop besides tasks and bounds. */
export interface RunCellLoopParams {
  readonly tasks: readonly CellTask[]
  readonly config: CellLoopConfig
  readonly engine: WorkflowEngine
  readonly parent: Agent
  readonly signal?: AbortSignal
}

/** Materialize a {@link WorkflowStartRequest} that returns one attempt payload. */
export function buildAttemptWorkflowRequest(
  parent: Agent,
  attempt: CellTaskAttempt,
  signal?: AbortSignal,
): WorkflowStartRequest {
  return {
    parent,
    ...(signal !== undefined ? { signal } : {}),
    meta: CELL_LOOP_ATTEMPT_META,
    args: { attempt },
    script: 'return args.attempt',
  }
}

/**
 * Compare two gates for no-progress detection (reason + evidenceRefs only).
 * @param left - prior gate.
 * @param right - next gate.
 * @returns true when both reason and evidenceRefs are identical.
 */
export function gatesAreStagnant(left: CellGate, right: CellGate): boolean {
  if (left.reason !== right.reason) return false
  if (left.evidenceRefs.length !== right.evidenceRefs.length) return false
  for (let index = 0; index < left.evidenceRefs.length; index += 1) {
    if (left.evidenceRefs[index] !== right.evidenceRefs[index]) return false
  }
  return true
}

/**
 * Resolve the repair task id after a FAIL gate, or undefined when none applies.
 * @param tasks - ordered task list (index 0 baseline, index 1+ repair lanes).
 * @param currentTaskId - the task that produced the FAIL gate.
 * @param childDepth - current depth before selecting repair.
 * @param config - caller bounds (maxChildDepth honored here).
 * @returns next task id or undefined when repair is unavailable.
 */
export function selectRepairTaskId(
  tasks: readonly CellTask[],
  currentTaskId: string,
  childDepth: number,
  config: CellLoopConfig,
): string | undefined {
  if (childDepth >= config.maxChildDepth) return undefined
  const currentIndex = tasks.findIndex(task => task.id === currentTaskId)
  if (currentIndex < 0) return undefined
  const repair = tasks[currentIndex + 1]
  return repair?.id
}
