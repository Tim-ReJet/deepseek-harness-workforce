/**
 * hash.ts — deterministic canonical serialization + hashing helpers.
 *
 * These helpers are the cryptographic floor of the `workorder/v1` seam. Two
 * properties matter and both are load-bearing:
 *
 *  1. **Determinism.** `canonicalize` produces byte-for-byte identical output
 *     for values that are semantically equal, regardless of key insertion
 *     order. This is what makes `planHash` a stable idempotency/commitment key:
 *     Biro and Workforce, running different code on different hosts, must
 *     compute the *same* hash for the *same* plan or the approval-token
 *     commitment (W2 fix) is meaningless.
 *
 *  2. **No ambient state.** Nothing here reads the clock, the environment, or a
 *     random source. A hash is a pure function of its input. (Non-deterministic
 *     hashing is the #1 foot-gun called out in the spec — it silently breaks
 *     idempotency and the audit splice.)
 *
 * Canonicalization rules (documented so both planes implement them identically):
 *  - Objects: keys sorted lexicographically (UTF-16 code-unit order, i.e. the
 *    default `Array.prototype.sort`); `undefined`-valued keys are omitted.
 *  - Arrays: order preserved (arrays are ordered data).
 *  - Strings/booleans/null: JSON encoding.
 *  - Numbers: must be finite; encoded via `JSON.stringify`. Prefer integers
 *    (e.g. minor currency units) — floating-point equality is a hashing hazard.
 *  - `bigint`, `undefined` (top level), functions, symbols: rejected.
 */

import { createHash } from "node:crypto";

/** A lowercase hex-encoded SHA-256 digest (64 chars). */
export type Sha256Hex = string;

/**
 * Produce a deterministic, canonical JSON string for a JSON-like value.
 * Throws on values that cannot be hashed deterministically.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return "null";

  const t = typeof v;

  if (t === "string") return JSON.stringify(v);
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(v as number)) {
      throw new Error("canonicalize: non-finite number cannot be hashed deterministically");
    }
    return JSON.stringify(v);
  }
  if (t === "bigint") {
    throw new Error("canonicalize: bigint is not supported; encode as a string");
  }
  if (t === "undefined") {
    throw new Error("canonicalize: undefined cannot be canonicalized");
  }
  if (t === "function" || t === "symbol") {
    throw new Error(`canonicalize: unsupported type '${t}'`);
  }

  if (Array.isArray(v)) {
    return "[" + v.map((item) => serialize(item)).join(",") + "]";
  }

  // Plain object.
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k])).join(",") +
    "}"
  );
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256Hex(input: string): Sha256Hex {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 over the canonical serialization of a value. */
export function hashObject(value: unknown): Sha256Hex {
  return sha256Hex(canonicalize(value));
}

// ---------------------------------------------------------------------------
// Plan hashing — the PLANNED-gate commitment
// ---------------------------------------------------------------------------

/**
 * Compute the canonical hash of a plan.
 *
 * The `planHash` field is *excluded* from the hash (a hash cannot commit to
 * itself). The result is what an `ApprovalToken.planHash` must equal, and what
 * a PLANNED event's embedded `plan.planHash` must equal. Re-planning after
 * approval necessarily changes this hash, which invalidates the old token — the
 * W2 "prove the executed plan is the approved plan" fix.
 */
export function computePlanHash(
  plan: Record<string, unknown> & { planHash?: string },
): Sha256Hex {
  const { planHash: _ignored, ...rest } = plan;
  return hashObject(rest);
}

/** True iff a plan's embedded `planHash` matches its canonical content. */
export function verifyPlanHash(
  plan: Record<string, unknown> & { planHash: string },
): boolean {
  return plan.planHash === computePlanHash(plan);
}

// ---------------------------------------------------------------------------
// Audit-chain hashing — the spliced hash chain across the seam
// ---------------------------------------------------------------------------

/** The fields of an audit entry that are covered by its hash. */
export interface AuditEntryCore {
  seq: number;
  ts: string;
  kind: string;
  workOrderId: string;
  /** Hash of the previous entry (or the segment genesis for the first entry). */
  prevHash: string;
  /** Content hash of the entry payload (content-addressed; blobs live elsewhere). */
  payloadHash: string;
}

/** Deterministic hash of a single audit entry. */
export function computeAuditEntryHash(entry: AuditEntryCore): Sha256Hex {
  return hashObject({
    seq: entry.seq,
    ts: entry.ts,
    kind: entry.kind,
    workOrderId: entry.workOrderId,
    prevHash: entry.prevHash,
    payloadHash: entry.payloadHash,
  });
}

export interface AuditSegmentLike {
  /** Biro's chain head at splice time — the genesis prevHash of this segment. */
  genesisPrevHash: string;
  headHash: string;
  entries: Array<AuditEntryCore & { entryHash: string }>;
}

export interface ChainVerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Verify a Workforce audit segment forms an unbroken hash chain that splices
 * onto Biro's chain head.
 *
 *  - The first entry's `prevHash` must equal `genesisPrevHash` (the splice).
 *  - Every entry's `entryHash` must equal its recomputed hash.
 *  - Every entry's `prevHash` must equal the previous entry's `entryHash`.
 *  - `headHash` must equal the last entry's `entryHash`.
 *
 * An empty segment is valid iff `headHash === genesisPrevHash`.
 */
export function verifyAuditSegment(segment: AuditSegmentLike): ChainVerifyResult {
  const { entries, genesisPrevHash, headHash } = segment;

  if (entries.length === 0) {
    return headHash === genesisPrevHash
      ? { ok: true }
      : { ok: false, error: "empty segment head must equal genesisPrevHash" };
  }

  let expectedPrev = genesisPrevHash;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prevHash !== expectedPrev) {
      return {
        ok: false,
        error: `entry ${i} (seq ${e.seq}) prevHash does not chain: expected ${expectedPrev}, got ${e.prevHash}`,
      };
    }
    const recomputed = computeAuditEntryHash(e);
    if (recomputed !== e.entryHash) {
      return {
        ok: false,
        error: `entry ${i} (seq ${e.seq}) entryHash mismatch: expected ${recomputed}, got ${e.entryHash}`,
      };
    }
    expectedPrev = e.entryHash;
  }

  if (headHash !== expectedPrev) {
    return { ok: false, error: `headHash mismatch: expected ${expectedPrev}, got ${headHash}` };
  }

  return { ok: true };
}
