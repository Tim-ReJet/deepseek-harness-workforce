/**
 * invariant-13.test.ts — README.md Invariant 13: "A message, mention,
 * routine, or handoff can wake an agent instance; it cannot grant it
 * authority. No inter-agent communication is an input to permit
 * compilation."
 *
 * This is a structural/static test, not a design intention: it scans every
 * `.ts`/`.tsx` file under `packages/permit-compiler/src` and
 * `packages/authority-runtime/src` (the compiler/issuer input surface —
 * the packet's own read-only/forbidden boundary for this task) for any
 * reach into this task's new types, whether:
 *
 *   - by module path (anything containing "agent-instance"), or
 *   - by the literal presence, *anywhere in the file's text*, of one of
 *     this task's identifiers (`AgentInstanceRef`, `AssignmentRef`,
 *     `AgentMessage`, their Zod exports, or their schema-tag constants).
 *
 * The check is a whole-word text scan, not an import-statement parse. That
 * is deliberate: an import-statement-only check (matching only the
 * bindings named in an `import { ... } from "..."` clause) is defeated by
 * any of a namespace import used via property access
 * (`import * as wc from "@reactorjet/workforce-contracts"; wc.AgentMessage`),
 * a type-only re-export (`export type { AgentMessage } from "..."`), or an
 * inline `import(...)` type expression
 * (`type M = import("@reactorjet/workforce-contracts").AgentMessage`) — in
 * every one of those forms the module-specifier-adjacent `import`/`export`
 * keyword parse misses the reach, but the banned identifier's *text* is
 * still necessarily present in the file, because TypeScript has no way to
 * reference an exported binding without writing its name somewhere. This
 * test's three "bypass" self-checks below (namespace + property access,
 * type re-export, inline `import()`) prove all three of those forms are
 * still caught. It also still catches plain `import type { ... }`: the
 * check does not care whether the file *uses* the binding, and fires on
 * the identifier's presence immediately, before any such wiring is
 * written.
 *
 * Known, accepted limitation (documented per the packet's stop condition):
 * this is a textual-presence check. It cannot catch someone hand-copying
 * the *shape* of one of these types into permit-compiler/authority-runtime
 * under an unrelated local name, without the banned identifier text
 * appearing anywhere in the file — that bypass leaves no matching text to
 * detect. That bypass is also not "no inter-agent communication is an
 * input to permit compilation" in the sense Invariant 13 is guarding
 * against (there is no live reference to actual message/assignment data at
 * that point, just an accidentally-similar local type), and it is the kind
 * of change ordinary code review already catches. The realistic
 * accidental-widening vector this test defends against — a future PR
 * reaching `AgentMessage`/`AssignmentRef` content into a permit decision,
 * by any import form — is caught immediately by this test, before any
 * such wiring is even written.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// packages/contracts/src/agent-instance -> repo root
const repoRoot = join(here, "..", "..", "..", "..");

const WATCHED_DIRS = [
  join(repoRoot, "packages", "permit-compiler", "src"),
  join(repoRoot, "packages", "authority-runtime", "src"),
];

const BANNED_IDENTIFIERS = [
  "AgentInstanceRef",
  "AssignmentRef",
  "AgentMessage",
  "agentInstanceRef",
  "assignmentRef",
  "agentMessage",
  "AGENT_INSTANCE_REF_SCHEMA",
  "ASSIGNMENT_REF_SCHEMA",
  "AGENT_MESSAGE_SCHEMA",
] as const;

const BANNED_PATH_FRAGMENT = "agent-instance";

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Matches `import <default>, * as <ns>, { <named> } from "<path>"` in any
 * combination (all binding forms optional), including multi-line named
 * lists, `import type ...`, and side-effect-only `import "<path>"`. `s`
 * flag so a named-import list spanning multiple lines is matched as one.
 */
const IMPORT_REGEX =
  /import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/gs;

interface ParsedImport {
  modulePath: string;
  bindings: string[];
}

function parseImports(text: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  let match: RegExpExecArray | null;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(text)) !== null) {
    const [, , defaultBinding, namespaceBinding, namedRaw, modulePath] = match;
    const named = (namedRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^type\s+/, ""))
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    const bindings = [defaultBinding, namespaceBinding, ...named].filter(
      (b): b is string => Boolean(b),
    );
    results.push({ modulePath, bindings });
  }
  return results;
}

function findImportViolations(label: string, text: string): string[] {
  const violations: string[] = [];

  // Path-based: any import/export-from statement whose module specifier
  // contains "agent-instance" — catches a subpath import even when it
  // binds no name at all (a side-effect-only `import "...agent-instance..."`).
  for (const { modulePath } of parseImports(text)) {
    if (modulePath.includes(BANNED_PATH_FRAGMENT)) {
      violations.push(`${label}: imports from path "${modulePath}" (contains "agent-instance")`);
    }
  }

  // Text-based: the banned identifier's literal text appears anywhere in
  // the file, as a whole word. This is intentionally broader than "is this
  // identifier bound by an `import { ... }` clause" — see the file's
  // top-of-file doc comment for why an import-statement-only parse is
  // defeated by a namespace import + property access, a type re-export, or
  // an inline `import(...)` type expression, none of which bind the
  // identifier as a plain named import, but all of which must write the
  // identifier's name somewhere in the file to reference it.
  for (const banned of BANNED_IDENTIFIERS) {
    const wordBoundary = new RegExp(`\\b${banned}\\b`);
    if (wordBoundary.test(text)) {
      violations.push(`${label}: file text references banned identifier "${banned}"`);
    }
  }

  return violations;
}

describe("Invariant 13 — no inter-agent communication is an input to permit compilation", () => {
  it("self-check: watched directories exist and are non-empty (the check below is not vacuously passing)", () => {
    for (const dir of WATCHED_DIRS) {
      const files = listSourceFiles(dir);
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it("self-check: the detector catches a synthetic named import, including a type-only one", () => {
    const synthetic = `import { agentMessage } from "@reactorjet/workforce-contracts";\n`;
    expect(findImportViolations("synthetic", synthetic)).toEqual([
      'synthetic: file text references banned identifier "agentMessage"',
    ]);

    const syntheticTypeOnly = `import type { AgentInstanceRef } from "@reactorjet/workforce-contracts";\n`;
    expect(findImportViolations("synthetic-type-only", syntheticTypeOnly)).toEqual([
      'synthetic-type-only: file text references banned identifier "AgentInstanceRef"',
    ]);

    const syntheticMultiline = `import {\n  executionPermit,\n  type AssignmentRef,\n} from "@reactorjet/workforce-contracts";\n`;
    expect(findImportViolations("synthetic-multiline", syntheticMultiline)).toEqual([
      'synthetic-multiline: file text references banned identifier "AssignmentRef"',
    ]);

    const syntheticPath = `import { agentInstanceRef } from "../../contracts/src/agent-instance/index.js";\n`;
    const pathViolations = findImportViolations("synthetic-path", syntheticPath);
    expect(pathViolations).toContain(
      'synthetic-path: imports from path "../../contracts/src/agent-instance/index.js" (contains "agent-instance")',
    );
    expect(pathViolations).toContain(
      'synthetic-path: file text references banned identifier "agentInstanceRef"',
    );
  });

  it("self-check: the detector does not flag an unrelated import (no false positive)", () => {
    const clean = `import { executionPermit, type ExecutionPermit } from "@reactorjet/workforce-contracts";\n`;
    expect(findImportViolations("clean", clean)).toEqual([]);
  });

  it("self-check: the detector catches a namespace import used via property access (bypass: not a named import)", () => {
    const synthetic = `import * as wc from "@reactorjet/workforce-contracts";\nexport type M = wc.AgentMessage;\n`;
    expect(findImportViolations("synthetic-namespace", synthetic)).toContain(
      'synthetic-namespace: file text references banned identifier "AgentMessage"',
    );
  });

  it("self-check: the detector catches a type-only re-export (bypass: not an `import` statement at all)", () => {
    const synthetic = `export type { AgentMessage } from "@reactorjet/workforce-contracts";\n`;
    expect(findImportViolations("synthetic-reexport", synthetic)).toContain(
      'synthetic-reexport: file text references banned identifier "AgentMessage"',
    );
  });

  it("self-check: the detector catches an inline `import(...)` type expression (bypass: no `import ... from` clause)", () => {
    const synthetic = `type M = import("@reactorjet/workforce-contracts").AgentMessage;\n`;
    expect(findImportViolations("synthetic-inline-import", synthetic)).toContain(
      'synthetic-inline-import: file text references banned identifier "AgentMessage"',
    );
  });

  it("no file under packages/permit-compiler/src or packages/authority-runtime/src imports AgentInstanceRef/AssignmentRef/AgentMessage, by path or by name", () => {
    const violations = WATCHED_DIRS.flatMap((dir) =>
      listSourceFiles(dir).flatMap((file) => findImportViolations(file, readFileSync(file, "utf8"))),
    );
    expect(violations).toEqual([]);
  });
});
