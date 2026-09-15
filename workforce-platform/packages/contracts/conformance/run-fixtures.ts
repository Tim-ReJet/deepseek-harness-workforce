#!/usr/bin/env node
/**
 * run-fixtures.ts — the tiny cross-language conformance runner for CONTRACT-002.
 *
 * Each vector under `vectors/` is a `<name>.input.json`. This script:
 *
 *  1. In `--write` mode: canonicalizes each input with this package's JCS
 *     implementation, hashes the result, and writes `<name>.canonical.txt`
 *     (the exact canonical bytes, no trailing newline) and `<name>.digest.txt`
 *     (the `sha256:...` digest) alongside it. Run this once, by hand, when a
 *     vector is added or intentionally changed — the committed `.canonical.txt`
 *     / `.digest.txt` files are the fixture, not the output of every run.
 *  2. In (default) check mode: re-canonicalizes/re-hashes every input and
 *     fails loudly if the result no longer matches the committed
 *     `.canonical.txt` / `.digest.txt` — the same check
 *     `src/conformance-vectors.test.ts` runs under vitest.
 *
 * Rust and Go verifiers are intentionally out of scope for this unit — see
 * README.md. This runner exists so a companion implementation in another
 * language has an executable, unambiguous "did we get this right?" check to
 * port before either one is written; there is nothing TypeScript-specific
 * about the vector format (plain JSON in, plain UTF-8 text/digest out).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJcs, sha256Digest } from "../src/common/digest.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsDir = join(here, "vectors");

export interface FixtureVector {
  name: string;
  inputPath: string;
  canonicalPath: string;
  digestPath: string;
}

export function listVectors(): FixtureVector[] {
  return readdirSync(vectorsDir)
    .filter((f) => f.endsWith(".input.json"))
    .map((f) => f.replace(/\.input\.json$/, ""))
    .sort()
    .map((name) => ({
      name,
      inputPath: join(vectorsDir, `${name}.input.json`),
      canonicalPath: join(vectorsDir, `${name}.canonical.txt`),
      digestPath: join(vectorsDir, `${name}.digest.txt`),
    }));
}

export function computeVector(vector: FixtureVector): { canonical: string; digest: string } {
  const input = JSON.parse(readFileSync(vector.inputPath, "utf8"));
  const canonical = canonicalizeJcs(input);
  const digest = sha256Digest(canonical);
  return { canonical, digest };
}

function main() {
  const write = process.argv.includes("--write");
  const vectors = listVectors();
  if (vectors.length === 0) {
    throw new Error(`no vectors found under ${vectorsDir}`);
  }

  let failures = 0;
  for (const vector of vectors) {
    const { canonical, digest } = computeVector(vector);
    if (write) {
      writeFileSync(vector.canonicalPath, canonical);
      writeFileSync(vector.digestPath, digest);
      console.log(`wrote ${vector.name}`);
      continue;
    }

    const expectedCanonical = readFileSync(vector.canonicalPath, "utf8");
    const expectedDigest = readFileSync(vector.digestPath, "utf8").trim();
    if (canonical !== expectedCanonical) {
      failures++;
      console.error(
        `[FAIL] ${vector.name}: canonical mismatch\n  expected: ${expectedCanonical}\n  actual:   ${canonical}`,
      );
      continue;
    }
    if (digest !== expectedDigest) {
      failures++;
      console.error(
        `[FAIL] ${vector.name}: digest mismatch\n  expected: ${expectedDigest}\n  actual:   ${digest}`,
      );
      continue;
    }
    console.log(`[ok] ${vector.name}`);
  }

  if (failures > 0) {
    console.error(`${failures}/${vectors.length} vector(s) failed`);
    process.exit(1);
  }
  console.log(`all ${vectors.length} vectors passed`);
}

// Only run as a script (not when imported by the vitest suite).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
