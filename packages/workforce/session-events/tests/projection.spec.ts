/**
 * The `workforceSessionBinding` projection unit: serves `null` before the
 * first bind, the whole current binding after one, and the latest binding
 * (last-write-wins) after a second — with a consistent `asOfSeq` on the
 * shared tail page. A composition without this package's plugin has no
 * `workforceSessionBinding` key; unmounting drops it (HMR safety).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { buildProfileBindingExtension } from '@reactorjet/workforce-contracts/src/execution-profile/binding.ts'
import { computeArtifactDigest } from '@reactorjet/workforce-contracts/src/common/digest.ts'
import { generateUlid } from '@reactorjet/workforce-contracts/src/common/ids.ts'
import type { WorkOrder } from '@reactorjet/workforce-contracts/src/workorder/index.ts'
import * as workforceSessionEvents from '../src/index.ts'
import { bindWorkOrder } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface Bench {
  ctx: Context
  session: Session
  values(): Record<string, unknown>
  asOfSeq(): number
}

async function harness(withPlugin: boolean): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (withPlugin) await ctx.plugin(workforceSessionEvents)
  contexts.push(ctx)
  const session = ctx.sessions.create(SessionId('workforce-session-binding'))
  return {
    ctx,
    session,
    values: () => ctx.sessionProjections.snapshot(session).values,
    asOfSeq: () => ctx.sessionProjections.snapshot(session).asOfSeq,
  }
}

/** One canonical, digest-correct WorkOrder. */
function workOrderFixture(id = generateUlid()): WorkOrder {
  const base: Omit<WorkOrder, 'digest'> = {
    schema: 'biro.workorder/v2',
    id,
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
    extensions: buildProfileBindingExtension({
      schema: 'workforce.execution-profile/v1',
      profileId: 'bounded-operations',
      profileVersion: 2,
      executionExperience: 'x',
      acceptanceBehavior: 'y',
    }),
  }
  return { ...base, digest: computeArtifactDigest(base) }
}

describe('workforceSessionBinding projection unit', () => {
  it('serves null before the first bind', async () => {
    const bench = await harness(true)
    expect(bench.values()).toEqual({ workforceSessionBinding: null })
  })

  it('serves the whole current binding after a bind, with a consistent asOfSeq', async () => {
    const bench = await harness(true)
    const workOrder = workOrderFixture()
    bindWorkOrder(bench.session, workOrder, 12345)
    expect(bench.values()).toEqual({
      workforceSessionBinding: {
        workOrderId: workOrder.id,
        workOrderDigest: workOrder.digest,
        profileVersion: 'bounded-operations@2',
        boundAt: 12345,
      },
    })
    expect(bench.asOfSeq()).toBe(bench.session.seq - 1)
  })

  it('folds a second bind last-write-wins, replacing the first', async () => {
    const bench = await harness(true)
    const first = workOrderFixture()
    const second = workOrderFixture()
    bindWorkOrder(bench.session, first, 1)
    bindWorkOrder(bench.session, second, 2)
    const values = bench.values()
    expect(values['workforceSessionBinding']).toMatchObject({ workOrderId: second.id, boundAt: 2 })
  })

  it('has no workforceSessionBinding key when this package is not composed', async () => {
    const bench = await harness(false)
    expect('workforceSessionBinding' in bench.values()).toBe(false)
  })

  it('drops the key when the plugin fiber unloads (HMR safety)', async () => {
    const bench = await harness(false)
    const fiber = await bench.ctx.plugin(workforceSessionEvents)
    expect(bench.values()).toEqual({ workforceSessionBinding: null })
    await fiber.dispose()
    expect('workforceSessionBinding' in bench.values()).toBe(false)
  })
})
