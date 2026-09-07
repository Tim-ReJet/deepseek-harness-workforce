---
description: "The Workforce global profile layer over dsh-base: currently empty, for users composing or booting the workforce-global profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-workforce-global

English | [中文](README.zh.md)

## Summary

`dsh-workforce-global` is the second bundle layer of the shipped `workforce-global` profile, stacked over `@deepseek-ai/dsh-base`. It is currently empty — a real, named, bootable layer with no rows of its own — so `dsh --profile workforce-global` composes and boots today, before any Workforce-owned plugin exists to populate it. Later Workforce tasks add their own rows to this bundle's `cordis.patch.yml` as those plugins land (starting with the durable SessionEvent extension package). You rarely touch this bundle directly; it is not a library you import.

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

The `workforce-global` profile already composes this bundle: run `dsh --profile workforce-global "your task"` and both layers auto-initialize on first use. To add or remove it from a custom profile:

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-workforce-global
dsh plugin --profile <name> remove @deepseek-ai/dsh-workforce-global
```

In-box bundles resolve from the dsh installation. A profile that lists this bundle without also listing `@deepseek-ai/dsh-base` first has no core services to stack onto, and fails to boot.

### What you get

Nothing yet. Today's patch (`cordis.patch.yml`) is an empty insert list: every observable behavior of the `workforce-global` profile comes from `dsh-base` alone. This bundle exists so the profile has a stable, named second layer for later Workforce plugins to stack rows onto, without every one of those tasks also needing to invent the profile itself.

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
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | Manifest/patch-shape checks, a `composeEntries` no-op-over-`dsh-base` check, and a real Loader/Include mount of this bundle's own patch file as a second layer |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-base bundle](../base/README.md) — the shared core this layer stacks onto.
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

- **This bundle is empty by design, not by omission** — the `workforce-global` profile's persistent web/SDK/server surface, `@workforce/*` and `@biro/*` plugins, and admin tooling described in plan 04's "Global profile" are deferred to the Workforce tasks that create those packages; adding a `@workforce/*` dependency here ahead of the package that justifies it breaks `pnpm install` for the whole repository.
- **No live patch reload** — `patchReload: 'startup'` matches `headless`'s posture: a persistent host does not need live user-patch reload by default.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
