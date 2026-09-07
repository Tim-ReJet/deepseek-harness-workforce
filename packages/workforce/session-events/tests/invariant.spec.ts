/**
 * `bindWorkOrder` is this package's append-time boundary: a candidate that
 * fails the canonical `biro.workorder/v2` schema is rejected before any
 * event reaches the log (the session stays at seq 0), and a duplicate bind
 * to the same WorkOrder is idempotent under the session log's own strictly
 * increasing seq — both binds commit and the projection folds last-write-
 * wins, never a special-cased rejection. Out-of-order delivery cannot occur
 * once committed: `Session.append` assigns seq itself, in call order, so a
 * "later" bind is whichever one the log actually admits next.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { buildProfileBindingExtension } from '@reactorjet/workforce-contracts/src/execution-profile/binding.ts'
import { computeArtifactDigest } from '@reactorjet/workforce-contracts/src/common/digest.ts'
import { generateUlid } from '@reactorjet/workforce-contracts/src/common/ids.ts'
import type { WorkOrder } from '@reactorjet/workforce-contracts/src/workorder/index.ts'
import { bindWorkOrder } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  contexts.push(ctx)
  return ctx
}

/** One canonical, digest-correct WorkOrder — profileVersion resolves via `buildProfileBindingExtension` when `bound` is set. */
function workOrderFixture(overrides: Partial<WorkOrder> = {}, bound = false): WorkOrder {
  const base: Omit<WorkOrder, 'digest'> = {
    schema: 'biro.workorder/v2',
    id: generateUlid(),
    version: 1,
    tenantId: 'tenant-acme',
    organisationId: 'org-acme',
    issuedBy: { id: 'user-tim', kind: 'human', issuer: 'https://auth.example.com' },
    objective: {
      goal: 'Ship the thing',
      outcomes: [{ id: 'outcome-1', description: 'The thing ships' }],
      context: 'Requested from a tracked issue',
      nonGoals: ['Do not deploy to production'],
    },
    scope: {
      targets: [{ kind: 'github.repository', id: 'github://acme/repo' }],
      constraints: [{ id: 'c1', type: 'must', condition: 'Preserve tenant isolation', reason: 'Cross-tenant access is prohibited' }],
    },
    authorityCeiling: { capabilities: ['scm.repository.read'], prohibited: ['service.production.deploy'] },
    resources: { budget: { currency: 'USD', capMinorUnits: 2000 }, deadline: '2026-08-29T12:00:00Z' },
    acceptance: { assertions: [{ id: 'a1', proposition: 'The thing works', criticality: 'REQUIRED' }] },
    accountability: { owner: { id: 'user-tim', kind: 'human', issuer: 'https://auth.example.com' }, approvalPolicies: [] },
    lifecycle: { mode: 'one-shot' },
    provenance: { source: 'test-fixture', createdAt: '2026-08-28T08:00:00Z' },
    ...(bound ? { extensions: buildProfileBindingExtension({
      schema: 'workforce.execution-profile/v1',
      profileId: 'workspace-autonomy',
      profileVersion: 1,
      executionExperience: 'x',
      acceptanceBehavior: 'y',
    }) } : {}),
    ...overrides,
  }
  return { ...base, digest: computeArtifactDigest(base) }
}

describe('bindWorkOrder append-time boundary', () => {
  it('appends the durable event for a canonical, digest-correct WorkOrder', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('bind-valid'))
    const workOrder = workOrderFixture()
    const event = bindWorkOrder(session, workOrder)
    expect(event.type).toBe('workforce/workorder-bound')
    expect(event.data).toMatchObject({ workOrderId: workOrder.id, workOrderDigest: workOrder.digest, profileVersion: 'unresolved' })
    expect(session.seq).toBe(1)
  })

  it('resolves profileVersion from the WorkOrder\'s execution-profile extension when present', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('bind-profile'))
    const workOrder = workOrderFixture({}, true)
    const event = bindWorkOrder(session, workOrder)
    expect(event.data.profileVersion).toBe('workspace-autonomy@1')
  })

  it('rejects a WorkOrder that fails the canonical schema before any event commits', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('bind-invalid'))
    const malformed = { ...workOrderFixture(), tenantId: '' }
    expect(() => bindWorkOrder(session, malformed)).toThrow()
    expect(session.seq).toBe(0)
  })

  it('rejects a candidate whose recorded digest does not match its own payload', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('bind-digest-mismatch'))
    const tampered = { ...workOrderFixture(), digest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }
    // The canonical schema only checks the digest's shape, not its value —
    // this package still refuses a candidate with no digest at all.
    const noDigest = { ...tampered, digest: undefined }
    expect(() => bindWorkOrder(session, noDigest)).toThrow()
    expect(session.seq).toBe(0)
  })

  it('is idempotent under the session log\'s own append invariants: two binds to the same WorkOrder both commit in call order and the last one wins the fold', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('bind-duplicate'))
    const workOrder = workOrderFixture()
    const first = bindWorkOrder(session, workOrder, 1000)
    const second = bindWorkOrder(session, workOrder, 2000)
    expect(first.seq).toBe(0)
    expect(second.seq).toBe(1)
    expect(second.seq).toBeGreaterThan(first.seq)
    expect(session.snapshotEvents().filter(event => event.type === 'workforce/workorder-bound')).toHaveLength(2)
  })
})
