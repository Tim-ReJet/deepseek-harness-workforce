---
description: "Durable WorkOrder binding for a Workforce Session, for users and maintainers choosing, configuring, or debugging the workforce/workorder-bound SessionEvent and its workforceSessionBinding projection."
kind: "package-reference"
---

# @deepseek-ai/dsh-workforce-session-events

English | [中文](README.zh.md)

## Summary

`dsh-workforce-session-events` records which canonical WorkOrder (`biro.workorder/v2`, `@reactorjet/workforce-contracts`) a Session is bound to, as a durable `workforce/workorder-bound` SessionEvent, and folds it into a `workforceSessionBinding` read projection over `ctx.sessionProjections`. Call `bindWorkOrder(session, candidate)` once a WorkOrder should govern a Session; it validates the candidate against the canonical schema and appends the binding event, or throws before anything commits. The package never mutates or copies WorkOrder's objective, scope, or acceptance state — only a reference (id, digest) plus the resolved execution-profile version travel through the log. Mount it wherever `workforce-global` boots; it is the plan-04 "WorkOrder binding as durable SessionEvent" line, scoped to the binding fact itself.

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

Mount this package wherever a Session needs a durable record of the WorkOrder governing it, then call `bindWorkOrder` from the code that resolves a WorkOrder for that Session.

### When to choose it

Choose it for any Workforce Session that a WorkOrder governs — today, the `workforce-global` profile's WorkOrder control Sessions. Skip it for Sessions with no WorkOrder concept (ordinary `headless`/`sdk` runs). It records only the binding fact; ActionIntent/EffectReceipt SessionEvents, the ValidationSpec projection, and Cell lifecycle are separate packages layered on top once their own contracts land.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-workforce-session-events'
```

The package takes no configuration: it registers the `workforceSessionBinding` projection unconditionally and requires `ctx.sessionProjections` (fails explicitly at load if absent, per that seam's own contract).

### Entry point

```ts
import { bindWorkOrder } from '@deepseek-ai/dsh-workforce-session-events'

const event = bindWorkOrder(session, candidateWorkOrder)
// event.data: { workOrderId, workOrderDigest, profileVersion, boundAt }
```

`candidateWorkOrder` is parsed against the canonical `workOrder` schema (`@reactorjet/workforce-contracts`) before anything is appended — a candidate that fails validation throws and the Session's `seq` is unchanged. Read the current binding back through the projection seam:

```ts
const binding = ctx.sessionProjections.stateOf(session, 'workforceSessionBinding').current
// { workOrderId, workOrderDigest, profileVersion, boundAt } | null
```

A second `bindWorkOrder` call for the same or a different WorkOrder is accepted like any other append: the session log's own strictly-increasing `seq` orders the two events, and the projection folds last-write-wins — there is no separate rebind ceremony.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The payload is a whole-value envelope, never a delta: `{ workOrderId, workOrderDigest, profileVersion, boundAt }`. `workOrderId`/`workOrderDigest` are typed from the imported `WorkOrder` contract type, not redeclared (`AGENT_EXECUTION_PROTOCOL.md` §3). `profileVersion` is a stable string — `"<profileId>@<profileVersion>"` when the WorkOrder carries a `workforce.execution-profile` binding extension (`readProfileBindingExtension`, `@reactorjet/workforce-contracts`), or the literal `"unresolved"` before one exists. The fold is a strict decode-and-replace: each event already carries the complete post-bind state (the session-projection seam's whole-value event rule), so `apply` never needs the prior state's contents.

No runtime invariant companion is published because this package has no diverging observation to check: `bindWorkOrder` is the one code path that appends this event, and it and the projection fold both run the same strict decoder (`decodeWorkOrderBoundPayload`) independently — a second, registry-driven observer would only recheck the identical relation the fold already checks on every read (`packages/AGENTS.md` "Publish `./invariant` only for diverging observations").

### Source-map table

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | Pure payload/read-model types (`WorkforceWorkOrderBoundEvent`, `WorkforceSessionBinding`), free of host-side imports |
| [`src/domain.ts`](src/domain.ts) | `SessionEventMap`/`SessionProjectionStateMap`/`SessionProjectionMap` declare-module augmentations, the strict decoder, `formatProfileVersion`, and the projection definition |
| [`src/index.ts`](src/index.ts) | `bindWorkOrder`, and the `apply(ctx)` Cordis function-plugin that registers the projection |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-goal`](../../goal/goal/README.md) — the structural template this package follows: a durable domain event plus its session-projection fold.
- [`dsh-session-projection`](../../session/session-projection/README.md) — the `ctx.sessionProjections` seam this package registers against.
- [`dsh-workforce-global`](../../bundle/workforce-global/README.md) — the bundle that mounts this package.
- [`@reactorjet/workforce-contracts`](../../../../workforce-platform/packages/contracts) — the canonical `biro.workorder/v2` schema this package consumes, never redeclares.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package appends a durable log event and folds a host-side projection — no prompt, tool schema, or other model-visible surface of its own. A future consumer that renders the bound WorkOrder's goal or context into a model request must do so through this SessionEventMap member (`docs/architecture.md:112`, "model-visible means logged"), not a side channel.

#### KV Cache effect

None: this package adds no request-time content, so it has no effect on prefix reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No mutation or acceptance-state authority.** This package only records a WorkOrder reference (id, digest, resolved profile version); it cannot resolve, sign, or widen any WorkOrder, permit, or acceptance state, and never will — WorkOrder is Biro-issued and Workforce/DSH never mutates it.
- **ActionIntent/EffectReceipt, ValidationSpec projection, and Cell lifecycle are out of scope.** Those plan-04 native extensions depend on contract shapes not yet landed anywhere (BRIDGE-001/CELL-002); this package covers only the binding fact.
- **No Postgres persistence of its own.** This package folds the event over whatever `SessionPersistence` provider is active (JSONL today); a Postgres-backed WorkOrder control projection is a separate, later task (DUR-002) reading this event's folded output.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
