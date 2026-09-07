/**
 * Pure types of the Workforce session-binding domain: the durable
 * `workforce/workorder-bound` payload shape and the folded
 * `WorkforceSessionBinding` read-model it produces, free of this package's
 * host-side imports (`@deepseek-ai/dsh-session`,
 * `@deepseek-ai/dsh-session-projection`). Host-coupled vocabulary (the
 * `SessionEventMap`/`SessionProjectionStateMap` declare-module augmentations,
 * the decoder, and the projection definition) lives in ./domain.ts.
 *
 * @module @deepseek-ai/dsh-workforce-session-events/types
 */

// Deep import (not the package's `.` barrel): the barrel's `export *`
// re-exports unrelated modules (compat/workorder-v1, effect-gateway, ...)
// whose own pre-existing type errors would otherwise enter this program
// the moment anything is imported from the package root. Importing the one
// file that actually defines WorkOrder keeps this package's program free
// of workforce-platform's unrelated modules while still consuming the
// real, canonical type — never a copy (AGENT_EXECUTION_PROTOCOL.md §3).
import type { WorkOrder } from '@reactorjet/workforce-contracts/src/workorder/index.ts'

/**
 * The canonical `biro.workorder/v2` identity, imported from
 * `@reactorjet/workforce-contracts` rather than redeclared — see
 * `AGENT_EXECUTION_PROTOCOL.md` §3 (no duplicate cross-boundary schema).
 */
export type WorkOrderId = WorkOrder['id']

/** The canonical WorkOrder's content digest at bind time (`sha256:<hex>`). */
export type WorkOrderDigest = WorkOrder['digest']

/**
 * Durable payload recording which canonical WorkOrder a Session is bound
 * to: the WorkOrder's id and content digest, plus the resolved
 * `workforce.execution-profile/v1` binding in force at bind time
 * (`"<profileId>@<profileVersion>"`, or `"unresolved"` before one exists —
 * see `readProfileBindingExtension` in `@reactorjet/workforce-contracts`).
 * This is a reference, never a copy of the WorkOrder's objective, scope, or
 * acceptance state — Workforce/DSH never mutates or re-authors WorkOrder.
 */
export interface WorkforceWorkOrderBoundEvent {
  readonly workOrderId: WorkOrderId
  readonly workOrderDigest: WorkOrderDigest
  readonly profileVersion: string
  /** Epoch milliseconds the bind was accepted. */
  readonly boundAt: number
}

/**
 * The `workforceSessionBinding` projection value: the currently-bound
 * WorkOrder reference for one Session, or `null` before the first bind.
 * Folded last-write-wins from every `workforce/workorder-bound` event in
 * the owning Session's post-fork suffix (whole-value event rule: the
 * latest event already carries the complete post-bind state).
 */
export type WorkforceSessionBinding = WorkforceWorkOrderBoundEvent
