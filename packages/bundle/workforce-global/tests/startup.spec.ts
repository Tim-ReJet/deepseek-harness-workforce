/**
 * The Workforce global profile bundle is a real, parseable patch layer that
 * stacks over `dsh-base`: every row `dsh-base` already mounts survives
 * unchanged (README invariant 17), and this bundle adds only the rows its
 * own `cordis.patch.yml` declares — starting with `workforce-session-events`
 * (DSH-002), the durable WorkOrder-binding SessionEvent and its
 * `workforceSessionBinding` projection.
 *
 * Booting the full ~80-row `dsh-base` patch requires the installed CLI's own
 * anchor and profile module-fallback resolution (`healProfilesModuleFallback`
 * / `boot` in `@deepseek-ai/dsh-app-boot`) — that full-stack composition is
 * exercised at the e2e tier (`apps/cli/tests/profiles/*`,
 * `packages/**\/*.e2e.ts`), not from a package's own default-tier unit test.
 * This suite instead proves the three things a package-level test can prove
 * safely and quickly: (1) the shipped patch document is exactly the row set
 * the manifest promises, verified the same way
 * `packages/bundle/base/tests/base.spec.ts` verifies `dsh-base`'s own patch;
 * (2) composing this bundle's real patch over `dsh-base`'s real patch through
 * the loader's own `composeEntries` (the exact function the profile launcher
 * calls to build the row set it mounts) yields every `dsh-base` row
 * unchanged plus exactly this bundle's own rows appended; (3) a real Cordis
 * `Context` + `Loader` + `Include` mounts this bundle's real patch file as a
 * second layer over an already-settled fixture layer, resolves its one real
 * workspace package by its real published name (not a copy), and reaches
 * ready with the `workforceSessionBinding` projection registered.
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
const globalPatchPath = resolve(root, 'cordis.patch.yml')

/** This bundle's own rows, exactly as `cordis.patch.yml` declares them today. */
const EXPECTED_GLOBAL_PATCHES: PatchOptions[] = [
  {
    insert: [
      { id: 'workforce-session-events', name: '@deepseek-ai/dsh-workforce-session-events' },
    ],
  },
]

function loadPatches(path: string): PatchOptions[] {
  const parsed = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError(`${path} must parse to a patch list`)
  return parsed as PatchOptions[]
}

describe('dsh-workforce-global bundle', () => {
  it('declares a parseable patch list, through the dsh.bundle.patch manifest field, matching exactly its own rows', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.peerDependencies).toMatchObject({ '@deepseek-ai/dsh-base': 'workspace:^' })
    // Stop condition: no @workforce/* dependency ahead of the package that
    // justifies it — an unresolvable workspace dependency breaks `pnpm
    // install` for the whole repository (DSH-001 packet stop_conditions).
    const declared = { ...manifest.dependencies, ...manifest.peerDependencies }
    expect(Object.keys(declared).some(name => name.startsWith('@workforce/'))).toBe(false)
    // Every row this bundle declares must be a real dependency of this
    // package (verify-cordis-config's resolver-manifest rule) — never a
    // bare specifier this manifest does not also declare.
    for (const patch of loadPatches(globalPatchPath)) {
      if (!('insert' in patch)) continue
      for (const row of patch.insert ?? []) {
        if (typeof row.name === 'string' && row.name.startsWith('@deepseek-ai/')) {
          expect(declared).toHaveProperty(row.name)
        }
      }
    }

    const patches = loadPatches(globalPatchPath)
    expect(patches).toEqual(EXPECTED_GLOBAL_PATCHES)
  })

  it('composes over dsh-base with every dsh-base row unchanged, plus exactly this bundle\'s own rows appended', () => {
    const basePatches = loadPatches(basePatchPath)
    const globalPatches = loadPatches(globalPatchPath)
    const baseOnly = composeEntries([basePatches])
    const baseThenGlobal = composeEntries([basePatches, globalPatches])
    expect(baseOnly.length).toBeGreaterThan(50)
    expect(baseThenGlobal.slice(0, baseOnly.length)).toEqual(baseOnly)
    expect(baseThenGlobal.slice(baseOnly.length)).toEqual([
      { id: 'workforce-session-events', name: '@deepseek-ai/dsh-workforce-session-events' },
    ])
  })

  describe('real Loader/Include boot', () => {
    const tempDirs: string[] = []

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
    })

    // Run under `node --import tsx/esm` — the exact vector `dsh`'s own
    // source launcher uses (apps/cli/tests/source-launch.compat.spec.ts) —
    // rather than a bare dynamic import inside this vitest process. This
    // bundle's one real row now pulls in `@reactorjet/workforce-contracts`
    // (a `link:`-consumed sibling checkout that ships raw `.ts` source with
    // `.js`-suffixed relative specifiers and no build step of its own);
    // tsx's loader hook resolves that transparently, exactly like every
    // other DSH source-launched entry, but plain Node's native loader does
    // not remap `.js` specifiers to sibling `.ts` files, so a boot proof
    // that does not go through tsx would fail on that unrelated, pre-
    // existing property of the linked package rather than on anything this
    // bundle or package does. A fully-built (`lib/`) production boot is the
    // e2e tier's job (module doc comment above), not this package-level test.
    it('mounts the real patch as a second layer, resolves its one real row by its published name, and registers the workforceSessionBinding projection', async () => {
      // Created inside this package's own tree (not os.tmpdir()) so Node
      // ESM resolution — walking up from the include root — reaches this
      // package's real node_modules and resolves
      // @deepseek-ai/dsh-workforce-session-events as the real pnpm-linked
      // workspace package, not a copy.
      const dir = mkdtempSync(join(root, '.startup-spec-'))
      tempDirs.push(dir)
      // A trivial stand-in "already-mounted" layer providing the one
      // service this bundle's real row hard-depends on
      // (`ctx.sessionProjections`) — proving the row resolves and installs
      // for real without booting all ~80 of dsh-base's own rows (out of
      // scope here; see the module doc comment above).
      writeFileSync(join(dir, 'probe-row.mjs'), [
        'export const name = \'probe-row\'',
        'export function apply(ctx) { ctx.provide(\'probeService\'); ctx.set(\'probeService\', \'ready\') }',
        '',
      ].join('\n'))
      writeFileSync(join(dir, 'session-projections-stub.mjs'), [
        'export const name = \'session-projections-stub\'',
        'const registered = []',
        'export function apply(ctx) {',
        '  ctx.provide(\'sessionProjections\')',
        '  ctx.set(\'sessionProjections\', { register: (definition) => { registered.push(definition.key); return () => {} } })',
        '}',
        'export function registeredKeys() { return registered }',
        '',
      ].join('\n'))
      writeFileSync(join(dir, 'root.yml'), '[]\n')
      writeFileSync(join(dir, 'boot.mjs'), [
        'import { Context } from \'@deepseek-ai/cordis\'',
        'import Loader from \'@deepseek-ai/cordis-plugin-loader\'',
        'import Include, { entryListSchema } from \'@deepseek-ai/cordis-plugin-include\'',
        'import { readFileSync } from \'node:fs\'',
        'import * as yaml from \'js-yaml\'',
        'import * as stub from \'./session-projections-stub.mjs\'',
        '',
        'const globalPatchPath = process.argv[2]',
        'const globalPatches = yaml.load(readFileSync(globalPatchPath, \'utf8\'), { schema: entryListSchema })',
        '',
        'const ctx = new Context()',
        'await ctx.plugin(Loader)',
        'ctx.loader.builtins.include = Include',
        'await ctx.loader.create({',
        '  name: \'cordis:include\',',
        '  config: {',
        '    path: new URL(\'./root.yml\', import.meta.url).href,',
        '    patches: [',
        '      { insert: [',
        '        { id: \'probe\', name: new URL(\'./probe-row.mjs\', import.meta.url).href },',
        '        { id: \'session-projections-stub\', name: new URL(\'./session-projections-stub.mjs\', import.meta.url).href },',
        '      ] },',
        '      ...globalPatches,',
        '    ],',
        '  },',
        '})',
        'await ctx.loader.await()',
        '',
        'if (ctx.get(\'probeService\') !== \'ready\') throw new Error(`probeService is ${JSON.stringify(ctx.get(\'probeService\'))}, expected \'ready\'`)',
        'const keys = stub.registeredKeys()',
        'if (JSON.stringify(keys) !== JSON.stringify([\'workforceSessionBinding\'])) {',
        '  throw new Error(`registered projection keys were ${JSON.stringify(keys)}, expected [\'workforceSessionBinding\']`)',
        '}',
        'await ctx.fiber.dispose()',
        'process.stdout.write(\'OK\')',
        '',
      ].join('\n'))

      const { stdout } = await execFileAsync(
        process.execPath,
        ['--import', 'tsx/esm', join(dir, 'boot.mjs'), globalPatchPath],
        { cwd: repoRoot, timeout: 30_000 },
      )
      expect(stdout.trim()).toBe('OK')
    }, 30_000)
  })
})
