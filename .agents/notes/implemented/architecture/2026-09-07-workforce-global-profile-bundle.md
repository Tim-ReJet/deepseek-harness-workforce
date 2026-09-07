# Agent Note: An empty `workforce-global` profile and bundle boot before any Workforce plugin exists

Status: implemented

English | [中文](2026-09-07-workforce-global-profile-bundle.zh.md)

## Problem

Workforce's global runtime (the persistent, multi-tenant host described in the platform's plan 04) is built as a sequence of small tasks, each landing one seam at a time: a durable SessionEvent extension package, a provider registry, an evidence exporter, and so on. Every one of those tasks needs a real, named profile to stack its bundle onto. Waiting for the first such package to exist before creating the profile forces that unrelated task to also invent the profile and bundle scaffolding, and there was no `workforce-global` entry in `PROFILE_TEMPLATES` or `packages/bundle/workforce-global` package for it to add a row to.

## Decision

`packages/bundle/workforce-global` is a new bundle package, shaped exactly like `packages/bundle/headless`'s manifest/tsconfig/README trio: it declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, peer-depends on `@deepseek-ai/cordis` and `@deepseek-ai/dsh-base`, and adds no other dependency. Its `cordis.patch.yml` is a literal empty patch list (`[]`), matching `packages/bundle/base`'s empty-patch shape, with an inline comment stating why it stays empty and warning against adding a `@workforce/*` dependency before the package that justifies it exists (an unresolvable workspace dependency breaks `pnpm install` repository-wide). `src/index.ts` carries no runtime API, mirroring `dsh-base`'s own entry module.

`PROFILE_TEMPLATES` in `packages/boot/app-boot/src/profile.ts` gains a `workforce-global` entry: `bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-workforce-global']`, `patchReload: 'startup'` (the same non-live posture as `headless`, since a persistent host does not need live user-patch reload by default). `dsh --profile workforce-global "task"` now auto-initializes and boots through the ordinary profile launcher, the same code path every shipped profile uses — no new executable, no special-cased resolution.

The package is `private: true` (no `publishConfig`): it is fork-local Workforce infrastructure, not an upstream DeepSeek package ready for public npm publication, following `packages/experimental/agent-team-profile`'s precedent for a bundle that is not part of the shipped `@deepseek-ai/dsh-*` public surface.

## Alternatives considered

- **Wait for the first Workforce plugin package (durable SessionEvent extensions) and create the profile alongside it**: rejected — it entangles an unrelated task with profile/bundle scaffolding work, and every later Workforce task would face the same choice. Landing the empty, named layer first lets each later task add exactly one `insert` row to an already-working bundle.
- **Boot the real, full `dsh-base` plugin tree (~80 rows) inside this package's own default-tier unit test** to literally prove "the composed tree reaches ready": tried directly against a real `Context` + `Loader` + `Include`, and it requires the installed CLI's own anchor and profile module-fallback resolution (`healProfilesModuleFallback` / `boot` in `@deepseek-ai/dsh-app-boot`) — bare package names inside `dsh-base`'s patch do not resolve from an arbitrary temp directory, only from a real profile's own healed `node_modules`. No other bundle package's default-tier test does this; every full shipped-profile boot in this repository (`bootProductionProfile`, `runLoaderSmoke` + a subprocess driver) lives at the e2e tier (`packages/**/*.e2e.ts`, `apps/cli/tests/profiles/*`), not from a package's own `tests/*.spec.ts`. The shipped test instead proves what a package-level test safely can: the patch document is the empty, parseable layer the manifest promises (mirroring `packages/bundle/base/tests/base.spec.ts`); `composeEntries` — the exact function the profile launcher calls to build the row set it mounts — produces a row set for `dsh-base` + `workforce-global` identical to `dsh-base` alone; and a real `Context` + `Loader` + `Include` mounts this bundle's actual (empty) patch file as a second layer over a trivial fixture layer and reaches ready with no thrown error and no row added, changed, or removed.
- **Give the bundle a `publishConfig` matching `dsh-base`/`dsh-headless`'s public scope**: rejected for now — publishing an empty placeholder package to the public `@deepseek-ai` npm scope is a deliberate decision for whoever ships the first populated Workforce package, not a byproduct of scaffolding an empty layer.

## Consequences

- `dsh --profile workforce-global` is a real, bootable profile today, with no Workforce-owned plugin yet mounted — every later Workforce task that populates this layer only edits `packages/bundle/workforce-global/cordis.patch.yml` and adds its own dependency, never touching `PROFILE_TEMPLATES` again.
- `packages/boot/app-boot/tests/profile.spec.ts` gained one assertion block for `PROFILE_TEMPLATES['workforce-global']`, alongside the existing `acp`/`sdk`/`sdk-minimal` checks it already made.
- `tsconfig.host.json`'s project-reference list and `scripts/verify-package-readme-model-experience.ts`'s package allowlist both gained one entry for the new package, the same registration every existing bundle package already required; `packages/bundle/README.md`/`README.zh.md`'s package table gained one row so a reviewer can diff `workforce-global` against the parallel `workforce-cell` bundle a separate task adds.
- A full live boot of the real `dsh-base` + `workforce-global` composition (mounting all ~80 rows through the actual profile module-fallback anchor) is deferred to the e2e tier, exercised the same way every other shipped profile's full boot already is — this Agent Note does not add a new e2e test, since the profile is currently empty and imports nothing that could regress the boot beyond what `packages/boot/app-boot`'s own suite and the shipped `headless`/`web`/`sdk`/`acp` e2e suites already cover.
