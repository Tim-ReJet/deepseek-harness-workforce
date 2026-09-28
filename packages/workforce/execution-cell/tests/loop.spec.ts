/**
 * Bounded Cell loop behavior: convergence, no-progress, permit-shaped FAIL, cancel.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  WorkflowEngine,
  WorkflowRunId,
  type WorkflowRun,
  type WorkflowStartRequest,
  type WorkflowResult,
} from '@deepseek-ai/dsh-workflow'
import { runCellLoop } from '../src/loop.ts'
import type { CellGate, CellLoopConfig, CellTask, CellTaskAttempt, CellTaskContext } from '../src/types.ts'

class RecordingEngine extends WorkflowEngine {
  readonly runs: WorkflowStartRequest[] = []

  start(request: WorkflowStartRequest): WorkflowRun {
    this.runs.push(request)
    const id = WorkflowRunId(`run-${String(this.runs.length)}`)
    let outcome: WorkflowResult = {
      value: request.args,
      stopReason: 'completed',
      agentsStarted: 0,
    }
    if (request.signal?.aborted) {
      outcome = { value: null, stopReason: 'cancelled', agentsStarted: 0 }
    }
    request.signal?.addEventListener('abort', () => {
      outcome = { value: null, stopReason: 'cancelled', agentsStarted: 0 }
    }, { once: true })

    return {
      id,
      meta: request.meta,
      result: Promise.resolve().then(() => {
        if (request.signal?.aborted) {
          return { value: null, stopReason: 'cancelled', agentsStarted: 0 } satisfies WorkflowResult
        }
        return outcome
      }),
      cancel() {
        outcome = { value: null, stopReason: 'cancelled', agentsStarted: 0 }
      },
      async dispose() {},
    }
  }
}

function parentStub(): Agent {
  return { id: 'agent-parent' } as Agent
}

function gate(verdict: CellGate['verdict'], reason: string, evidenceRefs: string[] = []): CellGate {
  return { verdict, reason, evidenceRefs }
}

function task(id: string, handler: (ctx: CellTaskContext) => Promise<CellTaskAttempt>): CellTask {
  return {
    id,
    run: handler,
  }
}

const baseConfig: CellLoopConfig = {
  maxIterations: 5,
  maxChildDepth: 2,
  noProgressThreshold: 2,
}

describe('runCellLoop', () => {
  it('stops converged with a PASS gate within bounds', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingEngine)
    const engine = ctx.workflowEngine as RecordingEngine

    const tasks = [
      task('baseline', async () => ({
        taskId: 'baseline',
        gate: gate('PASS', 'checks ok', ['ev-1']),
      })),
    ]

    const result = await runCellLoop({
      tasks,
      config: baseConfig,
      engine,
      parent: parentStub(),
    })

    expect(result.stopReason).toBe('converged')
    expect(result.finalGate?.verdict).toBe('PASS')
    expect(engine.runs).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('trips no-progress before maxIterations when FAIL gates stagnate', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingEngine)
    const engine = ctx.workflowEngine as RecordingEngine

    const stagnant = gate('FAIL', 'same', ['e1'])
    const tasks = [
      task('baseline', async () => ({ taskId: 'baseline', gate: stagnant })),
      task('repair', async () => ({ taskId: 'repair', gate: stagnant })),
    ]

    const result = await runCellLoop({
      tasks,
      config: { ...baseConfig, maxIterations: 10, noProgressThreshold: 2 },
      engine,
      parent: parentStub(),
    })

    expect(result.stopReason).toBe('no-progress')
    expect(result.attempts.length).toBeLessThan(10)
    await ctx.fiber.dispose()
  })

  it('surfaces permit-shaped task rejection as CellGate FAIL without throwing', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingEngine)
    const engine = ctx.workflowEngine as RecordingEngine

    const tasks = [
      task('denied', async () => {
        throw new Error('Workforce tool admission denied: missing DelegationPlan')
      }),
    ]

    const result = await runCellLoop({
      tasks,
      config: { ...baseConfig, maxIterations: 1 },
      engine,
      parent: parentStub(),
    })

    expect(result.finalGate?.verdict).toBe('FAIL')
    expect(result.finalGate?.reason).toContain('DelegationPlan')
    await ctx.fiber.dispose()
  })

  it('stops with cancelled when the signal aborts before the next attempt', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingEngine)
    const engine = ctx.workflowEngine as RecordingEngine
    const controller = new AbortController()

    const tasks = [
      task('baseline', async () => {
        controller.abort()
        return { taskId: 'baseline', gate: gate('FAIL', 'keep going') }
      }),
      task('repair', async () => ({ taskId: 'repair', gate: gate('PASS', 'done') })),
    ]

    const result = await runCellLoop({
      tasks,
      config: baseConfig,
      engine,
      parent: parentStub(),
      signal: controller.signal,
    })

    expect(result.stopReason).toBe('cancelled')
    expect(result.attempts.length).toBe(1)
    await ctx.fiber.dispose()
  })
})
