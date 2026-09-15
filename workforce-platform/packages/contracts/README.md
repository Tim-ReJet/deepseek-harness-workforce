# @reactorjet/workforce-contracts

The constitutional V2 artifact package. Every V2 Biro/Workforce/authority/Cell/
provider component imports its boundary types from here — nothing downstream
hand-rolls a competing shape for WorkOrder, DelegationPlan, ExecutionPermit,
ProvisioningSpec, ValidationSpec, OutcomeAttestation or ToolAdmissionRecord.

`workorder/v1` (`@workforce/workorder-protocol`) is a separate, frozen
package. This package does not mutate it, import from it, or replace it.

## What's here (CONTRACT-001)

- `src/common/` — shared primitives: `Ulid`/`Id`, `Digest`/`DigestRef`,
  `ArtifactRef`, `Identity`, `Money`/`Budget`, `Rfc3339`, `Verdict`,
  `Extensions`.
- `src/<artifact>/index.ts` — one Zod schema + inferred type per V2 artifact.
  Zod is canonical.
- `schemas/*.schema.json` — generated from the Zod schemas (`pnpm
  generate:schemas`); `src/schema-parity.test.ts` fails if they drift.
- `fixtures/*.json` — copied verbatim from the implementation pack's
  `examples/`; every fixture round-trips through its matching schema.

## What's here (CONTRACT-002)

- `src/common/digest.ts` — RFC 8785 JCS canonicalization
  (`canonicalizeJcs`), SHA-256 digests (`sha256Digest`, `digestOfJcs`), and
  the artifact-level helpers (`computeArtifactDigest`,
  `verifyArtifactDigest`) that hash every field of an artifact *except*
  `digest` and `signature`. This is a distinct, non-interchangeable
  algorithm from `workorder/v1`'s canonicalizer in
  `packages/workorder-protocol/src/hash.ts` — V1 stays frozen on its own
  serializer.
- `src/common/dsse.ts` — the DSSE envelope type (`DsseEnvelope`), PAE
  (pre-authentication encoding), `createDsseEnvelope`/`verifyDsseEnvelope`,
  and a branded signer-role type model (`PermitIssuerSigningKey` /
  `OutcomeAttestorSigningKey` / `ToolAdmitterSigningKey`) so a Permit Issuer
  key and an Outcome Attestor key are distinct identities at the type level.
  `generate*TestKey` functions mint in-process Ed25519 keypairs for tests
  only — no production key material lives in this package.
- `conformance/` — cross-language JCS canonicalization + digest test
  vectors (plain JSON in, canonical text + digest out) and a Node fixture
  runner (`pnpm -F @reactorjet/workforce-contracts conformance`). Rust/Go
  verifiers are a later unit; see `conformance/README.md`.

## What's here (CONTRACT-003)

- `src/compat/workorder-v1.ts` — `mapWorkOrderV1ToV2`/
  `safeMapWorkOrderV1ToV2`, a one-way mapper from a frozen `workorder/v1`
  object (`@workforce/workorder-protocol`) to a `biro.workorder/v2` draft.
  Execution machinery (golden path, inputs, architectureRef, blockRevision,
  policyBundle, approval tokens) never becomes a V2 core field — it is
  dumped into `extensions["compat.workorder.v1"]`, including the full raw
  V1 object for fidelity against unknown/future fields. `digest` is
  computed for real via CONTRACT-002's `computeArtifactDigest`, not
  invented. See `src/compat/README.md` for the full field-by-field mapping
  table.

## What's here (SUPPLY-001 — provider admission)

- `src/provider-admission-record/index.ts` — `ProviderAdmissionRecord` Zod
  schema (`workforce.provider-admission/v1`), plan 18's SC-01: a
  provider-granularity sibling of `ToolAdmissionRecord` covering
  `dsh-plugin | dsh-bundle | nono-package | runtime-image | agent-provider |
  effect-provider | validation-provider | model-adapter`. Reuses
  `digest`/`digestRef`/`identity`/`rfc3339`/`id`/`extensions` from
  `src/common` unchanged; `status` is `ADMITTED | QUARANTINED | DENIED |
  REVOKED` (plan 18's enum, not `ToolAdmissionRecord`'s `REJECTED`), and
  `requiredIsolation` is a bare `z.string().min(1)` — there is no shared
  `IsolationClass` type in this package.
- `src/provider-admission-store/index.ts` — `InMemoryProviderAdmissionStore`,
  an in-memory admission gate (`admit`/`verify`/`get`/`listByStatus`/
  `revoke`/`impactedBy`/`resetForTest`) modeled on this repo's other
  in-memory admission gates. Signs/verifies with CONTRACT-002's DSSE
  envelope using `generateToolAdmitterTestKey` — no new `SignerRole` and no
  Sigstore/cosign/OIDC; a valid signature proves publisher claims, not
  safety.

## What's here (CONTRACT-004 — execution-permit network-grant field)

- `src/execution-permit/index.ts` — `grant.networkAccess`, an additive,
  optional `Array<{ destination: string; purpose?: string }>` on
  `workforce.execution-permit/v1`. It is a genuine outbound-network grant
  (e.g. package-registry reach for dependency installation), distinct from
  `grant.capabilities` (`scm.*`/`process.execute.*`) and
  `grant.effects[].effectClass`, neither of which means network egress. The
  schema literal is unchanged, existing permits without the field remain
  valid (absent and `[]` both mean no network grant), and `grant` stays
  `.strict()`. This closes the schema gap flagged in
  `packages/permit-compiler/README.md` ("Network mode gap") without wiring
  the compiler to read it — `resolveNetworkMode` still always returns
  `"blocked"` until a follow-on node consumes this field.

## What's explicitly NOT here yet

- Rust/Go conformance verifiers — see `conformance/README.md`.
- Real signing of the pack's example fixtures — they remain unsigned drafts
  with placeholder `digest`/`signature` values; `src/artifact-digest.test.ts`
  recomputes and verifies real digests against them instead of mutating the
  five artifacts that cross-reference each other by digest.
- A V2→V1 mapper (the reverse direction) — `workorder-v1.ts` is one-way by
  design; V1 stays the frozen, independently-owned seam contract.
## Commands

```bash
pnpm -F @reactorjet/workforce-contracts typecheck
pnpm -F @reactorjet/workforce-contracts test
pnpm -F @reactorjet/workforce-contracts generate:schemas
pnpm -F @reactorjet/workforce-contracts conformance
```

## Versioning

See [VERSIONING.md](./VERSIONING.md) — the `schema` literal is the version; breaking changes bump it and ship a compat mapper.

## What's here (CONTRACT-005 — exports map and 0.2.0)

- `package.json` now declares an `exports` map: `"."` (unchanged, `./src/index.ts`,
  matching `main`/`types`) plus exactly the deep `src/` subpaths a real consumer
  uses today — `./src/workorder/index.ts`, `./src/common/digest.ts`,
  `./src/common/ids.ts`, `./src/common/extension.ts`, and
  `./src/execution-profile/binding.ts`, the four DSH `session-events` named
  and one more (`common/extension.ts`, a type-only import) found in the same
  package by the grep this task's implementation_steps required. This closes
  BATCH_2_REPORT.md §3/§7 item 5: DSH's `packages/workforce/session-events`
  previously reached these paths as a deep `src/` import that only "worked"
  because the package declared no public surface to violate. That specifier
  set is unchanged by this task and continues to resolve exactly as before —
  this is a declared, checked contract for an existing coupling, not a new
  one.
- `exports-boundary.test.ts` (package root) is the regression guard: it scans
  this repo, and the sibling `biro`/`deepseek-harness-workforce` checkouts
  when present, for any `@reactorjet/workforce-contracts/...` deep specifier
  not listed in the `exports` map above, and fails immediately if one is
  found — so the next accidental deep coupling is caught instead of silently
  working by omission.
- Package version bumped `0.1.0` → `0.2.0`: a consumer-facing surface
  addition (the `exports` map itself), not a `schema` literal change — see
  [VERSIONING.md](./VERSIONING.md), whose versioning rules govern artifact
  `schema` literals and are unaffected by this package-level bump.
