/**
 * Validate plugin config into a runtime admission context.
 *
 * @module @deepseek-ai/dsh-workforce-tool-admission/config
 */

import z from '@deepseek-ai/schemastery'
import {
  computeArtifactDigest,
  delegationPlan,
  type DelegationPlan,
} from '@reactorjet/workforce-contracts'
import type { CapabilityManifest } from '@workforce/permit-compiler'
import type { ToolProjectionSpec, WorkforceAdmissionRuntime, WorkforceCellIdentity } from './types.ts'

/** Cordis plugin config for Workforce tool admission. */
export interface Config {
  /** When false, the listener is a no-op (default true). */
  enabled?: boolean
  /** Compiled NONO-002 capability manifest for this Cell generation. */
  manifest: CapabilityManifest
  /** Sealed delegation plan for ownedPaths checks; omit to skip ownedPaths gate. */
  delegationPlan?: DelegationPlan
  /** Worker id within `delegationPlan.workers`; required when `delegationPlan` is set. */
  workerId?: string
  workOrderId: string
  runId: string
  cellId: string
  taskId: string
  /** Tool name → ActionIntent projection spec. Unlisted tools fail closed. */
  projections: Record<string, ToolProjectionSpec>
}

const projectionSpecSchema = z.object({
  semanticAction: z.string().min(1),
  targetType: z.string().min(1),
  pathArgument: z.string().min(1),
})

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  manifest: z.any(),
  delegationPlan: z.any(),
  workerId: z.any(),
  workOrderId: z.string().min(1),
  runId: z.string().min(1),
  cellId: z.string().min(1),
  taskId: z.string().min(1),
  projections: z.dict(projectionSpecSchema),
})

/** Model-facing denial prefix for structured bridge reasons. */
export function formatAdmissionDenial(reason: string): string {
  return `Workforce tool admission denied: ${reason}`
}

/**
 * Parse and validate config at plugin load.
 *
 * @param raw - loader-supplied config object.
 * @returns frozen runtime used by the pre-execute listener.
 */
export function resolveAdmissionRuntime(raw: Config): WorkforceAdmissionRuntime {
  if (raw.delegationPlan !== undefined && raw.workerId === undefined) {
    throw new Error('workforce-tool-admission: workerId is required when delegationPlan is configured')
  }
  if (raw.workerId !== undefined && raw.delegationPlan === undefined) {
    throw new Error('workforce-tool-admission: delegationPlan is required when workerId is configured')
  }

  let sealedPlan: DelegationPlan | undefined
  if (raw.delegationPlan !== undefined) {
    const parsed = delegationPlan.parse(raw.delegationPlan)
    sealedPlan = { ...parsed, digest: computeArtifactDigest(parsed) }
  }

  const cell: WorkforceCellIdentity = {
    workOrderId: raw.workOrderId,
    runId: raw.runId,
    cellId: raw.cellId,
    taskId: raw.taskId,
  }

  const projections = new Map<string, ToolProjectionSpec>(Object.entries(raw.projections))

  return {
    enabled: raw.enabled ?? true,
    manifest: raw.manifest,
    cell,
    projections,
    ...(sealedPlan === undefined ? {} : { delegationPlan: sealedPlan }),
    ...(raw.workerId === undefined ? {} : { workerId: raw.workerId }),
  }
}
