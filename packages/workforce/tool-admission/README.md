---
description: "Workforce Cell tool-call admission via ActionIntent projection and the dsh-nono-bridge permit check before tool dispatch."
kind: "library"
---

# @deepseek-ai/dsh-workforce-tool-admission

English | [中文](README.zh.md)

## Summary

`dsh-workforce-tool-admission` implements plan 16's in-process half inside the harness: each tool call is projected to a Workforce `ActionIntent`, checked through `@workforce/dsh-nono-bridge` (`checkActionIntent` / `checkActionIntentWithOwnedPaths` when a sealed `DelegationPlan` and `workerId` are configured), and denied in `tools/pre-execute` before the tool body runs when the bridge returns `allowed: false`. It does not call MCP servers or nono's live supervisor; it compares against the Cell's already-compiled `CapabilityManifest` and sealed path ownership only.

## Use this package

Mount it on the `workforce-cell` profile (via `@deepseek-ai/dsh-workforce-cell`) or any composition that supplies a compiled manifest, Cell ids, per-tool projection specs, and optionally a sealed delegation plan for ownedPaths. Unlisted tools and unmapped semantic actions fail closed.

## Config

See `Config` in [`src/config.ts`](src/config.ts): `manifest`, `projections`, `workOrderId`/`runId`/`cellId`/`taskId`, optional `delegationPlan` + `workerId` for ownedPaths.

## Model Experience

Denied calls return `Error: Workforce tool admission denied: …` as the tool result text; allowed calls proceed unchanged.

## Known Limitations and Deferred Work

- **Projections are config-owned**, not yet read from ToolDefinition metadata; expand the projection table as tools ship on the Cell profile.
- **Requires a sibling `workforce-platform` checkout** at `workforce-platform/` (or repo parent) for `@workforce/*` link dependencies.

## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Pin bridge behavior to `@workforce/dsh-nono-bridge` at the workforce-platform commit recorded in the harness PR; do not reimplement permit logic here.

</details>
