/**
 * Host-side vocabulary of the Workforce session-binding domain: the durable
 * `workforce/workorder-bound` SessionEvent, its strict decoder, and the
 * `workforceSessionBinding` fold registered on `ctx.sessionProjections`.
 * Kept separate from ./types.ts (the pure client-safe outlet) because these
 * declarations pull in `@deepseek-ai/dsh-session` and
 * `@deepseek-ai/dsh-session-projection` — the one-program-per-side layout
 * forbids that on client aggregates.
 *
 * @module @deepseek-ai/dsh-workforce-session-events
 */

import { z } from 'zod'
// Deep imports — see src/types.ts's WorkOrder import comment: the package's
// `.` barrel re-exports unrelated, pre-existing-broken modules under this
// repo's stricter compiler settings; these three files are the actual
// definitions and pull in nothing else.
import { DIGEST_REGEX } from '@reactorjet/workforce-contracts/src/common/digest.ts'
import { ULID_REGEX } from '@reactorjet/workforce-contracts/src/common/ids.ts'
import { readProfileBindingExtension } from '@reactorjet/workforce-contracts/src/execution-profile/binding.ts'
import type { Extensions } from '@reactorjet/workforce-contracts/src/common/extension.ts'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionLogOffset as SessionLogOffsetType } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { WorkforceSessionBinding, WorkforceWorkOrderBoundEvent } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records which canonical WorkOrder (`biro.workorder/v2`,
     * `@reactorjet/workforce-contracts`) this Session is bound to: the
     * WorkOrder's id and content digest, plus the resolved
     * `workforce.execution-profile/v1` binding in force at bind time.
     * Biro issues and owns WorkOrder; this event only records a reference
     * to it, never a copy of its objective, scope, or acceptance state.
     */
    'workforce/workorder-bound': WorkforceWorkOrderBoundEvent
  }
}

/**
 * Format the resolved `workforce.execution-profile/v1` binding read off a
 * WorkOrder's `extensions` field as a stable string, or `'unresolved'`
 * before a binding extension exists (see `readProfileBindingExtension`,
 * which itself never throws for an absent or malformed entry).
 * @param extensions - the bound WorkOrder's `extensions` field.
 * @returns `"<profileId>@<profileVersion>"`, or `'unresolved'`.
 */
export function formatProfileVersion(extensions: Extensions): string {
  const binding = readProfileBindingExtension(extensions)
  return binding === undefined ? 'unresolved' : `${binding.profileId}@${binding.profileVersion}`
}

/** Strict runtime shape of one `workforce/workorder-bound` payload. */
const workOrderBoundPayloadSchema = z.object({
  workOrderId: z.string().regex(ULID_REGEX),
  workOrderDigest: z.string().regex(DIGEST_REGEX),
  profileVersion: z.string().min(1),
  boundAt: z.number().int().nonnegative(),
}).strict()

/**
 * Decode and validate one candidate `workforce/workorder-bound` payload.
 * Used both to validate a payload before it is appended and to replay one
 * already-committed event during a projection fold.
 * @param candidate - unvalidated payload.
 * @returns the validated payload.
 * @throws {z.ZodError} when the candidate does not match the strict shape.
 */
export function decodeWorkOrderBoundPayload(candidate: unknown): WorkforceWorkOrderBoundEvent {
  return workOrderBoundPayloadSchema.parse(candidate)
}

/** Persisted projection state: the immutable inherited cut plus the current binding. */
export interface WorkforceSessionBindingState {
  readonly inheritedEventCount: SessionLogOffsetType
  readonly current: WorkforceSessionBinding | null
}

const workforceSessionBindingStateSchema = z.object({
  inheritedEventCount: z.number().int().nonnegative().transform(value => SessionLogOffset(value)),
  current: z.union([workOrderBoundPayloadSchema, z.null()]),
}).strict() as unknown as z.ZodType<WorkforceSessionBindingState>

const workforceSessionBindingViewSchema = z.union([
  workOrderBoundPayloadSchema,
  z.null(),
]) as unknown as z.ZodType<WorkforceSessionBinding | null>

/**
 * Fold definition for the `workforceSessionBinding` projection: the
 * currently-bound WorkOrder reference for one Session, last-write-wins over
 * every `workforce/workorder-bound` event in the Session's post-fork
 * suffix. Each event already carries the complete post-bind state (whole-
 * value event rule), so the fold is a strict decode-and-replace.
 */
export const workforceSessionBindingProjectionDefinition = {
  key: 'workforceSessionBinding',
  stateSchema: workforceSessionBindingStateSchema,
  init: (_header, inheritedEventCount) => ({ inheritedEventCount, current: null }),
  apply: (state, event) => {
    if (event.seq < state.inheritedEventCount || event.type !== 'workforce/workorder-bound') return state
    return { inheritedEventCount: state.inheritedEventCount, current: decodeWorkOrderBoundPayload(event.data) }
  },
  wire: {
    viewSchema: workforceSessionBindingViewSchema,
    view: state => state.current,
  },
  stateVersion: 1,
} satisfies ProjectionDefinition<'workforceSessionBinding', WorkforceSessionBindingState>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    workforceSessionBinding: WorkforceSessionBindingState
  }
  interface SessionProjectionMap {
    /** The currently-bound WorkOrder reference, or `null` before the first bind. */
    workforceSessionBinding: WorkforceSessionBinding | null
  }
}
