/**
 * spiffe-id.ts — a pure, fail-closed parser/validator for a narrow Workforce
 * grammar of SPIFFE IDs (`spiffe://<trust-domain>/<path>`), plus a
 * trust-domain allow-list check and a mapper onto the canonical
 * `PrincipalRef` vocabulary from `principal-ref.ts`.
 *
 * This is intentionally NOT a full SPIFFE ABNF implementation. It covers
 * Workforce's own ID shapes (`system/<name>`,
 * `tenant/<tenantId>/cell/<cellId>/generation/<n>`) as optional typed
 * decompositions of an otherwise-opaque path, and rejects anything
 * ambiguous rather than guessing at spec conformance (no throw — every
 * entry point returns a discriminated `{ ok: true; value } | { ok: false;
 * reason }` result).
 *
 * No I/O, no SPIRE client, no network — pure string parsing only.
 */
import { principalRef, type PrincipalRef } from "./principal-ref.js";

// ---------------------------------------------------------------------------
// Grammar limits (narrow Workforce subset, not full SPIFFE spec)
// ---------------------------------------------------------------------------

const SCHEME = "spiffe://";
/** RFC 1035-style DNS label: lowercase letters/digits, hyphens not at either end. */
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
/** Path segment: lowercase letters/digits/hyphen/underscore/dot, non-empty. */
const PATH_SEGMENT = /^[a-z0-9_.-]+$/;

const MAX_TRUST_DOMAIN_LENGTH = 255;
const MAX_PATH_LENGTH = 2048;
const MAX_SEGMENT_LENGTH = 255;

// ---------------------------------------------------------------------------
// Parsed shape
// ---------------------------------------------------------------------------

export type SpiffeIdPathKind = "system" | "cell-workload" | "opaque";

/** A successfully parsed SPIFFE ID, decomposed where the path shape is recognized. */
export interface ParsedSpiffeId {
  /** The full, normalized SPIFFE ID string (`spiffe://<trust-domain>/<path>`). */
  readonly spiffeId: string;
  readonly trustDomain: string;
  /** The path with no leading slash, e.g. `system/foo` or `tenant/t1/cell/c1/generation/3`. */
  readonly path: string;
  readonly segments: readonly string[];
  readonly kind: SpiffeIdPathKind;
  /** Present only when `kind === "system"`. */
  readonly systemName?: string;
  /** Present only when `kind === "cell-workload"`. */
  readonly tenantId?: string;
  /** Present only when `kind === "cell-workload"`. */
  readonly cellId?: string;
  /** Present only when `kind === "cell-workload"`. */
  readonly generation?: number;
}

export type SpiffeIdParseRejectionReason =
  | "missing-scheme"
  | "empty-trust-domain"
  | "invalid-trust-domain"
  | "trust-domain-too-long"
  | "missing-path"
  | "path-too-long"
  | "empty-segment"
  | "segment-too-long"
  | "invalid-segment"
  | "path-traversal";

export interface SpiffeIdParseRejection {
  readonly ok: false;
  readonly reason: SpiffeIdParseRejectionReason;
}

export interface SpiffeIdParseSuccess {
  readonly ok: true;
  readonly value: ParsedSpiffeId;
}

export type SpiffeIdParseResult = SpiffeIdParseSuccess | SpiffeIdParseRejection;

function reject(reason: SpiffeIdParseRejectionReason): SpiffeIdParseRejection {
  return { ok: false, reason };
}

/**
 * Parse a SPIFFE ID string against Workforce's narrow grammar. Fails closed
 * (returns a typed rejection, never throws) on anything ambiguous: mixed
 * case, empty segments, `.`/`..` traversal segments, missing scheme, or
 * length overruns.
 */
export function parseSpiffeId(input: string): SpiffeIdParseResult {
  if (typeof input !== "string" || !input.startsWith(SCHEME)) {
    return reject("missing-scheme");
  }

  const rest = input.slice(SCHEME.length);
  const slashIndex = rest.indexOf("/");
  const trustDomain = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  const rawPath = slashIndex === -1 ? "" : rest.slice(slashIndex + 1);

  if (trustDomain.length === 0) {
    return reject("empty-trust-domain");
  }
  if (trustDomain.length > MAX_TRUST_DOMAIN_LENGTH) {
    return reject("trust-domain-too-long");
  }
  if (!DNS_LABEL.test(trustDomain) && !isDottedDnsName(trustDomain)) {
    return reject("invalid-trust-domain");
  }

  if (rawPath.length === 0) {
    return reject("missing-path");
  }
  if (rawPath.length > MAX_PATH_LENGTH) {
    return reject("path-too-long");
  }

  const segments = rawPath.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      return reject("empty-segment");
    }
    if (segment === "." || segment === "..") {
      return reject("path-traversal");
    }
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return reject("segment-too-long");
    }
    if (!PATH_SEGMENT.test(segment)) {
      return reject("invalid-segment");
    }
  }

  const decomposition = decomposePath(segments);
  const value: ParsedSpiffeId = {
    spiffeId: `${SCHEME}${trustDomain}/${rawPath}`,
    trustDomain,
    path: rawPath,
    segments,
    ...decomposition,
  };
  return { ok: true, value };
}

/** A dotted DNS name: each `.`-separated label must itself be a valid DNS label. */
function isDottedDnsName(candidate: string): boolean {
  if (!candidate.includes(".")) {
    return false;
  }
  const labels = candidate.split(".");
  return labels.every((label) => DNS_LABEL.test(label));
}

function decomposePath(
  segments: readonly string[],
):
  | { kind: "system"; systemName: string }
  | { kind: "cell-workload"; tenantId: string; cellId: string; generation: number }
  | { kind: "opaque" } {
  if (segments.length === 2 && segments[0] === "system") {
    return { kind: "system", systemName: segments[1] };
  }
  if (
    segments.length === 6 &&
    segments[0] === "tenant" &&
    segments[2] === "cell" &&
    segments[4] === "generation" &&
    /^[0-9]+$/.test(segments[5])
  ) {
    return {
      kind: "cell-workload",
      tenantId: segments[1],
      cellId: segments[3],
      generation: Number.parseInt(segments[5], 10),
    };
  }
  return { kind: "opaque" };
}

// ---------------------------------------------------------------------------
// Trust-domain allow-list
// ---------------------------------------------------------------------------

/**
 * Pure allow-list check: is `trustDomain` one of `allowed`? Exact string
 * match only (no wildcards, no suffix matching) so a staging trust domain
 * never satisfies a production allow-list by accident.
 */
export function isTrustDomainAllowed(trustDomain: string, allowed: readonly string[]): boolean {
  return allowed.includes(trustDomain);
}

// ---------------------------------------------------------------------------
// mapSpiffeIdToPrincipalRef
// ---------------------------------------------------------------------------

/**
 * Map a successfully parsed SPIFFE ID onto the canonical `PrincipalRef`
 * vocabulary: `kind: "workload"`, `issuer` is `spiffe://<trust-domain>`,
 * `id` and `externalSubject` are both the full SPIFFE ID string. Pure — no
 * I/O, no SVID verification; the caller is responsible for having already
 * authenticated the SVID this ID came from.
 */
export function mapSpiffeIdToPrincipalRef(parsed: ParsedSpiffeId): PrincipalRef {
  return principalRef.parse({
    id: parsed.spiffeId,
    kind: "workload",
    issuer: `${SCHEME}${parsed.trustDomain}`,
    externalSubject: parsed.spiffeId,
  });
}
