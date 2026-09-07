/**
 * The Workforce Cell profile bundle must be a real, parseable, and
 * currently-empty patch layer that stacks over `dsh-base` + `dsh-headless`
 * with zero effect: no row it declares may add, remove, or override
 * anything those two layers already mount (README invariant 17 — an empty
 * bundle must not fail any existing gate that assumes every bundle carries
 * functional plugins).
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
 * mounts this bundle's real (empty) patch file as a second layer over an
 * already-settled fixture layer and reaches ready with no thrown error and
 * no row added, changed, or removed.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include, { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import * as yaml from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'

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
  it('declares a parseable, empty patch list through the dsh.bundle.patch manifest field', () => {
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
    expect(patches).toEqual([])
  })

  it('composes over dsh-base + dsh-headless with zero rows added, removed, or overridden', () => {
    const basePatches = loadPatches(basePatchPath)
    const headlessPatches = loadPatches(headlessPatchPath)
    const cellPatches = loadPatches(cellPatchPath)
    const baseThenHeadless = composeEntries([basePatches, headlessPatches])
    const baseThenHeadlessThenCell = composeEntries([basePatches, headlessPatches, cellPatches])
    expect(baseThenHeadless.length).toBeGreaterThan(50)
    expect(baseThenHeadlessThenCell).toEqual(baseThenHeadless)
  })

  describe('real Loader/Include boot', () => {
    const disposers: (() => Promise<void>)[] = []
    const tempDirs: string[] = []

    afterEach(async () => {
      for (const dispose of disposers.splice(0)) await dispose()
      for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
    })

    it('mounts the real (empty) patch as a second layer and reaches ready with no unexpected plugin state', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'dsh-workforce-cell-startup-'))
      tempDirs.push(dir)
      // A trivial stand-in "already-mounted" layer: this proves the bundle's
      // OWN shipped patch file (loaded for real, not a copy) applies as a
      // true no-op second layer through the real loader/include patch
      // machinery, without depending on dsh-base/dsh-headless's own package
      // resolution (out of scope here; see the module doc comment above).
      writeFileSync(join(dir, 'probe-row.mjs'), [
        'export const name = \'probe-row\'',
        'export function apply(ctx) { ctx.provide(\'probeService\'); ctx.set(\'probeService\', \'ready\') }',
        '',
      ].join('\n'))
      const probeRowUrl = pathToFileURL(join(dir, 'probe-row.mjs')).href
      writeFileSync(join(dir, 'root.yml'), '[]\n')

      const ctx = new Context()
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      await ctx.loader.create({
        name: 'cordis:include',
        config: {
          path: pathToFileURL(join(dir, 'root.yml')).href,
          patches: [
            { insert: [{ id: 'probe', name: probeRowUrl }] },
            ...loadPatches(cellPatchPath),
          ],
        },
      })
      await ctx.loader.await()
      disposers.push(async () => { await ctx.fiber.dispose() })

      expect(ctx.get('probeService')).toBe('ready')
    }, 30000)
  })
})
