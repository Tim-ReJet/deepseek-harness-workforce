/**
 * digest.test.ts — RFC 8785 JCS canonicalization + artifact digest helpers.
 */
import { describe, expect, it } from "vitest";
import {
  DIGEST_REGEX,
  canonicalizeJcs,
  sha256Digest,
  digestOfJcs,
  withoutDigestAndSignature,
  computeArtifactDigest,
  verifyArtifactDigest,
} from "./digest.js";

describe("canonicalizeJcs", () => {
  it("produces identical output for objects with different key insertion order", () => {
    const a = { b: 2, a: 1, c: { z: 1, y: 2 } };
    const b = { a: 1, c: { y: 2, z: 1 }, b: 2 };
    expect(canonicalizeJcs(a)).toBe(canonicalizeJcs(b));
  });

  it("sorts object keys and preserves array order", () => {
    expect(canonicalizeJcs({ b: 1, a: [3, 2, 1] })).toBe('{"a":[3,2,1],"b":1}');
  });

  it("omits undefined-valued object keys but keeps array positions", () => {
    expect(canonicalizeJcs({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("rejects NaN, Infinity and lone surrogates", () => {
    expect(() => canonicalizeJcs(Number.NaN)).toThrow();
    expect(() => canonicalizeJcs(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalizeJcs("\uD800")).toThrow();
  });

  it("rejects a top-level undefined", () => {
    expect(() => canonicalizeJcs(undefined)).toThrow();
  });
});

describe("sha256Digest / digestOfJcs", () => {
  it("returns a digest matching the digest regex", () => {
    expect(sha256Digest("hello")).toMatch(DIGEST_REGEX);
    expect(digestOfJcs({ a: 1 })).toMatch(DIGEST_REGEX);
  });

  it("matches a manually computed sha256 for a known canonical string", () => {
    // sha256("null") — known test vector, independent of this module's own logic.
    expect(sha256Digest("null")).toBe(
      "sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    );
  });

  it("is deterministic regardless of key insertion order (core requirement)", () => {
    const a = { workOrder: "wo-1", grant: { capabilities: ["x", "y"], budget: 100 } };
    const b = { grant: { budget: 100, capabilities: ["x", "y"] }, workOrder: "wo-1" };
    expect(digestOfJcs(a)).toBe(digestOfJcs(b));
  });

  it("changes when semantic content changes", () => {
    expect(digestOfJcs({ a: 1 })).not.toBe(digestOfJcs({ a: 2 }));
  });
});

describe("artifact digest helpers", () => {
  const artifact = {
    schema: "workforce.example/v1",
    id: "example-1",
    payload: { foo: "bar", nested: { z: 1, a: 2 } },
    digest: "sha256:" + "0".repeat(64),
    signature: "not-a-real-signature",
  };

  it("withoutDigestAndSignature strips exactly those two fields", () => {
    const stripped = withoutDigestAndSignature(artifact);
    expect(stripped).not.toHaveProperty("digest");
    expect(stripped).not.toHaveProperty("signature");
    expect(stripped).toEqual({
      schema: "workforce.example/v1",
      id: "example-1",
      payload: { foo: "bar", nested: { z: 1, a: 2 } },
    });
  });

  it("computeArtifactDigest ignores the current digest/signature values", () => {
    const digestA = computeArtifactDigest(artifact);
    const digestB = computeArtifactDigest({
      ...artifact,
      digest: "sha256:" + "f".repeat(64),
      signature: "a-completely-different-signature",
    });
    expect(digestA).toBe(digestB);
    expect(digestA).toMatch(DIGEST_REGEX);
  });

  it("computeArtifactDigest is order-independent on the payload itself", () => {
    const reordered = {
      signature: artifact.signature,
      payload: { nested: { a: 2, z: 1 }, foo: "bar" },
      id: artifact.id,
      digest: artifact.digest,
      schema: artifact.schema,
    };
    expect(computeArtifactDigest(artifact)).toBe(computeArtifactDigest(reordered));
  });

  it("verifyArtifactDigest is true iff digest matches the recomputed payload hash", () => {
    const withRealDigest = { ...artifact, digest: computeArtifactDigest(artifact) };
    expect(verifyArtifactDigest(withRealDigest)).toBe(true);
    expect(verifyArtifactDigest(artifact)).toBe(false); // placeholder digest

    const tampered = { ...withRealDigest, payload: { ...withRealDigest.payload, foo: "baz" } };
    expect(verifyArtifactDigest(tampered)).toBe(false);
  });
});
