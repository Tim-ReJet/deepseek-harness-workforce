/**
 * ids.ts — identifier primitives shared by every V2 artifact.
 *
 * Per the pack decision (Money uses integer minor units; time uses RFC3339
 * with offset; IDs use ULID where sortability is useful): only artifacts
 * whose example ids are ULID-shaped are typed as `ulid` here. Everything
 * else uses the generic non-empty `id` string, exactly as the pack examples
 * do (e.g. `"delegation-01"`, `"permit-01"`).
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";

/** ULID — Crockford base32, 26 chars, excludes I, L, O, U. */
export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const ulid = z
  .string()
  .regex(ULID_REGEX, "must be a valid ULID (26-char Crockford base32, uppercase)");
export type Ulid = z.infer<typeof ulid>;

/** Generic non-empty string identifier, as used by non-ULID artifact ids. */
export const id = z.string().min(1, "id must not be empty");
export type Id = z.infer<typeof id>;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_MASK = (1n << 80n) - 1n;

function random80(): bigint {
  const bytes = randomBytes(10);
  let r = 0n;
  for (const b of bytes) r = (r << 8n) | BigInt(b);
  return r;
}

// Monotonic per-process state, mirroring workorder/v1's generator so ULIDs
// minted by either package sort strictly in generation order.
let lastTimestampMs = -1;
let lastRandom = 0n;

/**
 * Generate a ULID. Ported mechanically from `@workforce/workorder-protocol`'s
 * generator (not imported — V1 stays frozen and dependency-free of V2).
 */
export function generateUlid(): string {
  let ms = Date.now();
  if (ms < lastTimestampMs) ms = lastTimestampMs;

  let r: bigint;
  if (ms === lastTimestampMs) {
    r = (lastRandom + 1n) & RANDOM_MASK;
    if (r === 0n) {
      ms = lastTimestampMs + 1;
      r = random80();
    }
  } else {
    r = random80();
  }
  lastTimestampMs = ms;
  lastRandom = r;

  let t = BigInt.asUintN(48, BigInt(ms));
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[Number(t & 31n)] + ts;
    t >>= 5n;
  }
  let rnd = "";
  for (let i = 0; i < 16; i++) {
    rnd = CROCKFORD[Number(r & 31n)] + rnd;
    r >>= 5n;
  }
  return ts + rnd;
}
