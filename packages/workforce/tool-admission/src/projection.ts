/**
 * Project one in-process tool call into a Workforce `ActionIntent`.
 *
 * @module @deepseek-ai/dsh-workforce-tool-admission/projection
 */

import {
  ACTION_INTENT_SCHEMA,
  actionIntent,
  computeArtifactDigest,
  generateUlid,
  type ActionIntent,
} from '@reactorjet/workforce-contracts'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ToolProjectionSpec, WorkforceCellIdentity } from './types.ts'

/** Read a dot-separated path from a plain arguments object. */
function readArgumentPath(args: unknown, path: string): string {
  if (args === null || typeof args !== 'object') {
    throw new TypeError('tool arguments must be an object for ActionIntent projection')
  }
  const segments = path.split('.')
  let current: unknown = args
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      throw new TypeError(`missing projection path "${path}" on tool arguments`)
    }
    current = (current as Record<string, unknown>)[segment]
  }
  if (typeof current !== 'string' || current.length === 0) {
    throw new TypeError(`projection path "${path}" must resolve to a non-empty string`)
  }
  return current
}

/**
 * Build a runtime ActionIntent for one tool call using the configured
 * projection spec and Cell identity.
 *
 * @param exec - prepared tool execution (frozen arguments).
 * @param spec - per-tool projection rule.
 * @param cell - WorkOrder/run/cell/task ids for the intent envelope.
 * @returns parsed canonical ActionIntent.
 */
export function projectToolCallToActionIntent(
  exec: ToolExecution,
  spec: ToolProjectionSpec,
  cell: WorkforceCellIdentity,
): ActionIntent {
  const relativePath = readArgumentPath(exec.arguments, spec.pathArgument)
  const parameters = exec.arguments !== null && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments)
    ? { ...(exec.arguments as Record<string, unknown>), path: relativePath }
    : { path: relativePath }

  const withoutDigest = {
    schema: ACTION_INTENT_SCHEMA,
    id: generateUlid(),
    workOrderId: cell.workOrderId,
    runId: cell.runId,
    cellId: cell.cellId,
    taskId: cell.taskId,
    semanticAction: spec.semanticAction,
    target: { type: spec.targetType, id: relativePath },
    parameters,
    toolBinding: {
      toolName: exec.name,
      ...(spec.toolVersion === undefined ? {} : { version: spec.toolVersion }),
    },
    createdAt: new Date().toISOString(),
    digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  }

  const digest = computeArtifactDigest(withoutDigest)
  return actionIntent.parse({ ...withoutDigest, digest })
}
