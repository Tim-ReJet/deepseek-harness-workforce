# CONTRACT-002 — Canonical serialization, hashing, signature envelope

## Before/after architecture slice

**Before:** CONTRACT-001 shipped `@reactorjet/workforce-contracts` with
Zod-typed V2 artifact shapes, but `Digest`/`ArtifactRef.digest` were typed
as `sha256:${string}` with nothing that could compute one — every fixture's
`digest`/`signature` value was a hand-written placeholder
(`sha256:0000...`, `"example-signature"`). No V2 component could actually
hash an artifact or verify a signature; the only real hashing algorithm in
the repo was `workorder/v1`'s home-grown canonicalizer, which is frozen and
not reusable for V2 (V2 must be RFC 8785, per the plan's decision 4).

**After:** `packages/contracts/src/common/digest.ts` implements RFC 8785
JCS canonicalization (via the `canonicalize` package, the RFC's own
reference implementation) and SHA-256 digesting, plus artifact-level
helpers (`computeArtifactDigest`, `verifyArtifactDigest`,
`withoutDigestAndSignature`) that hash a WorkOrder or Workforce artifact
correctly — excluding its own `digest` and `signature` fields. `dsse.ts`
adds a typed DSSE envelope, PAE (pre-authentication encoding), sign/verify
functions, and a branded signer-role type model so a Permit Issuer key and
an Outcome Attestor key cannot be silently swapped. Cross-language
conformance vectors under `conformance/` give a future Rust/Go
implementation an unambiguous, language-agnostic "did you get this right?"
check. `packages/workorder-protocol` is untouched (`git diff --stat` empty).

## Files/packages changed

All within `packages/contracts/**`, plus `pnpm-lock.yaml` (new `canonicalize`
dependency resolution — the same footprint CONTRACT-001 left when it added
its own dependencies).

```
packages/contracts/
├── package.json                          # + canonicalize dependency, + conformance script
├── README.md                             # + CONTRACT-002 section
├── src/common/
│   ├── digest.ts                         # + canonicalizeJcs, sha256Digest, digestOfJcs,
│   │                                      #   withoutDigestAndSignature, computeArtifactDigest,
│   │                                      #   verifyArtifactDigest (existing digest/digestRef untouched)
│   ├── digest.test.ts                    # new
│   ├── dsse.ts                           # new — DSSE envelope, PAE, sign/verify, signer roles
│   ├── dsse.test.ts                      # new
│   └── index.ts                          # + export "./dsse.js"
├── src/
│   ├── artifact-digest.test.ts           # new — recomputes digest over the 5 real fixtures
│   └── conformance-vectors.test.ts       # new — wires conformance/ vectors into `pnpm test`
└── conformance/                          # new
    ├── README.md
    ├── run-fixtures.ts                   # tiny Node fixture runner (check/--write modes)
    └── vectors/
        ├── 001-simple-object.{input.json,canonical.txt,digest.txt}
        ├── 002-key-order-a.{...}          # same semantics, different key order —
        ├── 002-key-order-b.{...}          #   same canonical/digest, proves the core property
        ├── 003-nested-and-arrays.{...}
        ├── 004-unicode-and-escapes.{...}
        ├── 005-numbers.{...}
        └── 006-empty-collections.{...}
```

## Canonical artifacts consumed/produced

**Consumed:** the CONTRACT-001 artifact schemas and fixtures
(`workorder.json`, `delegation-plan.json`, `execution-permit.json`,
`provisioning-spec.json`, `validation-spec.json`) as the real-world inputs
`artifact-digest.test.ts` hashes.

**Produced:** `canonicalizeJcs`, `sha256Digest`, `digestOfJcs`,
`computeArtifactDigest`, `verifyArtifactDigest`, `withoutDigestAndSignature`
(digest.ts); `DsseEnvelope`/`DsseSignature` types, `preAuthenticationEncoding`,
`createDsseEnvelope`, `verifyDsseEnvelope`, `toVerificationKey`, and the
branded `SigningKey`/`VerificationKey<Role>` + `generatePermitIssuerTestKey`
/ `generateOutcomeAttestorTestKey` / `generateToolAdmitterTestKey` (dsse.ts).

## Trust domain and identity

This unit introduces the first identity distinction with teeth: `SigningKey`
and `VerificationKey` are generic over `SignerRole` (`"permit-issuer" |
"outcome-attestor" | "tool-admitter"`) and branded with a private symbol, so
a `PermitIssuerSigningKey` and an `OutcomeAttestorSigningKey` are distinct
TypeScript types — passing one where the other is expected requires an
explicit, visible cast, not just a shape match. `verifyDsseEnvelope` also
enforces this at runtime: an unknown `keyid` (e.g. an Outcome Attestor
verification key presented for a Permit Issuer signature) is reported as an
error, never silently accepted. No production key material exists anywhere
in this package — `generate*TestKey` functions mint fresh in-process
Ed25519 keypairs for tests only.

## Authority held by the changed component

None. Digest/DSSE helpers are pure functions over bytes and Zod types; they
hold no runtime authority and make no policy decisions. `verifyArtifactDigest`
and `verifyDsseEnvelope` return booleans/result objects for a caller to act
on — this package does not itself gate anything.

## Effect/idempotency behavior

`canonicalizeJcs`/`digestOfJcs`/`computeArtifactDigest` are pure and
deterministic: no clock, no environment, no randomness, no I/O. The same
semantic input — any key insertion order — always canonicalizes/hashes to
the same output, which is the entire point (cross-process, cross-language,
cross-repo commitment). `createDsseEnvelope`/`verifyDsseEnvelope` touch
`node:crypto` only (no filesystem, no network).

## Restart/cancellation/replay behavior

N/A — no runtime, no persisted state. DSSE's PAE format itself is what
prevents "signature replay under a different `payloadType`": the signed
bytes are `PAE(type, body)`, not the raw payload, so a signature over an
`ExecutionPermit`-typed payload cannot be replayed as if it signed an
`OutcomeAttestation`-typed payload with the same bytes.

## Tests and fault injections run

```
pnpm -F @reactorjet/workforce-contracts typecheck   # exit 0
pnpm -F @reactorjet/workforce-contracts test        # exit 0 — 14 files, 93 tests passed
git diff --stat -- packages/workorder-protocol      # empty (V1 unchanged)
npx tsx conformance/run-fixtures.ts                 # all 7 vectors passed
```

Coverage highlights:

- identical semantic objects (different key insertion order, including
  nested objects) hash identically — both in `digest.test.ts`'s unit tests
  and in the `002-key-order-a`/`002-key-order-b` conformance vectors;
- RFC 8785 edge cases: `NaN`/`Infinity` rejected, lone UTF-16 surrogates
  rejected, `undefined`-valued object keys omitted, non-ASCII characters
  left unescaped (JCS requirement — verified against the generated
  `004-unicode-and-escapes` vector);
- `computeArtifactDigest`/`verifyArtifactDigest` ignore the artifact's own
  current `digest`/`signature` values (recomputed digest is identical
  regardless of what those two fields currently hold) and change when any
  other field changes — exercised on synthetic data (`digest.test.ts`) and
  on all 5 real `workorder`/Workforce-artifact fixtures
  (`artifact-digest.test.ts`);
- DSSE: sign/verify round-trip with an in-process Ed25519 test key; one
  flipped payload byte fails verification; verifying against the wrong
  role's key (Outcome Attestor key checking a Permit Issuer signature)
  fails with an explicit "no verification key known" error rather than a
  silent pass; multiple signatures on one envelope each verify
  independently; PAE is sensitive to `payloadType` (prevents cross-type
  replay); zero signing keys is rejected.

## Unresolved risks / leftover

- **Fixtures are still unsigned drafts.** The pack's 5 example fixtures
  keep their placeholder `digest`/`signature` values rather than being
  rewritten with real ones, per the brief's stated alternative — rewriting
  `workorder.json`'s real digest would need to ripple into every fixture
  that references it by digest (`delegation-plan.json`,
  `execution-permit.json`, `provisioning-spec.json`,
  `validation-spec.json`), which is a bigger, cross-cutting change this
  unit's scope doesn't call for. `artifact-digest.test.ts` proves the
  helper is correct against real fixture shapes instead.
- **Rust/Go conformance verifiers are not implemented.** `conformance/`
  vectors are format-agnostic (plain JSON in, plain text canonical/digest
  out) specifically so a later unit can add a verifier in either language
  without touching this unit's files; see `conformance/README.md`.
- **DSSE signatures are not yet wired into the four Workforce artifact
  types.** `ExecutionPermit.signature`/`OutcomeAttestation.signature`/
  `ToolAdmissionRecord.signature` remain opaque `string`s in CONTRACT-001's
  schemas (unchanged by this unit) — this unit ships the envelope/sign/
  verify primitives, not a migration of those fields to `DsseEnvelope`
  itself, which would touch artifact schemas outside this unit's stated
  scope ("DSSE envelope type + verify interface exist").
- **No V1→V2 mapper** — out of scope by design (CONTRACT-003).
- `canonicalize@4.0.0`'s package is Apache-2.0 licensed and ESM-only
  (`"type": "module"`), consistent with this package's own `"type":
  "module"` — no CJS interop shim was needed.

## Migration/compatibility impact

None outside `packages/contracts/**`. `pnpm-lock.yaml` gained entries for
the new `canonicalize` dependency; no other package's dependency graph
changed. `workorder/v1` is byte-identical to before this unit
(`git diff --stat -- packages/workorder-protocol` is empty).
