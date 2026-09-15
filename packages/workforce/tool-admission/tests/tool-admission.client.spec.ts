import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineContentToolFixture, type ToolExecution, type ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import {
  actionIntent,
  computeArtifactDigest,
  delegationPlan,
  executionPermit,
} from '@reactorjet/workforce-contracts'
import { compilePermitToManifest } from '@workforce/permit-compiler'
import * as workforceToolAdmission from '../src/index.ts'

const testToolSignal = new AbortController().signal
const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '../../../../workforce-platform/packages/contracts/fixtures')

const permitFixture = executionPermit.parse(
  JSON.parse(readFileSync(join(fixturesRoot, 'execution-permit.json'), 'utf8')),
)

const planRaw = delegationPlan.parse(
  JSON.parse(readFileSync(join(fixturesRoot, 'delegation-plan.json'), 'utf8')),
)
const sealedPlan = { ...planRaw, digest: computeArtifactDigest(planRaw) }

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function grantingManifest() {
  const permit = {
    ...permitFixture,
    grant: {
      ...permitFixture.grant,
      capabilities: ['scm.repository.write'],
    },
  }
  return compilePermitToManifest(permit, { workdir: '/cell/workspace' })
}

async function harness(config: Parameters<typeof workforceToolAdmission.apply>[1]): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(workforceToolAdmission, config)
  ctx.tools.register(defineContentToolFixture({
    name: 'write_file',
    description: 'test write',
    parameters: {},
    async execute() {
      return [{ type: 'text', text: 'written' }]
    },
  }))
  contexts.push(ctx)
  return ctx
}

const baseConfig = {
  manifest: grantingManifest(),
  delegationPlan: sealedPlan,
  workerId: 'worker-api',
  workOrderId: '01JWORK0000000000000000001',
  runId: '01JRUN00000000000000000001',
  cellId: '01JCELL0000000000000000001',
  taskId: '01JTASK0000000000000000001',
  projections: {
    write_file: {
      semanticAction: 'scm.repository.write',
      targetType: 'filesystem',
      pathArgument: 'path',
      toolVersion: '1',
    },
  },
} satisfies Parameters<typeof workforceToolAdmission.apply>[1]

describe('workforce tool-call admission', () => {
  it('allows dispatch when the manifest grants the projected capability', async () => {
    const ctx = await harness(baseConfig)
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('allow-1'),
      name: 'write_file',
      arguments: { path: 'packages/api/main.ts' },
    })
    expect(result.isError).toBe(false)
    expect(result.content[0]).toMatchObject({ text: 'written' })
  })

  it('denies when the manifest does not grant the required capability', async () => {
    const closedPermit = {
      ...permitFixture,
      grant: {
        ...permitFixture.grant,
        capabilities: ['scm.branch.push'],
      },
    }
    const ctx = await harness({
      ...baseConfig,
      manifest: compilePermitToManifest(closedPermit, { workdir: '/cell/workspace' }),
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('deny-cap'),
      name: 'write_file',
      arguments: { path: 'packages/api/main.ts' },
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('scm.repository.write'),
    })
  })

  it('denies an unmapped semanticAction at the bridge layer', async () => {
    const ctx = await harness({
      ...baseConfig,
      projections: {
        write_file: {
          semanticAction: 'service.production.deploy',
          targetType: 'filesystem',
          pathArgument: 'path',
        },
      },
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('deny-unmapped'),
      name: 'write_file',
      arguments: { path: 'packages/api/main.ts' },
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('not mapped'),
    })
  })

  it('denies writes outside sealed ownedPaths even when the manifest grants workdir (board wake is not an input)', async () => {
    const ctx = await harness(baseConfig)
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('deny-owned'),
      name: 'write_file',
      arguments: { path: 'packages/web/app.tsx' },
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('ownedPaths'),
    })
  })

  it('denies tools with no configured projection', async () => {
    const ctx = await harness(baseConfig)
    ctx.tools.register(defineContentToolFixture({
      name: 'unmapped_tool',
      description: 'no projection',
      parameters: {},
      async execute() {
        return [{ type: 'text', text: 'should not run' }]
      },
    }))
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('deny-no-proj'),
      name: 'unmapped_tool',
      arguments: {},
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('no ActionIntent projection'),
    })
  })
})

describe('ActionIntent projection helper', () => {
  it('builds a parseable ActionIntent with digest', () => {
    const callId = ToolCallId('x')
    const intent = workforceToolAdmission.projectToolCallToActionIntent(
      {
        token: Symbol('tool') as ToolExecutionToken,
        callId,
        rootCallId: callId,
        name: 'write_file',
        arguments: { path: 'packages/api/main.ts' },
        signal: testToolSignal,
      } satisfies ToolExecution,
      baseConfig.projections.write_file,
      {
        workOrderId: baseConfig.workOrderId,
        runId: baseConfig.runId,
        cellId: baseConfig.cellId,
        taskId: baseConfig.taskId,
      },
    )
    expect(actionIntent.safeParse(intent).success).toBe(true)
    expect(intent.semanticAction).toBe('scm.repository.write')
  })
})
