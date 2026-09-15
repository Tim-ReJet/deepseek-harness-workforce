/**
 * exports-boundary.test.ts — BATCH_2_REPORT.md §3/§7 item 5: this package
 * had no `exports` map, so DSH's `packages/workforce/session-events`
 * "works" only because nothing declared a public surface to violate
 * ("Deep `src/` import; no runtime validation of the digest format;
 * relies on the absence of an `exports` map"). CONTRACT-005 adds an
 * explicit `exports` map (package.json) covering the package root plus
 * every deep `src/` specifier a real consumer uses today. This test is
 * the regression guard: it scans source text for
 * `@reactorjet/workforce-contracts/<subpath>` specifiers and fails if any
 * one found is NOT a key declared in package.json's `exports` map — so a
 * *new* deep import added later, anywhere in the workspace, without a
 * matching `exports` entry fails immediately instead of silently working
 * by omission (the exact failure mode this task closes).
 *
 * Scope note (packet CONTRACT-005, implementation_steps): this test scans
 * this repo (workforce-platform) in full — mandatory, self-checked below
 * so the scan is never vacuously empty — and, opportunistically, the
 * sibling `biro` and `deepseek-harness-workforce` checkouts when present
 * on disk at their conventional sibling path. It does not fail if a
 * sibling repo is absent (e.g. a CI checkout of workforce-platform alone);
 * it only fails if a specifier is found that escapes the declared map.
 * `nono-workforce` is Rust and cannot hold a JS/TS import specifier, so it
 * is not scanned.
 */
import { describe, expect, it, vi } from "vitest";

// The sibling-checkout scan walks biro and the DSH fork when present; under
// load it can exceed vitest's 5 s default and `pnpm -r test` then stops at
// contracts (BATCH_3_REPORT R6.7 item 8). Give it a real budget.
vi.setConfig({ testTimeout: 60_000 });
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
// packages/contracts/exports-boundary.test.ts -> workforce-platform repo root
const thisRepoRoot = join(here, "..", "..");
// workforce-platform -> the shared parent directory of the sibling repos
const siblingsRoot = join(thisRepoRoot, "..");

const PACKAGE_NAME = "@reactorjet/workforce-contracts";

// A quoted specifier of the form '@reactorjet/workforce-contracts/<rest>'
// (single, double, or backtick quotes) — catches `import ... from "..."`,
// `export ... from "..."`, `require("...")`, and an inline `import("...")`
// type expression alike, since every one of those forms quotes the module
// specifier. Deliberately does NOT require a leading `import`/`export`
// keyword, matching this package's own invariant-13.test.ts philosophy:
// broader-than-strict-parse is the safer failure direction for a boundary
// guard.
const SPECIFIER_REGEX = new RegExp(
  `['"\`](${PACKAGE_NAME.replace(/[/]/g, "\\/")}/[^'"\`]+)['"\`]`,
  "g",
);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "lib",
  "build",
  ".git",
  ".turbo",
  "coverage",
]);

const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (SOURCE_FILE_PATTERN.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `@reactorjet/workforce-contracts/<subpath>` specifier quoted in `text`. */
function findDeepSpecifiers(text: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  SPECIFIER_REGEX.lastIndex = 0;
  while ((match = SPECIFIER_REGEX.exec(text)) !== null) {
    found.push(match[1]);
  }
  return found;
}

function loadDeclaredExportKeys(): Set<string> {
  const pkgPath = join(thisRepoRoot, "packages", "contracts", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const exportsMap = pkg.exports ?? {};
  const keys = new Set<string>();
  for (const key of Object.keys(exportsMap)) {
    if (key === ".") continue; // root export has no subpath specifier form
    // exports keys are declared as "./src/..." — the specifier a consumer
    // writes is "@reactorjet/workforce-contracts/src/...", so strip the
    // leading "./" and prefix the package name.
    const subpath = key.startsWith("./") ? key.slice(2) : key;
    keys.add(`${PACKAGE_NAME}/${subpath}`);
  }
  return keys;
}

interface RepoScanResult {
  repo: string;
  scanned: boolean;
  violations: string[];
  fileCount: number;
}

function scanRepoForUndeclaredSpecifiers(
  repo: string,
  root: string,
  declared: Set<string>,
): RepoScanResult {
  if (!existsSync(root)) {
    return { repo, scanned: false, violations: [], fileCount: 0 };
  }
  const files = listSourceFiles(root).filter((file) => file !== selfPath);
  const violations: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const specifier of findDeepSpecifiers(text)) {
      if (!declared.has(specifier)) {
        violations.push(`${file}: undeclared deep specifier "${specifier}"`);
      }
    }
  }
  return { repo, scanned: true, violations, fileCount: files.length };
}

describe("exports map boundary — no deep `src/` import escapes the declared exports map", () => {
  const declared = loadDeclaredExportKeys();

  it("self-check: the declared-exports map is non-empty (this task actually added entries)", () => {
    expect(declared.size).toBeGreaterThan(0);
  });

  it("self-check: this repo's scan root exists and contains source files (the scan below is not vacuous)", () => {
    const files = listSourceFiles(thisRepoRoot);
    expect(files.length).toBeGreaterThan(0);
  });

  it("self-check: the detector flags a synthetic deep specifier that is NOT in the exports map", () => {
    const synthetic = `import { secretThing } from "${PACKAGE_NAME}/src/not-a-declared-subpath.ts";\n`;
    const specifiers = findDeepSpecifiers(synthetic);
    expect(specifiers).toEqual([`${PACKAGE_NAME}/src/not-a-declared-subpath.ts`]);
    expect(specifiers.every((s) => declared.has(s))).toBe(false);
  });

  it("self-check: the detector does NOT flag a specifier that IS declared in the exports map", () => {
    const declaredExample = [...declared][0];
    const clean = `import { x } from "${declaredExample}";\n`;
    const specifiers = findDeepSpecifiers(clean);
    expect(specifiers).toEqual([declaredExample]);
    expect(specifiers.every((s) => declared.has(s))).toBe(true);
  });

  it("self-check: the detector catches a require(), a re-export, and an inline import() form alike", () => {
    const requireForm = `const { x } = require("${PACKAGE_NAME}/src/bogus.ts");\n`;
    const reexportForm = `export { x } from "${PACKAGE_NAME}/src/bogus.ts";\n`;
    const inlineImportForm = `type T = import("${PACKAGE_NAME}/src/bogus.ts").T;\n`;
    for (const text of [requireForm, reexportForm, inlineImportForm]) {
      expect(findDeepSpecifiers(text)).toEqual([`${PACKAGE_NAME}/src/bogus.ts`]);
    }
  });

  it("self-check: the root (non-deep) specifier is never treated as a deep specifier", () => {
    const rootImport = `import { workOrder } from "${PACKAGE_NAME}";\n`;
    expect(findDeepSpecifiers(rootImport)).toEqual([]);
  });

  it("no undeclared deep `@reactorjet/workforce-contracts/...` specifier exists anywhere in this repo, or in the sibling biro/deepseek-harness-workforce checkouts when present", () => {
    const results: RepoScanResult[] = [
      scanRepoForUndeclaredSpecifiers("workforce-platform", thisRepoRoot, declared),
      scanRepoForUndeclaredSpecifiers(
        "biro",
        join(siblingsRoot, "biro"),
        declared,
      ),
      scanRepoForUndeclaredSpecifiers(
        "deepseek-harness-workforce",
        join(siblingsRoot, "deepseek-harness-workforce"),
        declared,
      ),
    ];

    // The mandatory scan (this repo) must actually have run.
    const own = results.find((r) => r.repo === "workforce-platform");
    expect(own?.scanned).toBe(true);

    const allViolations = results.flatMap((r) => r.violations);
    expect(allViolations).toEqual([]);
  });
});
