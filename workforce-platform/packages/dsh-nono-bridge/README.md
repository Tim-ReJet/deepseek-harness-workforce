# @workforce/dsh-nono-bridge

Plan 16's tool-admission pipeline ends `... → DSH ToolDefinition projection
→ runtime ActionIntent → **permit check + nono** → tool invocation`
(`plans/16-mcp-tool-admission.md:251`: "The tool executor does not directly
call the server. It creates ActionIntent and delegates to the Workforce
bridge."). This package is that "permit check" half — the DSH-facing
`ActionIntent` mapped to nono capability strings, then compared against an
already-compiled `CapabilityManifest` for an explicit allow/deny.

## What it does

- `actionIntentToCapabilities(intent)` — pure mapping from an
  `ActionIntent.semanticAction` to the nono capability strings it implies.
  Deliberately non-exhaustive: only the two families
  `@workforce/permit-compiler`'s `grantsWorkdirAccess` already keys on
  (`scm.repository.*`, `process.execute.*`). An unmatched `semanticAction`
  maps to `[]` — fail-closed, never a guessed capability.
- `checkActionIntent(intent, manifest)` — compares that mapping against an
  already-compiled `CapabilityManifest` (`@workforce/permit-compiler`'s
  `compilePermitToManifest` output, i.e. NONO-002's manifest) and returns
  `{ allowed, reason, missingCapabilities? }`. Pure, synchronous,
  in-process comparison: no credential, no I/O, no network call. Fails
  closed both ways — an unmapped `semanticAction` (empty requirement list)
  is denied, not implicitly allowed, and a mapped capability the manifest
  does not actually grant is denied with the missing capability named in
  `reason`/`missingCapabilities`.

## What it explicitly does not do

- **Does not call nono's live supervisor.** This is defense-in-depth /
  early rejection ahead of nono's own mechanical enforcement
  (`crates/nono/src/supervisor`), not a replacement for it. No socket is
  opened to a running nono process; the comparison is entirely against the
  in-memory `CapabilityManifest` object already produced by
  `compilePermitToManifest`.
- **Does not hook DSH's actual tool executor inside `deepseek-harness-workforce`.**
  In workforce-platform, `providers/execution-cell-worker.ts` calls
  `checkActionIntentWithOwnedPaths` at the nono supervisor ActionIntent
  admission seam for the LAUNCH-001 execution Cell path; the harness repo
  still owns in-process DSH tool-call wiring.
- **Does not call Cerbos or the Permit Issuer per check.** Once a Cell's
  manifest is admitted, `checkActionIntent` runs with no per-call policy
  round trip (D-41 local fast path) — it is a pure comparison against the
  manifest already compiled for that Cell generation, not a fresh
  authorization request.
- **Does not implement the full plan 15 Effect Gateway pipeline.** Only the
  `ActionIntent` stage exists in `@reactorjet/workforce-contracts` by
  design; this package does not add `EffectIntent`/`EffectReceipt` types
  or stages.
- **Does not widen a Workforce permit.** `checkActionIntent` takes no
  override argument; its decision is derived only from the already-compiled
  manifest and the intent's mapped capabilities (invariant 7).

## Capability → grant resolution

`CapabilityManifest` has no field that literally lists "granted
capabilities" — only its derived effects (`filesystem.grants`,
`network.mode`/`allow_domains`). `checkActionIntent` reads grant presence
off those sections:

- `scm.repository.*`/`process.execute.*` capabilities (the only families
  `actionIntentToCapabilities` maps today) are satisfied only by a
  `write`/`readwrite` entry in `manifest.filesystem.grants`.
- Any other capability family is satisfied only by a non-`"blocked"`
  `manifest.network.mode`. `actionIntentToCapabilities` never returns a
  capability outside the filesystem family today, so this branch is
  unreached in practice — it exists so a future mapped family is denied by
  default here rather than implicitly allowed because this function had no
  rule for it (invariant 3's "narrowest reading").

See `src/check-action-intent.ts` for the full decision logic and
`src/check-action-intent.test.ts` for the covered cases (granted → allow;
required-but-not-granted → deny naming the missing capability; unmapped
`semanticAction` → deny, not an implicit allow).
