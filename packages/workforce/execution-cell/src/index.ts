/**
 * Workforce Cell bounded Task/Gate/Loop policy over `ctx.workflowEngine` and
 * a local workforce.evidence-index/v1 exporter (unsigned evidence only).
 *
 * @module @deepseek-ai/dsh-workforce-execution-cell
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { runCellLoop } from './loop.ts'
import {
  exportEvidenceIndex,
  writeEvidenceIndexToWorkspace,
} from './evidence-exporter.ts'
import type { CellLoopConfig, CellLoopResult, CellTask } from './types.ts'

export type * from './types.ts'
export type { RunCellLoopParams, WorkflowEngine } from './domain.ts'
export {
  EXECUTION_CELL_EVIDENCE_PRODUCER,
  CELL_LOOP_ATTEMPT_META,
  buildAttemptWorkflowRequest,
  gatesAreStagnant,
  selectRepairTaskId,
} from './domain.ts'
export { runCellLoop } from './loop.ts'
export {
  exportEvidenceIndex,
  writeEvidenceIndexToWorkspace,
  EVIDENCE_INDEX_WORKSPACE_REL,
} from './evidence-exporter.ts'

/** Cordis function-plugin name. */
export const name = 'workforce-execution-cell'

/** Required services before this plugin is loaded on the Cell profile. */
export const inject = ['workflowEngine']

/** Optional Cell workspace export targets (all optional — loop API stays usable without a plugin config). */
export interface Config {
  /** When set with {@link Config.autoExportOnDispose}, export on fiber dispose. */
  workspaceDir?: string
  /** WorkOrder id stamped on exported EvidenceIndex drafts. */
  workOrderId?: string
  /** Run id stamped on exported EvidenceIndex drafts. */
  runId?: string
  /** Cell id stamped on exported EvidenceIndex drafts. */
  cellId?: string
  /** Persist the last {@link runCellLoop} result when the hosting fiber disposes. */
  autoExportOnDispose?: boolean
}

interface CellLoopHost {
  run(tasks: readonly CellTask[], config: CellLoopConfig, parent: Agent, signal?: AbortSignal): Promise<CellLoopResult>
  getLastResult(): CellLoopResult | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workforceExecutionCell?: CellLoopHost
  }
}

/**
 * Register the Cell loop host on `ctx.workforceExecutionCell` and optionally
 * export EvidenceIndex JSON on dispose when configured.
 * @param ctx - Cordis context carrying `ctx.workflowEngine`.
 * @param config - optional workspace export ids/path.
 */
export function apply(ctx: Context, config: Config = {}): void {
  let lastResult: CellLoopResult | undefined

  const host: CellLoopHost = {
    run: async (tasks, loopConfig, parent, signal) => {
      lastResult = await runCellLoop({
        tasks,
        config: loopConfig,
        engine: ctx.workflowEngine,
        parent,
        ...(signal !== undefined ? { signal } : {}),
      })
      return lastResult
    },
    getLastResult: () => lastResult,
  }

  ctx.provide('workforceExecutionCell')
  ctx.set('workforceExecutionCell', host)

  if (!config.autoExportOnDispose || config.workspaceDir === undefined) return

  const workspaceDir = config.workspaceDir
  ctx.effect(() => () => {
    void (async () => {
      const result = lastResult
      if (result === undefined) return
      const workOrderId = config.workOrderId ?? '01JWORK0000000000000000000'
      const runId = config.runId ?? '01JRUN00000000000000000000'
      const cellId = config.cellId ?? '01JCELL0000000000000000000'
      const draft = exportEvidenceIndex(result, { workOrderId, runId, cellId })
      await writeEvidenceIndexToWorkspace(workspaceDir, draft)
    })()
  }, 'workforce-execution-cell: evidence export on dispose')
}
