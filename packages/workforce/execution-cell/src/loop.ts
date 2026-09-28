/**
 * Bounded Cell Task/Gate/Loop over the existing workflow engine — one workflow
 * run per attempt cycle, caller-supplied bounds only.
 *
 * @module @deepseek-ai/dsh-workforce-execution-cell
 */

import type { WorkflowResult } from '@deepseek-ai/dsh-workflow'
import {
  buildAttemptWorkflowRequest,
  gatesAreStagnant,
  selectRepairTaskId,
  type RunCellLoopParams,
} from './domain.ts'
import type {
  CellGate,
  CellLoopAttemptRecord,
  CellLoopResult,
  CellLoopStopReason,
  CellTaskAttempt,
} from './types.ts'

/**
 * Run the bounded evaluation/repair loop: baseline/repair tasks, local gates,
 * and one `engine.start()` per attempt cycle.
 * @param params - tasks, bounds, engine, parent agent, optional cancel signal.
 * @returns every attempt, final gate, and an infrastructure stopReason.
 */
export async function runCellLoop(params: RunCellLoopParams): Promise<CellLoopResult> {
  const { tasks, config, engine, parent, signal } = params
  const attempts: CellLoopAttemptRecord[] = []
  let stagnationStreak = 0
  let totalCost = 0
  const startedAt = Date.now()
  let activeTaskId = tasks[0]?.id
  if (activeTaskId === undefined) {
    return { attempts: [], stopReason: 'attempts-exhausted' }
  }
  let childDepth = 0
  let previousGate: CellGate | undefined

  const finish = (stopReason: CellLoopStopReason): CellLoopResult => {
    const finalGate = attempts.at(-1)?.gate
    return finalGate === undefined
      ? { attempts, stopReason }
      : { attempts, stopReason, finalGate }
  }

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    if (signal?.aborted) return finish('cancelled')

    const elapsedMs = Date.now() - startedAt
    if (config.maxWallMs !== undefined && elapsedMs > config.maxWallMs) {
      return finish('attempts-exhausted')
    }

    const task = tasks.find(entry => entry.id === activeTaskId)
    if (task === undefined) return finish('attempts-exhausted')

    let attempt: CellTaskAttempt
    try {
      attempt = await task.run({
        attempt: iteration + 1,
        childDepth,
        ...(signal !== undefined ? { signal } : {}),
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      attempt = {
        taskId: task.id,
        gate: {
          verdict: 'FAIL',
          reason: message,
          evidenceRefs: [],
        },
      }
    }

    const run = engine.start(buildAttemptWorkflowRequest(parent, attempt, signal))
    const workflowResult: WorkflowResult = await run.result
    await run.dispose()

    const gate = normalizeGate(attempt.gate)
    const record: CellLoopAttemptRecord = {
      iteration,
      taskId: attempt.taskId,
      childDepth,
      gate,
      ...(workflowResult.stopReason !== 'completed'
        ? {
          workflowStopReason: workflowResult.stopReason,
          workflowError: workflowResult.error,
        }
        : {}),
    }
    attempts.push(record)

    if (signal?.aborted || workflowResult.stopReason === 'cancelled') return finish('cancelled')

    if (attempt.costUnits !== undefined) {
      totalCost += attempt.costUnits
      if (config.maxCost !== undefined && totalCost > config.maxCost) {
        return finish('attempts-exhausted')
      }
    }

    if (workflowResult.stopReason === 'error') {
      stagnationStreak = updateStagnation(previousGate, gate, stagnationStreak)
      previousGate = gate
      if (stagnationStreak >= config.noProgressThreshold) return finish('no-progress')
      const repairId = selectRepairTaskId(tasks, activeTaskId, childDepth, config)
      if (repairId !== undefined) {
        activeTaskId = repairId
        childDepth += 1
      }
      continue
    }

    if (gate.verdict === 'PASS' || gate.verdict === 'INDETERMINATE') {
      return finish('converged')
    }

    stagnationStreak = updateStagnation(previousGate, gate, stagnationStreak)
    previousGate = gate
    if (stagnationStreak >= config.noProgressThreshold) return finish('no-progress')

    const repairId = selectRepairTaskId(tasks, activeTaskId, childDepth, config)
    if (repairId !== undefined) {
      activeTaskId = repairId
      childDepth += 1
    }
  }

  return finish('attempts-exhausted')
}

function normalizeGate(gate: CellGate): CellGate {
  return {
    verdict: gate.verdict,
    reason: gate.reason,
    evidenceRefs: [...gate.evidenceRefs],
  }
}

function updateStagnation(previous: CellGate | undefined, next: CellGate, streak: number): number {
  if (previous !== undefined && gatesAreStagnant(previous, next)) return streak + 1
  return 0
}
