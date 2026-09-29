/**
 * The Workforce Cell profile bundle must be a real, parseable, and
 * patch layer that stacks over `dsh-base` + `dsh-headless`. It mounts
 * `@deepseek-ai/dsh-workforce-tool-admission` for plan-16 in-process
 * tool admission; rows must not remove or override base/headless plugins.
 *
 * Booting the full `dsh-base` + `dsh-headless` patch tree requires the
 * installed CLI's own anchor and profile module-fallback resolution
 * (`healProfilesModuleFallback` / `boot` in `@deepseek-ai/dsh-app-boot`) —
 * that full-stack composition is exercised at the e2e tier
 * (`apps/cli/tests/profiles/*`, `packages/**\/*.e2e.ts`), not from a
 * package's own default-tier unit test. This suite instead proves the three
 * things a package-level test can prove safely and quickly: (1) the shipped
 * patch document is exactly the empty, parseable layer the manifest
 * promises, verified the same way `packages/bundle/base/tests/base.spec.ts`
 * verifies `dsh-base`'s own patch; (2) composing this bundle's real patch
 * over `dsh-base` + `dsh-headless`'s real patches through the loader's own
 * `composeEntries` (the exact function the profile launcher calls to build
 * the row set it mounts) yields a row set identical to `dsh-base` +
 * `dsh-headless` alone; (3) a real Cordis `Context` + `Loader` + `Include`
 * mounts this bundle's patch, resolves tool admission, and denies a tool call
 * in `tools/pre-execute` when sealed plan/workerId are absent.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import * as yaml from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const root = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = resolve(root, '../../..')
const basePatchPath = resolve(repoRoot, 'packages/bundle/base/cordis.patch.yml')
const headlessPatchPath = resolve(repoRoot, 'packages/bundle/headless/cordis.patch.yml')
const cellPatchPath = resolve(root, 'cordis.patch.yml')

function loadPatches(path: string): PatchOptions[] {
  const parsed = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError(`${path} must parse to a patch list`)
  return parsed as PatchOptions[]
}

describe('dsh-workforce-cell bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.peerDependencies).toMatchObject({
      '@deepseek-ai/dsh-base': 'workspace:^',
      '@deepseek-ai/dsh-headless': 'workspace:^',
    })
    // Stop condition: no @workforce/* dependency ahead of the package that
    // justifies it — an unresolvable workspace dependency breaks `pnpm
    // install` for the whole repository (CELL-001 packet stop_conditions).
    const declared = { ...manifest.dependencies, ...manifest.peerDependencies }
    expect(Object.keys(declared).some(name => name.startsWith('@workforce/'))).toBe(false)

    const patches = loadPatches(cellPatchPath)
    expect(patches).toHaveLength(1)
    const insert = patches[0]?.insert ?? []
    expect(insert).toHaveLength(2)
    expect(insert.find(row => row.id === 'workforce-tool-admission')).toMatchObject({
      name: '@deepseek-ai/dsh-workforce-tool-admission',
    })
    expect(insert.find(row => row.id === 'workforce-execution-cell')).toMatchObject({
      name: '@deepseek-ai/dsh-workforce-execution-cell',
    })
  })

  it('composes over dsh-base + dsh-headless by appending the tool-admission row only', () => {
    const basePatches = loadPatches(basePatchPath)
    const headlessPatches = loadPatches(headlessPatchPath)
    const cellPatches = loadPatches(cellPatchPath)
    const baseThenHeadless = composeEntries([basePatches, headlessPatches])
    const baseThenHeadlessThenCell = composeEntries([basePatches, headlessPatches, cellPatches])
    expect(baseThenHeadless.length).toBeGreaterThan(50)
    expect(baseThenHeadlessThenCell.length).toBe(baseThenHeadless.length + 2)
    expect(baseThenHeadlessThenCell.slice(0, baseThenHeadless.length)).toEqual(baseThenHeadless)
    expect(baseThenHeadlessThenCell.at(-2)).toMatchObject({
      id: 'workforce-tool-admission',
      name: '@deepseek-ai/dsh-workforce-tool-admission',
    })
    expect(baseThenHeadlessThenCell.at(-1)).toMatchObject({
      id: 'workforce-execution-cell',
      name: '@deepseek-ai/dsh-workforce-execution-cell',
    })
  })

  describe('real Loader/Include boot', () => {
    const tempDirs: string[] = []

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
    })

    it('mounts the real patch as a second layer and registers tools/pre-execute admission', async () => {
      const dir = mkdtempSync(join(root, '.startup-spec-'))
      tempDirs.push(dir)
      writeFileSync(join(dir, 'probe-row.mjs'), [
        'export const name = \'probe-row\'',
        'export function apply(ctx) { ctx.provide(\'probeService\'); ctx.set(\'probeService\', \'ready\') }',
        '',
      ].join('\n'))
      writeFileSync(join(dir, 'root.yml'), '[]\n')
      writeFileSync(join(dir, 'boot.mjs'), [
        'import { Context } from \'@deepseek-ai/cordis\'',
        'import Loader from \'@deepseek-ai/cordis-plugin-loader\'',
        'import Include, { entryListSchema } from \'@deepseek-ai/cordis-plugin-include\'',
        'import { mountAgentLoopTestDependencies } from \'@deepseek-ai/dsh-agent-loop-testkit\'',
        'import WorkflowEngine, { WorkflowRunId } from \'@deepseek-ai/dsh-workflow\'',
        'import { ToolCallId } from \'@deepseek-ai/dsh-llm\'',
        'import { defineContentToolFixture } from \'@deepseek-ai/dsh-tools\'',
        'import { readFileSync } from \'node:fs\'',
        'import * as yaml from \'js-yaml\'',
        '',
        'process.env.WORKFORCE_CELL_TOOL_PROJECTIONS_JSON = JSON.stringify({',
        '  write_file: { semanticAction: \'scm.repository.write\', targetType: \'filesystem\', pathArgument: \'path\' },',
        '})',
        'delete process.env.WORKFORCE_CELL_DELEGATION_PLAN_JSON',
        'delete process.env.WORKFORCE_CELL_WORKER_ID',
        '',
        'const cellPatchPath = process.argv[2]',
        'const cellPatches = yaml.load(readFileSync(cellPatchPath, \'utf8\'), { schema: entryListSchema })',
        '',
        'class BootWorkflowEngine extends WorkflowEngine {',
        '  start(request) {',
        '    const id = WorkflowRunId(\'boot-workflow\')',
        '    return {',
        '      id,',
        '      meta: request.meta,',
        '      result: Promise.resolve({ value: request.args, stopReason: \'completed\', agentsStarted: 0 }),',
        '      cancel() {},',
        '      async dispose() {},',
        '    }',
        '  }',
        '}',
        'const ctx = new Context()',
        'await mountAgentLoopTestDependencies(ctx)',
        'await ctx.plugin(BootWorkflowEngine)',
        'await ctx.plugin(Loader)',
        'ctx.loader.builtins.include = Include',
        'await ctx.loader.create({',
        '  name: \'cordis:include\',',
        '  config: {',
        '    path: new URL(\'./root.yml\', import.meta.url).href,',
        '    patches: [',
        '      { insert: [',
        '        { id: \'probe\', name: new URL(\'./probe-row.mjs\', import.meta.url).href },',
        '      ] },',
        '      ...cellPatches,',
        '    ],',
        '  },',
        '})',
        'await ctx.loader.await()',
        '',
        'if (ctx.get(\'probeService\') !== \'ready\') throw new Error(\'probeService not ready\')',
        'ctx.tools.register(defineContentToolFixture({',
        '  name: \'write_file\',',
        '  description: \'boot probe\',',
        '  parameters: {},',
        '  async execute() { return [{ type: \'text\', text: \'must-not-run\' }] }',
        '}))',
        'const result = await ctx.tools.execute({',
        '  signal: AbortSignal.timeout(5000),',
        '  callId: ToolCallId(\'boot-deny\'),',
        '  name: \'write_file\',',
        '  arguments: { path: \'packages/api/main.ts\' },',
        '})',
        'const text = result.content[0]?.text ?? \'\'',
        'if (!result.isError || !String(text).includes(\'DelegationPlan\')) {',
        '  throw new Error(`expected pre-execute deny for missing plan/workerId, got ${JSON.stringify(result)}`)',
        '}',
        'await ctx.fiber.dispose()',
        'process.stdout.write(\'OK\')',
        '',
      ].join('\n'))

      const { stdout } = await execFileAsync(
        process.execPath,
        ['--import', 'tsx/esm', join(dir, 'boot.mjs'), cellPatchPath],
        { cwd: repoRoot, timeout: 30_000 },
      )
      expect(stdout.trim()).toBe('OK')
    }, 30_000)
  })
})
