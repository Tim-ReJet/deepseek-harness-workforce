# `compat/workorder-v1` — WorkOrder V1 → V2 mapping rules

`mapWorkOrderV1ToV2` (and its non-throwing twin, `safeMapWorkOrderV1ToV2`) is
a **one-way** compatibility mapper: `workorder/v1`
(`@workforce/workorder-protocol`) → a `biro.workorder/v2` draft (this
package). There is no `mapWorkOrderV2ToV1`. `packages/workorder-protocol` is
read-only from this package — nothing here ever writes to it, and V1 stays
byte-compatible (`git diff --stat -- packages/workorder-protocol` is empty
for every commit that touches this mapper).

## Why a mapper, not a migration

`workorder/v1` is frozen (ADR-017): it is the live Biro↔Workforce seam
contract and cannot be changed without breaking every deployed producer/
consumer. V2's WorkOrder (CONTRACT-001) is a clean, independently versioned
schema with a different shape and a different job (a *what/why/how-much*,
never a *how*). This mapper exists so a V1 object already in flight can be
read as a V2 draft *without* pretending V1 is V2, or mutating V1 to look
more like V2.

## Field-by-field rules

| V1 field | V2 destination | Rule |
|---|---|---|
| `protocol` (`"workorder/v1"`) | *(not copied to a V2 core field)* + `extensions["compat.workorder.v1"].protocol` | The V1 protocol id stays on the V1 source object. V2's own `schema` field is always the literal `"biro.workorder/v2"` — it is never derived from or set to V1's `protocol` value. |
| `id` | `id` | Copied verbatim (both are ULIDs). |
| `tenantId` | `tenantId` | Copied verbatim. |
| `companyId` | `organisationId` | Closest V1 analogue; override via `options.organisationId` if a real organisation id exists that V1 didn't carry. |
| `issuedBy` (`principalRef`) | `issuedBy` and `accountability.owner` (`identity`) | `id` copied verbatim. `kind` is translated: `human`→`human`, `service`→`service`, `ceo-agent`/`workforce-lead`/`platform-lead`→`agent` (V2 has no agent-role granularity). `issuer` is set to the constant `"workorder/v1"` (exported as `COMPAT_IDENTITY_ISSUER`) because V1's `principalRef` carries no `issuer` field — this is a compatibility marker, **not** a real issuer URL/authority, and must not be treated as one. `tenantId` is carried from the WorkOrder's own `tenantId`. |
| `intent` | `objective.goal`, `objective.outcomes[0].description` | V2 requires ≥1 outcome; V1 has no structured outcome list, so a single synthetic outcome (`id: "outcome-1"`) carries the same intent string. `objective.context` is a generated compat note, not a V1 field (V1 has no context field). `objective.nonGoals` defaults to `[]`. |
| `goldenPathId`, `inputs` | **execution machinery** → `extensions["compat.workorder.v1"]` only | The golden path and its parameters are *how* the WorkOrder is satisfied, not *what*/*why*/*how-much* — they never become V2 core fields (see CONTRACT-001's `FORBIDDEN_WORKORDER_FIELDS` invariant, which this mapper's output must also satisfy). |
| `complianceProfile` | `extensions["compat.workorder.v1"]` only | No V2 core field exists for it yet; not invented. |
| `constraints` (opaque record) | `scope.constraints[]` **and** `extensions["compat.workorder.v1"].constraints` | Each `key: value` entry becomes one `scopeConstraint` (`type: "must"`, `condition: "key = <json value>"`) so the information isn't silently lost, but it is explicitly labelled "migrated verbatim ... not re-evaluated" in its `reason` — this mapper does not attempt semantic constraint translation. The raw record is also kept in extensions for fidelity. |
| `policyBundle` | `extensions["compat.workorder.v1"]` only | `policyBundle.humanApprovalRequired` is a list of action-name strings, not policy references, so it is **not** coerced into `accountability.approvalPolicies` (which defaults to `[]`). Cerbos policy-pack mapping is a later unit's job, not this mapper's. |
| `architectureRef` | `scope.targets[0]` (`{ kind: "workorder-v1.architecture-block", id: architectureRef }`) **and** `extensions["compat.workorder.v1"].architectureRef` | V2 requires ≥1 scope target; the architecture block reference is the only V1 field that names a concrete scoped thing, so it seeds the synthetic target. |
| `blockRevision` | `extensions["compat.workorder.v1"]` only | No V2 core field; execution/planning bookkeeping. |
| `budgetLease.currency`, `.capMinorUnits` | `resources.budget.{currency,capMinorUnits}` | Already integer minor units in V1 — copied verbatim, no unit conversion needed. |
| `budgetLease.expiresAt` | `resources.deadline` | V2 has no separate "lease expiry" concept; the lease's expiry is the closest analogue to a resource deadline. |
| `budgetLease.leaseId` | `extensions["compat.workorder.v1"].budgetLease` (raw) only | Lease bookkeeping, not a V2 core concept. |
| `approvalToken` | **not converted** — `extensions["compat.workorder.v1"].approvalToken` only | Approval tokens are a V1 PLANNED-gate artifact; they are never turned into a V2 `ExecutionPermit` (a different artifact, with a different issuer, grant shape, and signature scheme). If present, the raw token is preserved in extensions for audit; if absent, the key is omitted (not written as `null`/`undefined`). |
| `marketplaceIntent`, `billingIntent` | `extensions["compat.workorder.v1"]` only | Optional V1 side-channel intents with no V2 core equivalent. |
| `createdAt` | `provenance.createdAt` | Copied verbatim. `provenance.source` is always the literal `"workorder/v1"`. |
| *(no V1 field)* | `version` | V1 has no WorkOrder revision counter; defaults to `1`, override via `options.version`. |
| *(no V1 field)* | `authorityCeiling.{capabilities,prohibited}` | V1 has no authority-ceiling concept; defaults to `{ capabilities: [], prohibited: [] }` rather than inventing scopes. A later unit that derives a real ceiling (e.g. from the DelegationPlan replacing this draft's golden path) should overwrite this, not this mapper. |
| *(no V1 field)* | `acceptance.assertions` | V2 requires ≥1 assertion; V1 has no acceptance-criteria field, so a single synthetic `REQUIRED` assertion documents that no real V1 criteria existed. |
| *(no V1 field)* | `lifecycle.mode` | Set to the literal `"workorder-v1-compat"` so a consumer can tell a mapped draft apart from a natively-issued V2 WorkOrder at a glance. |
| *(nothing)* | `digest` | Computed for real via CONTRACT-002's `computeArtifactDigest` (RFC 8785 JCS + SHA-256) over the mapped draft, excluding `digest` itself — **not** a placeholder and **not** copied from any V1 hash (V1's `hash.ts` canonicalizer is a different, non-interchangeable algorithm; a V1 hash must never be compared against or substituted for a V2 digest). |
| entire V1 object | `extensions["compat.workorder.v1"].source` | The full original V1 object is also embedded verbatim, so any field this table doesn't call out by name — including future/unknown fields such as a fixture's `_futureTagV2` — is still preserved rather than silently dropped. |

## Explicit non-goals

- **No verdicts.** `mapWorkOrderV1ToV2` never emits `PASS`/`FAIL`/
  `INDETERMINATE` anywhere in its output, and its return type
  (`WorkOrderV2`) has no field capable of carrying one. Verdicts are
  `OutcomeAttestation`'s job (a different artifact, produced by a different,
  later stage of the pipeline), never a compatibility mapper's.
- **No `ExecutionPermit`.** Approval tokens stay approval tokens (preserved
  raw in extensions); they are not reinterpreted as grants.
- **No V1 mutation.** The mapper only reads its `v1` argument (via
  `safeParseWorkOrder`, which itself does not mutate); nothing under
  `packages/workorder-protocol` is imported for write access, and no test or
  code path in this directory touches that package's files.
- **No invented hashes.** `digest` is either genuinely computed (CONTRACT-002
  present, as it is on this tree) or, if a future checkout lacks
  CONTRACT-002, this mapper must not be used to fabricate one — it depends
  on `computeArtifactDigest` unconditionally rather than falling back to a
  placeholder string.
