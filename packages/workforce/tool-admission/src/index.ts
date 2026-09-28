/**
 * Workforce Cell in-process tool-call admission: project each call to
 * ActionIntent, run `@workforce/dsh-nono-bridge` checks, deny before dispatch
 * when not allowed.
 *
 * @module @deepseek-ai/dsh-workforce-tool-admission
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { admitProjectedActionIntent } from './admit.ts'
import { formatAdmissionDenial, resolveAdmissionRuntime, type Config as PluginConfig } from './config.ts'
import { projectToolCallToActionIntent } from './projection.ts'

export type * from './types.ts'
export { projectToolCallToActionIntent } from './projection.ts'
export { admitProjectedActionIntent } from './admit.ts'
export { Config, formatAdmissionDenial, resolveAdmissionRuntime } from './config.ts'
export type { Config as WorkforceToolAdmissionConfig } from './config.ts'

export const name = 'workforce-tool-admission'

export const inject = ['tools'] as const

/**
 * Register the pre-execute admission gate. The tool body runs only after the
 * bridge returns `allowed: true`; denials surface as structured pre-execute
 * failures without invoking the tool.
 */
export function apply(ctx: Context, config: PluginConfig): void {
  const runtime = resolveAdmissionRuntime(config)

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!runtime.enabled) return next()

    const spec = runtime.projections.get(exec.name)
    if (spec === undefined) {
      return {
        kind: 'deny',
        reason: formatAdmissionDenial(
          `tool "${exec.name}" has no ActionIntent projection; unmapped tools are denied.`,
        ),
      }
    }

    let intent
    try {
      intent = projectToolCallToActionIntent(exec, spec, runtime.cell)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        kind: 'deny',
        reason: formatAdmissionDenial(`ActionIntent projection failed: ${message}`),
      }
    }

    const decision = admitProjectedActionIntent(runtime, intent)
    if (!decision.allowed) {
      return { kind: 'deny', reason: formatAdmissionDenial(decision.reason) }
    }

    return next()
  })
}
