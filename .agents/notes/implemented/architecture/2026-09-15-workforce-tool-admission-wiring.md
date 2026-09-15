# Workforce in-process tool-call admission (BRIDGE-001 harness half)

## Decision

Cell DSH must not invoke tools before plan 16's permit check. The harness owns projection from `ToolExecution` to `ActionIntent` plus a `tools/pre-execute` listener that calls `@workforce/dsh-nono-bridge` (`checkActionIntent` / `checkActionIntentWithOwnedPaths`); denial returns a structured pre-execute failure without running the tool body. workforce-platform PR #160 (`fd38001`) keeps the supervisor seam; this package is the in-process executor wiring.

## Constraints honored

- No parallel permit stack: admission delegates to existing bridge APIs only.
- Fail closed: missing projection, projection errors, unmapped `semanticAction`, manifest deny, and off-`ownedPaths` writes all deny before dispatch.
- Board/wake is not an input to admission; ownedPaths tests mirror `gateOwnedPathWrite` plan-only authority (ADR-029).

## Verification

- `packages/workforce/tool-admission/tests/tool-admission.spec.ts` — allow on granted manifest, deny on missing capability, unmapped semantic action, off-ownedPaths write, unlisted tool, and plan-only path gate vs wake widening.
