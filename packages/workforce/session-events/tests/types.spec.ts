/**
 * Compile-time proof of the pure payload shape and the declare-module
 * augmentations this package contributes: `SessionEventMap` gains
 * `workforce/workorder-bound`, and `SessionProjectionStateMap`/
 * `SessionProjectionMap` gain `workforceSessionBinding` — merged, never
 * edited in place on the owning packages.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { WorkOrder } from '@reactorjet/workforce-contracts/src/workorder/index.ts'
import type { SessionEventMap } from '@deepseek-ai/dsh-session'
import type { SessionProjectionMap, SessionProjectionStateMap } from '@deepseek-ai/dsh-session-projection'
import type {
  WorkforceSessionBinding,
  WorkforceWorkOrderBoundEvent,
  WorkOrderDigest,
  WorkOrderId,
} from '../src/types.ts'
import type { WorkforceSessionBindingState } from '../src/domain.ts'
import '../src/domain.ts'

describe('workforce session-binding payload shape', () => {
  it('types the id and digest fields from the canonical WorkOrder contract, not a redeclared shape', () => {
    expectTypeOf<WorkOrderId>().toEqualTypeOf<WorkOrder['id']>()
    expectTypeOf<WorkOrderDigest>().toEqualTypeOf<WorkOrder['digest']>()
  })

  it('is a whole-value payload of exactly four readonly fields', () => {
    expectTypeOf<WorkforceWorkOrderBoundEvent>().toEqualTypeOf<{
      readonly workOrderId: WorkOrderId
      readonly workOrderDigest: WorkOrderDigest
      readonly profileVersion: string
      readonly boundAt: number
    }>()
  })

  it('folds to the same shape as the durable payload (last-write-wins whole value)', () => {
    expectTypeOf<WorkforceSessionBinding>().toEqualTypeOf<WorkforceWorkOrderBoundEvent>()
  })

  it('is readonly end to end', () => {
    const event: WorkforceWorkOrderBoundEvent = {
      workOrderId: '01JABCDEF0123456789ABCDEFG',
      workOrderDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      profileVersion: 'unresolved',
      boundAt: 0,
    }
    // @ts-expect-error -- the payload is immutable once constructed.
    event.boundAt = 1
  })
})

describe('SessionEventMap / SessionProjectionStateMap augmentation', () => {
  it('registers workforce/workorder-bound on SessionEventMap by merge, matching the pure payload type', () => {
    expectTypeOf<SessionEventMap['workforce/workorder-bound']>().toEqualTypeOf<WorkforceWorkOrderBoundEvent>()
  })

  it('registers workforceSessionBinding on the projection state and client-view tables', () => {
    expectTypeOf<SessionProjectionStateMap['workforceSessionBinding']>().toEqualTypeOf<WorkforceSessionBindingState>()
    expectTypeOf<SessionProjectionMap['workforceSessionBinding']>().toEqualTypeOf<WorkforceSessionBinding | null>()
  })
})
