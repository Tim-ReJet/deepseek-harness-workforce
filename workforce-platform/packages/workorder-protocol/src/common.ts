/**
 * common.ts — shared scalar schemas and small value objects used across the
 * `workorder/v1` message set. Centralized so both planes validate the same
 * primitive shapes (a ULID is a ULID everywhere; a hash is 64 lowercase hex
 * everywhere).
 */
// CONTRACT_MIRROR_VERSION: 3
// v3 (2026-08-23): no change to this file's surface. Bumped to re-attest the
// sync after biro's mirror was found to be MISSING approvalToken.operationSetHash
// — zod strips unknown keys, so biro silently dropped the C1+ commitment and
// Workforce refused every C1+ approval. Found by biro's contract-snapshot check.

import { randomBytes } from "node:crypto";
import { z } from "zod";

/** The protocol tag carried by every WorkOrder. Bump only on a breaking change. */
export const PROTOCOL_ID = "workorder/v1" as const;

/**
 * ULID — Crockford base32, 26 chars, excludes I, L, O, U.
 * A WorkOrder's ULID doubles as the Temporal workflow id (idempotency key):
 * redelivering the same ULID must be a no-op, not a second execution.
 */
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const ulid = z
  .string()
  .regex(ULID_REGEX, "must be a valid ULID (26-char Crockford base32, uppercase)");

/** Zod schema for a lowercase hex SHA-256 digest (the hashing *function* is `sha256Hex` in hash.ts). */
export const HASH_REGEX = /^[0-9a-f]{64}$/;
export const hashHex = z
  .string()
  .regex(HASH_REGEX, "must be a lowercase hex SHA-256 digest (64 chars)");

/**
 * RFC3339 / ISO-8601 timestamp with an explicit UTC 'Z' or numeric offset.
 * We require an offset so timestamps are globally comparable — a naive local
 * timestamp in an audit chain is not defensible.
 */
export const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
export const isoDateTime = z
  .string()
  .regex(ISO_DATETIME_REGEX, "must be an RFC3339 timestamp with a UTC 'Z' or numeric offset");

/** ISO-4217 currency code (3 uppercase letters). */
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO-4217 currency code");

/** A non-negative integer amount in the currency's minor units (e.g. cents). */
export const minorUnits = z
  .number()
  .int("amounts are in integer minor units")
  .nonnegative("amounts cannot be negative");

/**
 * Compliance profiles. `none` is the default; the named frameworks each compile
 * to a constraint set + gate overlay + policy-pack ref on the golden path.
 * Extensible: adding a framework is a non-breaking enum addition.
 */
export const COMPLIANCE_PROFILES = ["none", "soc2", "pci", "hipaa", "gdpr"] as const;
export const complianceProfile = z.enum(COMPLIANCE_PROFILES);
export type ComplianceProfile = z.infer<typeof complianceProfile>;

/**
 * Mutation tier of a single plan step. Drives the PLANNED gate:
 *  - reversible: undoable, cheap — auto-approvable within lease.
 *  - bounded: refundable/limited-blast — auto-approvable within lease.
 *  - irreversible: never auto-approved; must be individually consented and
 *    (per the planner constraint) sequenced last.
 */
export const MUTATION_TIERS = ["reversible", "bounded", "irreversible"] as const;
export const mutationTier = z.enum(MUTATION_TIERS);
export type MutationTier = z.infer<typeof mutationTier>;

/** Coarse risk classification of a whole plan, surfaced on the plan card. */
export const RISK_TIERS = ["low", "medium", "high", "critical"] as const;
export const riskTier = z.enum(RISK_TIERS);
export type RiskTier = z.infer<typeof riskTier>;

/** NIST CSF functions — each compliance gate maps to one. */
export const NIST_FUNCTIONS = [
  "identify",
  "protect",
  "detect",
  "respond",
  "recover",
] as const;
export const nistFunction = z.enum(NIST_FUNCTIONS);
export type NistFunction = z.infer<typeof nistFunction>;

/**
 * A reference to an agent or human principal on either plane. Structured (not a
 * bare string) so the audit chain and approval records name a stable identity.
 */
export const principalRef = z.object({
  /** Stable identity id (e.g. an Authentik subject or agent id). */
  id: z.string().min(1),
  /** What kind of principal this is. */
  kind: z.enum(["ceo-agent", "workforce-lead", "platform-lead", "human", "service"]),
  /** Which plane the principal belongs to. */
  plane: z.enum(["biro", "workforce"]).optional(),
  /** Optional human-friendly label for UIs. */
  displayName: z.string().min(1).optional(),
});
export type PrincipalRef = z.infer<typeof principalRef>;

/**
 * Budget lease — Biro's grant-time spend cap for a WorkOrder. Hard-enforced
 * in-flight by Workforce's reserve-then-commit breaker (Biro caps at grant
 * time; Workforce kills at spend time — neither trusts the other's enforcement).
 */
export const budgetLease = z.object({
  leaseId: z.string().min(1),
  currency: currencyCode,
  /** Maximum spend authorized by this lease, in minor units. */
  capMinorUnits: minorUnits,
  /** After this instant the lease is void; resumption requires a fresh lease. */
  expiresAt: isoDateTime,
});
export type BudgetLease = z.infer<typeof budgetLease>;

// ── ULID Generator ────────────────────────────────────────────────────────

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_MASK = (1n << 80n) - 1n;

/** 80 bits of CSPRNG randomness (10 bytes) as a bigint. */
function random80(): bigint {
  const bytes = randomBytes(10);
  let r = 0n;
  for (const b of bytes) r = (r << 8n) | BigInt(b);
  return r;
}

// Monotonic state (per process): ULIDs generated within the same millisecond
// increment the random component instead of re-drawing, so ids sort strictly
// in generation order even when the clock does not advance.
let lastTimestampMs = -1;
let lastRandom = 0n;

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier).
 * Crockford base32, 26 characters: 48-bit millisecond timestamp (10 chars) +
 * 80 bits of `crypto.randomBytes` randomness (16 chars). Doubles as the
 * WorkOrder idempotency key.
 *
 * Monotonic per the ULID spec: ids generated in the same millisecond
 * increment the random component, and a regressed clock never moves the
 * timestamp backwards — generation order is always lexicographic order.
 *
 * Portability: both Biro and Workforce use this same generator so ULIDs are
 * consistent across the seam. Biro generates at submission time; Workforce
 * validates against the ULID_REGEX on receipt.
 */
export function generateUlid(): string {
  let ms = Date.now();
  if (ms < lastTimestampMs) ms = lastTimestampMs;

  let r: bigint;
  if (ms === lastTimestampMs) {
    r = (lastRandom + 1n) & RANDOM_MASK;
    if (r === 0n) {
      // Random component exhausted for this millisecond (2^80 ids) — move to
      // the next tick rather than collide.
      ms = lastTimestampMs + 1;
      r = random80();
    }
  } else {
    r = random80();
  }
  lastTimestampMs = ms;
  lastRandom = r;

  // Timestamp (48 bits → 10 chars)
  let t = BigInt.asUintN(48, BigInt(ms));
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[Number(t & 31n)] + ts;
    t >>= 5n;
  }
  // Random (80 bits → 16 chars)
  let rnd = "";
  for (let i = 0; i < 16; i++) {
    rnd = CROCKFORD[Number(r & 31n)] + rnd;
    r >>= 5n;
  }
  return ts + rnd;
}
