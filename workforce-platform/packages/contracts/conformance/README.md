# CONTRACT-002 conformance vectors

Cross-language RFC 8785 (JCS) canonicalization + SHA-256 digest test
vectors. Each vector is a plain JSON input plus its expected canonical
serialization and expected `sha256:` digest — nothing TypeScript-specific,
so a Rust or Go implementation can consume the same three files and assert
byte-for-byte / digest equality without depending on this package.

## Layout

For each vector `vectors/<name>`:

- `<name>.input.json` — the JSON input (arbitrary formatting/key order;
  only the *parsed* value matters).
- `<name>.canonical.txt` — the exact expected RFC 8785 canonical bytes (no
  trailing newline).
- `<name>.digest.txt` — the expected `sha256:<64 lowercase hex>` digest of
  the canonical bytes (UTF-8).

`002-key-order-a` and `002-key-order-b` are two inputs with the same
semantic content in different key order; both are expected to produce the
same `.canonical.txt` and `.digest.txt` — the core JCS property this unit
exists to guarantee.

## Running

```bash
npx tsx conformance/run-fixtures.ts          # check mode (also run by vitest)
npx tsx conformance/run-fixtures.ts --write  # regenerate expected outputs after
                                              # intentionally adding/changing a vector
```

`src/conformance-vectors.test.ts` runs the same check mode under `pnpm test`.

## Status

- **TypeScript**: implemented, exercised by `run-fixtures.ts` and
  `src/conformance-vectors.test.ts`.
- **Rust / Go verifiers**: not implemented yet. This is deliberate scope for
  a later unit — the vector *format* above is designed so a Rust/Go
  implementation can be dropped in without changing any of these files: read
  `<name>.input.json`, canonicalize with an RFC 8785 implementation, compare
  to `<name>.canonical.txt`, SHA-256 the canonical bytes, compare to
  `<name>.digest.txt`.
