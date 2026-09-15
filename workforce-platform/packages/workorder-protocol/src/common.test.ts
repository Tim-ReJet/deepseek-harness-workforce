import { describe, expect, it } from "vitest";
import { generateUlid, ULID_REGEX } from "./common.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Decode the 48-bit millisecond timestamp from the first 10 chars of a ULID. */
function decodeTimestamp(ulid: string): number {
  let t = 0n;
  for (const ch of ulid.slice(0, 10)) t = (t << 5n) | BigInt(CROCKFORD.indexOf(ch));
  return Number(t);
}

describe("generateUlid", () => {
  it("produces 26-char Crockford base32 ULIDs over 10k generations", () => {
    for (let i = 0; i < 10_000; i++) {
      expect(generateUlid()).toMatch(ULID_REGEX);
    }
  });

  it("is unique over 10k generations", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => generateUlid()));
    expect(ids.size).toBe(10_000);
  });

  it("is strictly monotonic over 10k generations (same-ms increments included)", () => {
    let prev = generateUlid();
    for (let i = 0; i < 10_000; i++) {
      const next = generateUlid();
      expect(next > prev).toBe(true);
      prev = next;
    }
  });

  it("encodes the full 48-bit millisecond timestamp (no 32-bit truncation)", () => {
    const before = Date.now();
    const decoded = decodeTimestamp(generateUlid());
    const after = Date.now();
    expect(decoded).toBeGreaterThanOrEqual(before);
    expect(decoded).toBeLessThanOrEqual(after);
    // A 32-bit-truncated encoding would decode ~2^32 ms (≈49 days) behind.
    expect(decoded).toBeGreaterThan(2 ** 32);
  });

  it("sorts lexicographically in generation order across millisecond boundaries", async () => {
    const first = generateUlid();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = generateUlid();
    expect(second > first).toBe(true);
    expect(decodeTimestamp(second)).toBeGreaterThanOrEqual(decodeTimestamp(first));
  });
});
