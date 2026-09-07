/**
 * Durable WorkOrder binding for a Workforce Session: the
 * `workforce/workorder-bound` SessionEvent plus its folded
 * `workforceSessionBinding` read projection over `ctx.sessionProjections`.
 * Plan 04's "WorkOrder binding as durable SessionEvent + goal/context
 * projection", scoped to the binding fact itself.
 *
 * @module @deepseek-ai/dsh-workforce-session-events
 */

import type { Context } from '@deepseek-ai/cordis'
// Deep import — see src/types.ts's WorkOrder import comment.
import { workOrder } from '@reactorjet/workforce-contracts/src/workorder/index.ts'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import {
  decodeWorkOrderBoundPayload,
  formatProfileVersion,
  workforceSessionBindingProjectionDefinition,
} from './domain.ts'

export type * from './types.ts'
export type * from './domain.ts'
export {
  decodeWorkOrderBoundPayload,
  formatProfileVersion,
  workforceSessionBindingProjectionDefinition,
} from './domain.ts'

/** Cordis function-plugin name. */
export const name = 'workforce-session-events'
/** Service required before this package can register its projection. */
export const inject = ['sessionProjections']

/**
 * Validate a candidate WorkOrder against the canonical `biro.workorder/v2`
 * schema and append the durable `workforce/workorder-bound` binding event.
 * Nothing is appended when the candidate fails the canonical schema or the
 * derived payload fails its own strict shape — the session log never
 * commits a malformed bind.
 * @param session - the Session the WorkOrder binds to.
 * @param candidate - unvalidated candidate, parsed via the canonical
 *   `@reactorjet/workforce-contracts` WorkOrder schema.
 * @param boundAt - epoch milliseconds the bind is accepted; defaults to now.
 * @returns the committed `workforce/workorder-bound` session event.
 * @throws {z.ZodError} when the candidate is not a valid canonical WorkOrder.
 */
export function bindWorkOrder(
  session: Session,
  candidate: unknown,
  boundAt: number = Date.now(),
): SessionEvent<'workforce/workorder-bound'> {
  const parsed = workOrder.parse(candidate)
  const payload = decodeWorkOrderBoundPayload({
    workOrderId: parsed.id,
    workOrderDigest: parsed.digest,
    profileVersion: formatProfileVersion(parsed.extensions),
    boundAt,
  })
  return session.append('workforce/workorder-bound', payload)
}

/**
 * Install the `workforceSessionBinding` projection.
 * @param ctx - Cordis context carrying `ctx.sessionProjections`.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(workforceSessionBindingProjectionDefinition)
}
