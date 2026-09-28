/**
 * Delegate ActionIntent admission to the Workforce nono bridge.
 *
 * @module @deepseek-ai/dsh-workforce-tool-admission/admit
 */

import type { ActionIntent } from '@reactorjet/workforce-contracts'
import {
  checkActionIntentWithOwnedPaths,
  type CheckActionIntentResult,
} from '@workforce/dsh-nono-bridge'
import type { WorkforceAdmissionRuntime } from './types.ts'

/**
 * Run manifest permit check and, when configured, ADR-029 ownedPaths gate.
 * Never accepts board or wake inputs — authority is manifest + sealed plan only.
 *
 * @param runtime - validated admission runtime from plugin config.
 * @param intent - projected ActionIntent for the pending tool call.
 * @returns bridge allow/deny result.
 */
export function admitProjectedActionIntent(
  runtime: WorkforceAdmissionRuntime,
  intent: ActionIntent,
): CheckActionIntentResult {
  if (runtime.delegationPlan === undefined || runtime.workerId === undefined) {
    return {
      allowed: false,
      reason:
        'sealed DelegationPlan and workerId are required for tool admission (ADR-029); manifest-only checkActionIntent is not permitted when admission is enabled.',
    }
  }
  return checkActionIntentWithOwnedPaths({
    intent,
    manifest: runtime.manifest,
    delegationPlan: runtime.delegationPlan,
    workerId: runtime.workerId,
  })
}
