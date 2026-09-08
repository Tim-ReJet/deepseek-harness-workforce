---
description: "The workforce group map: durable Workforce Session state for users and maintainers navigating the group."
kind: "package-group"
---

# packages/workforce

English | [中文](README.zh.md)

## Summary

The workforce group records Workforce-specific durable Session state — today, which canonical WorkOrder (`biro.workorder/v2`, `@reactorjet/workforce-contracts`) a Session is bound to — as SessionEvents folded into `ctx.sessionProjections` read models. It never mutates or copies the objects it references; it only records durable facts about a Session's relationship to them, layered on the existing session-log and session-projection subsystems. Mount a package from this group wherever a Workforce-governed Session boots.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`session-events`](session-events/README.md) | Durable `workforce/workorder-bound` SessionEvent and its `workforceSessionBinding` projection | registers on `ctx.sessionProjections` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Session subsystem](../../docs/subsystems/session.md) — the durable event log every package in this group appends to.
- [Session projections subsystem](../../docs/subsystems/session-projection.md) — the `ctx.sessionProjections` fold this group's packages register against.
- [`@reactorjet/workforce-contracts`](../../../workforce-platform/packages/contracts) — the canonical WorkOrder and execution-profile schemas this group's packages reference, never redeclare.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
