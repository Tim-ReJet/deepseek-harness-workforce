/**
 * digest.ts — content digest primitives, RFC 8785 JCS canonicalization, and
 * the artifact-level digest helpers (CONTRACT-002).
 *
 * V2 canonicalization is RFC 8785 (JSON Canonicalization Scheme), delegated
 * to the `canonicalize` package — the reference implementation the RFC
 * itself points to. This is a *distinct, non-interchangeable* algorithm from
 * `workorder/v1`'s home-grown canonicalizer in
 * `packages/workorder-protocol/src/hash.ts`: V1 stays frozen on its own
 * serializer (compatibility floor); V2 artifacts are never hashed with V1's
 * algorithm and vice versa. Both share the same core property — identical
 * semantic objects (any key insertion order) hash identically — but the two
 * are not bit-compatible and a V1 hash must never be compared against a V2
 * digest.
 */
import { z } from "zod";
import { createHash } from "node:crypto";
import * as canonicalizeModule from "canonicalize";

// canonicalize@2 is a CommonJS module whose `.d.ts` declares `export default`.
// Under `moduleResolution: bundler` the default import is the function; under
// NodeNext (biro, the DSH fork's node-next types gate) the same import types as
// `{ default: fn }` and TS2349 fires. Selecting at runtime keeps one source
// correct for every consumer of this package.
type JcsSerialize = (input: unknown) => string | undefined;
const canonicalizeJcsRaw: JcsSerialize =
  (canonicalizeModule as unknown as { default?: JcsSerialize | { default?: JcsSerialize } }).default &&
  typeof (canonicalizeModule as unknown as { default: unknown }).default === "function"
    ? ((canonicalizeModule as unknown as { default: JcsSerialize }).default)
    : (((canonicalizeModule as unknown as { default?: { default?: JcsSerialize } }).default?.default) ??
      (canonicalizeModule as unknown as JcsSerialize));

export const DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/;

/** `sha256:` followed by 64 lowercase hex characters. */
export const digest = z
  .string()
  .regex(DIGEST_REGEX, "must be sha256:<64 lowercase hex chars>");
export type Digest = `sha256:${string}`;

/**
 * The minimal by-digest reference shape used throughout the examples, e.g.
 * `workOrder: { digest: "sha256:..." }`. Locations/mediaType are not part of
 * this minimal ref — use `artifactRef` when those are needed.
 */
export const digestRef = z
  .object({
    digest,
  })
  .strict();
export type DigestRef = z.infer<typeof digestRef>;

// ---------------------------------------------------------------------------
// RFC 8785 JCS canonicalization
// ---------------------------------------------------------------------------

/**
 * Produce the RFC 8785 canonical JSON serialization of a JSON-compatible
 * value: object keys sorted by UTF-16 code unit, arrays order-preserved,
 * numbers/strings serialized per the RFC's ECMAScript-derived rules.
 * Two values that are semantically equal (regardless of key insertion
 * order) always canonicalize to byte-identical strings — that determinism
 * is what makes the resulting digest usable as a content-addressed,
 * cross-language, cross-process commitment.
 *
 * Throws on values RFC 8785 cannot represent deterministically (`NaN`,
 * `Infinity`, lone UTF-16 surrogates, circular references) and on a
 * top-level `undefined`.
 */
const LONE_SURROGATE_ESCAPE = /(?<!\\)(?:\\\\)*\\u[dD][89a-fA-F][0-9a-fA-F]{2}/;

export function canonicalizeJcs(value: unknown): string {
  const result = canonicalizeJcsRaw(value);
  if (result === undefined) {
    throw new Error("canonicalizeJcs: value is not JSON-serializable (undefined at top level)");
  }
  // canonicalize@2 (kept on 2.x: it is plain CommonJS, so the package loads
  // from both ESM and CJS consumers — 3.x/4.x export only an `import`
  // condition) does not reject lone UTF-16 surrogates itself. RFC 8785
  // requires well-formed strings. Well-formed JSON.stringify (ES2019) is the
  // only thing that emits a `\uD800`–`\uDFFF` escape — paired surrogates and
  // every other character pass through verbatim — so an unpaired-surrogate
  // escape preceded by an even number of backslashes is a lone surrogate.
  if (LONE_SURROGATE_ESCAPE.test(result)) {
    throw new Error("canonicalizeJcs: value contains a lone UTF-16 surrogate");
  }
  return result;
}

// ---------------------------------------------------------------------------
// SHA-256 digests
// ---------------------------------------------------------------------------

/** SHA-256 of UTF-8 bytes, returned as a `sha256:<64 lowercase hex>` digest. */
export function sha256Digest(input: string | Uint8Array): Digest {
  const hash =
    typeof input === "string"
      ? createHash("sha256").update(input, "utf8")
      : createHash("sha256").update(input);
  return `sha256:${hash.digest("hex")}`;
}

/** SHA-256 digest of the RFC 8785 canonical serialization of a value. */
export function digestOfJcs(value: unknown): Digest {
  return sha256Digest(canonicalizeJcs(value));
}

// ---------------------------------------------------------------------------
// Artifact digest helpers
//
// Every hashable artifact (WorkOrder, DelegationPlan, ExecutionPermit,
// ProvisioningSpec, ValidationSpec, and the signed artifacts beyond them)
// carries its own `digest` field and, where signed, a `signature` field.
// Both are excluded from the hashed payload: a hash cannot commit to itself,
// and a signature covers the digest rather than the reverse.
// ---------------------------------------------------------------------------

/** An artifact-shaped record: JSON-compatible fields plus its own `digest`/`signature`. */
export type DigestableArtifact = Record<string, unknown> & {
  digest?: unknown;
  signature?: unknown;
};

/** Strip `digest` and `signature` — the fields no hash payload may include. */
export function withoutDigestAndSignature<T extends DigestableArtifact>(
  artifact: T,
): Omit<T, "digest" | "signature"> {
  const { digest: _digest, signature: _signature, ...rest } = artifact;
  return rest;
}

/**
 * Compute the `digest` field for a WorkOrder or Workforce artifact: the
 * SHA-256/JCS digest of every field except `digest` and `signature`.
 */
export function computeArtifactDigest(artifact: DigestableArtifact): Digest {
  return digestOfJcs(withoutDigestAndSignature(artifact));
}

/** True iff `artifact.digest` equals the recomputed digest of its payload. */
export function verifyArtifactDigest(artifact: DigestableArtifact & { digest: string }): boolean {
  return artifact.digest === computeArtifactDigest(artifact);
}
