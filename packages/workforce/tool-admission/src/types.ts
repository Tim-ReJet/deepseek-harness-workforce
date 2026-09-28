/**
 * Config and projection types for Workforce tool-call admission.
 *
 * @module @deepseek-ai/dsh-workforce-tool-admission/types
 */

import type { CapabilityManifest } from '@workforce/permit-compiler'
import type { DelegationPlan } from '@reactorjet/workforce-contracts'

/** One registered tool's ActionIntent projection rule. */
export interface ToolProjectionSpec {
  /** DSH semantic action label, e.g. `scm.repository.write`. */
  semanticAction: string
  /** Resource ref `target.type`, e.g. `filesystem`. */
  targetType: string
  /**
   * Dot path into tool arguments for the filesystem path / resource id
   * (e.g. `path` for write tools).
   */
  pathArgument: string
  /** Optional tool binding version recorded on the ActionIntent. */
  toolVersion?: string
}

/** Parsed Cell identity fields copied onto every projected ActionIntent. */
export interface WorkforceCellIdentity {
  workOrderId: string
  runId: string
  cellId: string
  taskId: string
}

/** Runtime admission inputs validated at plugin load. */
export interface WorkforceAdmissionRuntime {
  readonly enabled: boolean
  readonly manifest: CapabilityManifest
  readonly cell: WorkforceCellIdentity
  readonly projections: ReadonlyMap<string, ToolProjectionSpec>
  readonly delegationPlan?: DelegationPlan
  readonly workerId?: string
}
