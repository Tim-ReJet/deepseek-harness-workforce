# CONTRACT-001 — Canonical V2 artifact schemas

## Before/after architecture slice

**Before:** V2 had no constitutional contracts package. `workorder/v1`
(`@workforce/workorder-protocol`) was the only typed boundary, and it is
frozen (ADR-017) — it cannot carry V2's Workforce-owned artifacts
(DelegationPlan, ExecutionPermit, ProvisioningSpec, ValidationSpec,
OutcomeAttestation) without becoming a second, incompatible V1 mutation.

**After:** `packages/contracts` (`@reactorjet/workforce-contracts`) exists as
a private workspace package with Zod 3.x schemas + inferred TypeScript types
for every V2 artifact named in the implementation pack's `examples/`
directory, plus the shared primitives (`ArtifactRef`, `Digest`, `Identity`,
`Money`/`Budget`, RFC3339 timestamps, ULID/generic ids, `Verdict`,
`Extensions`) those artifacts are built from. JSON Schema is generated from
the Zod schemas (never hand-maintained separately) and a test asserts the
two stay in parity. `workorder/v1` is untouched — `git diff --stat` against
`packages/workorder-protocol` is empty.

## Files/packages changed

New package only — nothing outside `packages/contracts/**` was modified
except `pnpm-lock.yaml` (dependency resolution for the new package's `zod`,
`zod-to-json-schema`, `typescript`, `vitest`, `tsx`).

```
packages/contracts/
├── package.json, tsconfig.json, vitest.config.ts, .gitignore, README.md
├── src/
│   ├── common/{ids,time,money,digest,artifact-ref,identity,extension,verdict}.ts(+.test.ts)
│   ├── workorder/index.ts(+.test.ts)
│   ├── delegation-plan/index.ts(+.test.ts)
│   ├── execution-permit/index.ts(+.test.ts)
│   ├── provisioning-spec/index.ts(+.test.ts)
│   ├── validation-spec/index.ts(+.test.ts)
│   ├── outcome-attestation/index.ts(+.test.ts)
│   ├── tool-admission-record/index.ts(+.test.ts)
│   ├── index.ts (barrel)
│   ├── conformance.test.ts (V1-frozen check + all-fixtures round-trip)
│   └── schema-parity.test.ts (Zod ⇄ generated JSON Schema diff)
├── schemas/*.schema.json (generated, committed)
├── fixtures/*.json (copied verbatim from the pack's examples/)
└── scripts/generate-json-schema.ts
```

## Canonical artifacts consumed/produced

**Consumed:** none (Wave 1 — this package is the root of the V2 boundary
graph; it depends on nothing else in the platform).

**Produced (types + Zod schemas, JSON-compatible, schema-versioned):**
`WorkOrder` (`biro.workorder/v2`), `DelegationPlan`
(`workforce.delegation-plan/v1`), `ExecutionPermit`
(`workforce.execution-permit/v1`), `ProvisioningSpec`
(`workforce.provisioning-spec/v1`), `ValidationSpec`
(`workforce.validation-spec/v1`), `OutcomeAttestation`
(`workforce.outcome-attestation/v1`), `ToolAdmissionRecord`
(`workforce.tool-admission/v1`), plus shared `ArtifactRef`, `Digest`/
`DigestRef`, `Identity`, `Money`/`Budget`, `Rfc3339`, `Verdict`, `Extensions`,
`Ulid`/`Id`.

## Trust domain and identity

This package defines shapes only; it holds no trust domain of its own. It
types *who* an `Identity` is (`id`, `kind`, `issuer`, `tenantId`,
`organisationId`) and *whose signature* an artifact carries, but performs no
verification — verification is a consumer's job (later units).

## Authority held by the changed component

None. A schema package has no runtime authority. Notably: `grant.capabilities`
and `grant.effects` on `ExecutionPermit` are typed as plain string arrays
specifically so a later re-issuing component can validate a *subset* of a
prior grant (invariant 3 — child authority can only narrow) — this package
does not itself enforce narrowing, it only makes the type shape narrowing-
capable. A test (`execution-permit/index.test.ts`) confirms a narrowed grant
still parses.

## Effect/idempotency behavior

N/A — no effects, no execution. `WorkOrder`'s own shape was checked against
and confirmed free of execution-machinery fields (DSH profile, model,
command, image, RuntimeClass, local filesystem path) both by an explicit key
denylist test and by asserting those keys are absent from the Zod shape
itself.

## Restart/cancellation/replay behavior

N/A — no runtime.

## Tests and fault injections run

```
pnpm -F @reactorjet/workforce-contracts typecheck   # exit 0
pnpm -F @reactorjet/workforce-contracts test        # exit 0 — 10 files, 54 tests passed
git -C packages/workorder-protocol diff --stat      # empty (V1 unchanged)
```

Coverage highlights:
- every pack `examples/*.json` V2 artifact round-trips through its matching
  schema (`conformance.test.ts` + per-artifact fixture tests);
- unknown top-level keys fail producer-side strict parse (every artifact);
- a namespaced `extensions` object is optional and tolerated (every
  artifact);
- `WorkOrder` rejects DSH profile/model/command/image/RuntimeClass/local-path
  fields, both by injection and by shape inspection;
- `packages/workorder-protocol` exists, unchanged (`git diff --stat` empty,
  asserted in-test via `execFileSync`);
- `Verdict` is exactly `PASS`/`FAIL`/`INDETERMINATE`;
- generated JSON Schema files match their committed counterparts
  byte-for-byte (`schema-parity.test.ts`), so Zod stays the single source of
  truth.

## Unresolved risks / leftover

- **Hashing is not implemented** — `Digest`/`ArtifactRef.digest` are typed as
  `sha256:${string}` but no code in this package computes a digest from
  bytes. That is CONTRACT-002.
- **No DSSE envelope, no signature verification, no key material** —
  `signature` fields (`ExecutionPermit`, `OutcomeAttestation`,
  `ToolAdmissionRecord`) are opaque `string`s for now, matching the fixtures'
  `"example-signature"` placeholder.
- **No V1→V2 mapper** — out of scope for this unit by design.
- A few field-level types (`scope.constraints[].type`, `criticality`,
  `status`) were given small closed enums (`must`/`should`/`may`;
  `REQUIRED`/`OPTIONAL`; `ADMITTED`/`REJECTED`/`REVOKED`) inferred from a
  single example value each plus an obvious complement — a later unit with
  fuller spec visibility should confirm these are exhaustive rather than
  widen them speculatively. Fields with no comparable evidence (`mode`,
  `isolationClass`, `independence`, `procedure.kind`, etc.) were deliberately
  left as plain non-empty strings rather than guessed enums.
- `zod-to-json-schema@3.24.6`'s declared peer range (`^3.24.1`) is slightly
  ahead of this package's pinned `zod@^3.23.0` (matching
  `@workforce/workorder-protocol`'s pin, per the "use zod 3.x" invariant);
  pnpm reports the peer mismatch as a warning only — schema generation and
  all tests run clean against it.

## Migration/compatibility impact

None outside `packages/contracts/**`. `pnpm-lock.yaml` gained entries for
this package's new dependencies; no other package's dependency graph
changed. `workorder/v1` is byte-identical to before this unit.
