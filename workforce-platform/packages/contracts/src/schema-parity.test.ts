/**
 * schema-parity.test.ts — Zod is canonical; JSON Schema under schemas/ is
 * generated. This test regenerates in-memory from the same Zod schemas the
 * generator script uses and diffs against the committed files, so the two
 * can never silently drift into two conflicting sources of truth.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAll, SCHEMAS_DIR } from "../scripts/generate-json-schema.js";

const here = dirname(fileURLToPath(import.meta.url));
void here;

describe("JSON Schema parity", () => {
  const generated = generateAll();

  it("has a generated file for every committed schema file, and vice versa", () => {
    const committedFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith(".json")).sort();
    const generatedFiles = Object.keys(generated).sort();
    expect(generatedFiles).toEqual(committedFiles);
  });

  it.each(Object.keys(generated))("%s matches the committed file byte-for-byte", (file) => {
    const committed = readFileSync(join(SCHEMAS_DIR, file), "utf8");
    const regenerated = JSON.stringify(generated[file], null, 2) + "\n";
    expect(regenerated).toBe(committed);
  });
});
