/**
 * conformance-vectors.test.ts — wires the cross-language conformance vectors
 * under `conformance/vectors/` (see `conformance/README.md`) into `pnpm test`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { listVectors, computeVector } from "../conformance/run-fixtures.js";

describe("conformance vectors", () => {
  const vectors = listVectors();

  it("at least one vector exists", () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  it.each(vectors.map((v) => [v.name, v] as const))(
    "%s: canonical + digest match the committed fixture",
    (_name, vector) => {
      const { canonical, digest } = computeVector(vector);
      expect(canonical).toBe(readFileSync(vector.canonicalPath, "utf8"));
      expect(digest).toBe(readFileSync(vector.digestPath, "utf8").trim());
    },
  );

  it("002-key-order-a and 002-key-order-b canonicalize/hash identically", () => {
    const a = readFileSync(
      vectors.find((v) => v.name === "002-key-order-a")!.canonicalPath,
      "utf8",
    );
    const b = readFileSync(
      vectors.find((v) => v.name === "002-key-order-b")!.canonicalPath,
      "utf8",
    );
    expect(a).toBe(b);
  });
});
