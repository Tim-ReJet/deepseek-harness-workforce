# CONTRACT-003 — WorkOrder V1 to V2 compatibility mapper

## Summary

`packages/contracts/src/compat/workorder-v1.ts` adds a one-way mapper,
`mapWorkOrderV1ToV2` (+ non-throwing `safeMapWorkOrderV1ToV2`), from a frozen
`workorder/v1` object (`@workforce/workorder-protocol`) to a schema-valid
`biro.workorder/v2` draft (`@reactorjet/workforce-contracts`'s `workOrder`
schema from CONTRACT-001). `packages/workorder-protocol` is read-only from
this package: it is only imported for its exported `WorkOrder` type and
`safeParseWorkOrder`/`hashObject` functions, never mutated, and
`git diff --stat -- packages/workorder-protocol` is empty for this unit.

Mapping rules (execution machinery → `extensions`, budget → integer minor
units, approval tokens not converted to permits, V1 protocol id stays on the
source) are documented field-by-field in
`packages/contracts/src/compat/README.md`.

`digest` is not a placeholder: CONTRACT-002 is on this tree, so the mapper
computes a real digest via `computeArtifactDigest` (RFC 8785 JCS + SHA-256)
over the mapped draft.

## Files

- `packages/contracts/src/compat/workorder-v1.ts` — the mapper
  (`mapWorkOrderV1ToV2`, `safeMapWorkOrderV1ToV2`, `COMPAT_EXTENSION_NAMESPACE`,
  `COMPAT_IDENTITY_ISSUER`, `MapWorkOrderV1ToV2Options`).
- `packages/contracts/src/compat/README.md` — the field-by-field mapping
  table and explicit non-goals (no verdicts, no ExecutionPermit conversion,
  no V1 mutation, no invented hashes).
- `packages/contracts/src/compat/workorder-v1.test.ts` — tests (below).
- `packages/contracts/src/index.ts` — barrel now re-exports `./compat/workorder-v1.js`.
- `packages/contracts/package.json` — added `@workforce/workorder-protocol: workspace:*`
  dependency (needed to import the V1 type/parser).
- `packages/contracts/README.md` — added a "What's here (CONTRACT-003)"
  section; removed the now-stale "V1→V2 mapper is a later unit" note.
- `pnpm-lock.yaml` — gained the workspace-link entry for the new dependency
  (`packages/contracts` → `@workforce/workorder-protocol`); no other
  package's dependency graph changed.

## Tests

```
pnpm -F @reactorjet/workforce-contracts test        # exit 0 — 15 files, 110 tests passed
pnpm -F @reactorjet/workforce-contracts typecheck    # exit 0
git diff --stat -- packages/workorder-protocol       # empty (V1 unchanged)
```

Coverage in `workorder-v1.test.ts` (18 new tests):

- the full valid V1 fixture, the `workorder-no-token` compat fixture, and
  the `workorder-future-field` compat fixture (all from
  `packages/workorder-protocol/fixtures/`) each map to a schema-valid V2
  WorkOrder (`workOrder.safeParse(...).success === true`);
- the V1 fixture file on disk is byte-unchanged after mapping, the mapper
  does not mutate its input object, and V1's own `hashObject` output is
  unaffected — mapping has no side effect on V1's canonical hash;
- V1's `protocol` ("workorder/v1") never appears as V2's `schema` (always
  the literal `"biro.workorder/v2"`) and is preserved only under
  `extensions["compat.workorder.v1"].protocol`;
- execution machinery (`goldenPathId`, `inputs`, `architectureRef`,
  `blockRevision`, and every `FORBIDDEN_WORKORDER_FIELDS` entry from
  CONTRACT-001) never appears as a V2 top-level key, and is present verbatim
  in the `extensions` compat namespace instead;
- `budgetLease.{currency,capMinorUnits}` map to `resources.budget` unchanged
  (already integer minor units — no float/decimal conversion needed), and
  `Number.isInteger` holds on the mapped amount;
- `approvalToken` is preserved raw in extensions but never appears as a
  `grant`-shaped object anywhere in the output (not converted to an
  ExecutionPermit);
- a fixture with truly unknown/future fields (`_futureTagV2`, `nestedFuture`)
  round-trips them intact via the embedded raw `source` object in
  extensions — nothing is silently dropped;
- the mapped output never contains the strings `"PASS"`/`"FAIL"`/
  `"INDETERMINATE"` and has no `verdict` key — the mapper cannot attest
  outcomes;
- the computed `digest` matches `sha256:<64 hex>`, is not all-zero, and
  `verifyArtifactDigest` confirms it against the mapped payload;
- V1 principal kinds map correctly (`ceo-agent`/`workforce-lead`/
  `platform-lead` → `agent`; `human`/`service` pass through), and
  `accountability.owner` equals the mapped `issuedBy`;
- `safeMapWorkOrderV1ToV2` returns `{ success: false }` and
  `mapWorkOrderV1ToV2` throws, both on a malformed (non-WorkOrder) V1 input,
  rather than guessing at a shape;
- an advisory `git diff --stat` check (skipped outside a git checkout)
  confirms `packages/workorder-protocol` stays empty-diffed.

## Risks / leftovers

- **Synthetic fields are unavoidable for a few V2-required-but-V1-absent
  concepts** (`objective.outcomes[0]`, `acceptance.assertions[0]`,
  `scope.targets[0]`, `authorityCeiling.{capabilities,prohibited}` defaulting
  to `[]`): V2's schema requires non-empty arrays/objects V1 has no source
  data for. Each synthetic value's provenance is documented in the mapping
  table and is either derived from a real V1 field (the architecture ref
  seeds the scope target; the intent seeds the outcome) or explicitly
  labelled as a compat placeholder in its own text (the acceptance
  assertion's `proposition` literally says "no V1 acceptance criteria
  existed"). A downstream consumer that needs a real authority ceiling or
  acceptance criteria must derive them from the DelegationPlan this draft
  feeds into — this mapper does not invent business logic to fill gaps.
- **`organisationId` defaults to V1's `companyId`.** This is the closest
  analogue but is not asserted to be identical in every future V1 fixture;
  `MapWorkOrderV1ToV2Options.organisationId` lets a caller override it when
  a real organisation id exists that V1 never carried.
- **`scope.constraints` migrated from V1's opaque `constraints` record are
  explicitly labelled non-authoritative** (`reason: "... not re-evaluated as
  a V2 scope constraint"`) rather than silently treated as real V2 policy —
  semantic constraint translation is a later unit's job.
- **No Rust/Go equivalent** — this mapper is TypeScript-only, matching the
  rest of `packages/contracts`.
- **`pnpm-lock.yaml` changed outside `packages/contracts/**`** — unavoidable
  for adding a `workspace:*` dependency; the diff is a 3-line link-entry
  addition only (verified with `git diff pnpm-lock.yaml`), no other
  package's resolved versions moved.

## Compliance with unit constraints

- No push, no PR, no merge, no `treehouse return` performed.
- Only files under `packages/contracts/**` were edited (plus the
  unavoidable `pnpm-lock.yaml` link entry for the new workspace dependency).
- `packages/workorder-protocol/**` was read from, never written to;
  `git diff --stat -- packages/workorder-protocol` is empty.
