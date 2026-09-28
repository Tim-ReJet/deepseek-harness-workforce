# Workforce in-process tool-call admission (BRIDGE-001 harness half)

## Decision

Cell DSH must not invoke tools before plan 16's permit check. The harness owns projection from `ToolExecution` to `ActionIntent` plus a `tools/pre-execute` listener that calls `@workforce/dsh-nono-bridge` **`checkActionIntentWithOwnedPaths` only** when admission is enabled; missing sealed `DelegationPlan` or `workerId` denies (ADR-029 — no manifest-only `checkActionIntent` fallback). Denial returns a structured pre-execute failure without running the tool body. Sibling pin tracks workforce-platform `main` (post PR #160 supervisor seam; verify at `bbfc56d` on `main` after PR #166/#168); this package is the in-process executor wiring only.

## Constraints honored

- No parallel permit stack: admission delegates to existing bridge APIs only.
- Fail closed: missing projection, projection errors, unmapped `semanticAction`, manifest deny, missing plan/workerId, and off-`ownedPaths` writes all deny before dispatch.
- Board/wake is not an input to admission; authority is manifest + sealed plan only.

## Verification

- `packages/workforce/tool-admission/tests/tool-admission.spec.ts` — allow on granted manifest + plan; deny on missing capability, unmapped semantic action, off-ownedPaths write, unlisted tool, missing pathArgument, missing plan/workerId.
- `packages/bundle/workforce-cell/tests/startup.spec.ts` — loader boot plus pre-execute deny when plan/workerId unset.
- Sibling checkout: [packages/workforce/WORKFORCE_PLATFORM.md](../../../packages/workforce/WORKFORCE_PLATFORM.md) (`bbfc56d`).
