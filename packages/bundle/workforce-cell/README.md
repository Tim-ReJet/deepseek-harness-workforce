---
description: "The Workforce Cell profile layer over dsh-base + dsh-headless: currently empty, for users composing or booting the workforce-cell profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-workforce-cell

English | [中文](README.zh.md)

## Summary

`dsh-workforce-cell` is the third bundle layer of the shipped `workforce-cell` profile, stacked over `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless` (a disposable Cell answers one delegated task and exits, so the one-shot headless runner — not the persistent Web/HTTP host — is the closest existing shipped shape to "Cell DSH essentials"). Its patch mounts `@deepseek-ai/dsh-workforce-tool-admission` so each tool call is projected to a Workforce `ActionIntent` and admitted through `@workforce/dsh-nono-bridge` before the tool body runs (plan 16 in-process seam). You rarely touch this bundle directly; it is not a library you import.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

The `workforce-cell` profile already composes this bundle: run `dsh --profile workforce-cell "your task"` and all three layers auto-initialize on first use. To add or remove it from a custom profile:

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-workforce-cell
dsh plugin --profile <name> remove @deepseek-ai/dsh-workforce-cell
```

In-box bundles resolve from the dsh installation. A profile that lists this bundle without also listing `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-headless` first has no core services or one-shot runner to stack onto, and fails to boot.

### What you get

Tool-call admission before dispatch: the patch configures `@deepseek-ai/dsh-workforce-tool-admission` with the Cell's compiled `CapabilityManifest`, optional sealed `DelegationPlan` + `workerId`, WorkOrder/run/cell/task ids, and a tool-name → ActionIntent projection map (typically from `WORKFORCE_CELL_*` env vars at launcher boot). Unmapped tools and bridge denials fail closed in `tools/pre-execute` with a structured reason; allowed calls proceed to the normal DSH tool executor. Core agent, session, and headless runner behavior still comes from `dsh-base` and `dsh-headless`.

This bundle stays nono-oblivious at the bundle layer: ADR-006 keeps live nono as an external supervisor boundary; in-process admission compares against manifest and sealed ownedPaths only and does not call MCP or widen permits from board wake traffic.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a static patch document, currently an empty `[]`. It mounts no service, emits no events, and holds no mutable state. As rows are added, each one's own package owns that row's behavior and invariants — this package stays a pure composition-layer carrier, the same trust boundary as any other shipped bundle (README invariant 17: an empty bundle must not fail any gate that assumes every bundle carries functional plugins).

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The bundle substance: an empty `insert` list today, with the rationale for staying empty as an inline comment |
| [`src/index.ts`](src/index.ts) | Package entry; carries no runtime API |
| — | No runtime invariant companion is published; the package is a static patch-list carrier with no mutable relation to check. |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | Manifest/patch-shape checks, a `composeEntries` no-op-over-`dsh-base`+`dsh-headless` check, and a real Loader/Include mount of this bundle's own patch file as a second layer |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-base bundle](../base/README.md) — the shared core this layer stacks onto.
- [dsh-headless bundle](../headless/README.md) — the one-shot runner layer this bundle stacks over.
- [app-boot profile section](../../boot/app-boot/README.md) — how profiles are resolved, layered, and customized.
- [Bundle package map](../README.md) — the surfaces built on the shared core.

-----

<a id="model-experience"></a>
## Model Experience

None, as the patch list is empty today and registers no rows.

#### KV Cache effect

The bundle adds no request prefix; it carries no rows to add one.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **This bundle is empty by design, not by omission** — the Cell's real behavior (`@workforce/execution-cell`'s Task/Gate/Loop runtime, `@workforce/nono-bridge`'s ActionIntent-to-nono bridge, an evidence exporter) is deferred to the Cell tasks that create those packages; adding a `@workforce/*` dependency here ahead of the package that justifies it breaks `pnpm install` for the whole repository.
- **No live patch reload** — `patchReload: 'startup'` matches `headless`'s posture: a disposable Cell that answers one task and exits has no live-reload use case.
- **No tool admission pipeline** — this bundle does not wire `packages/mcp/mcp-client` in; a discoverable MCP tool having zero mutation authority by default is a precondition later Cell tasks must satisfy before wiring any real tool through this profile.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
