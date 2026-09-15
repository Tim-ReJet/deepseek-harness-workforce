# Contract versioning and breaking-change policy

The `schema` literal on every artifact (`biro.workorder/v2`, `workforce.delegation-plan/v1`, …) **is** its version. Nothing else carries version meaning.

## Rules

1. **Additive is non-breaking.** Adding an optional field, a new enum member that consumers must tolerate, or a new artifact type keeps the literal. Fixtures and generated JSON Schema are regenerated in the same change (`pnpm run generate:schemas`; committed schemas must match).
2. **Anything else is breaking** — removing or renaming a field, narrowing a type, changing digest input, changing the meaning of an existing value. A breaking change bumps the literal (`…/v2` → `…/v3`) and:
   - keeps the previous schema and its fixtures in place (frozen, like `workorder/v1` in `@workforce/workorder-protocol`);
   - adds a mapper under `src/compat/` from the previous version, with round-trip tests (see `src/compat/workorder-v1.ts`);
   - adds new fixtures and conformance vectors for the new version;
   - records the change in the pack (`plans/01-contracts-artifacts.md`, D-05) and, if authority semantics change, an ADR.
3. **Digest stability is part of the contract.** Canonical bytes (RFC 8785 JCS, `src/common/digest.ts`) for an existing version never change. The vectors under `conformance/vectors/` are frozen per version.
4. **Consumers pin the literal.** A consumer that receives an unknown literal must reject or route to a compat mapper — never guess.

## Explicit breaking-version behaviour (G0 proof)

`pnpm test` includes a check that every fixture's `schema` literal is one the package exports, and that no frozen vector's digest changes. A literal bump without a compat mapper and new vectors fails `pnpm test`.
