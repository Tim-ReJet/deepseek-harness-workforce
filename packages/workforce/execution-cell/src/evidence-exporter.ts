/**
 * Fold a {@link CellLoopResult} into a workforce.evidence-index/v1-shaped draft
 * and optionally write it to the Cell workspace (unsigned, local only).
 *
 * @module @deepseek-ai/dsh-workforce-execution-cell
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { computeArtifactDigest } from '@reactorjet/workforce-contracts/src/common/digest.ts'
import { EXECUTION_CELL_EVIDENCE_PRODUCER } from './domain.ts'
import type { CellLoopResult, EvidenceIndexDraft } from './types.ts'

/** Relative path under the Cell workspace for the exported index JSON. */
export const EVIDENCE_INDEX_WORKSPACE_REL = 'workforce.evidence-index/v1.json' as const

/**
 * Build an EvidenceIndex-shaped draft from a completed loop run.
 * @param result - loop attempts and stop metadata (never a Workforce verdict).
 * @param ids - work order, run, and cell identifiers for the index header.
 * @returns draft ready for schema validation and optional persistence.
 */
export function exportEvidenceIndex(
  result: CellLoopResult,
  ids: { workOrderId: string; runId: string; cellId: string },
): EvidenceIndexDraft {
  const attemptLogDigest = computeArtifactDigest({
    schema: 'workforce.cell-attempt-log/v1',
    stopReason: result.stopReason,
    attempts: result.attempts.map(attempt => ({
      iteration: attempt.iteration,
      taskId: attempt.taskId,
      childDepth: attempt.childDepth,
      gate: attempt.gate,
      workflowStopReason: attempt.workflowStopReason,
      workflowError: attempt.workflowError,
    })),
  })

  const withoutRoot: Omit<EvidenceIndexDraft, 'rootDigest'> = {
    schema: 'workforce.evidence-index/v1',
    workOrderId: ids.workOrderId,
    runId: ids.runId,
    cellId: ids.cellId,
    agency: [{
      producer: EXECUTION_CELL_EVIDENCE_PRODUCER,
      digest: attemptLogDigest,
      mediaType: 'application/json',
    }],
    enforcement: [],
    workload: [],
    effects: [],
    evaluations: [],
    children: [],
    requiredProducerStatus: [{
      producer: EXECUTION_CELL_EVIDENCE_PRODUCER,
      status: 'PRESENT',
    }],
  }

  const rootDigest = computeArtifactDigest(withoutRoot)
  return { ...withoutRoot, rootDigest }
}

/**
 * Write the exported EvidenceIndex JSON into a Cell workspace directory.
 * @param workspaceDir - absolute or relative Cell workspace root.
 * @param draft - validated or pre-validated index draft.
 * @returns absolute path written.
 */
export async function writeEvidenceIndexToWorkspace(
  workspaceDir: string,
  draft: EvidenceIndexDraft,
): Promise<string> {
  const dir = join(workspaceDir, 'workforce.evidence-index')
  await mkdir(dir, { recursive: true })
  const target = join(dir, 'v1.json')
  await writeFile(target, `${JSON.stringify(draft, null, 2)}\n`, 'utf8')
  return target
}
