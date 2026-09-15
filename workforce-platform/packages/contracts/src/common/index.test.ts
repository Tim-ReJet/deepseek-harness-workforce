import { describe, expect, it } from "vitest";
import { ulid, id, generateUlid } from "./ids.js";
import { rfc3339 } from "./time.js";
import { digest, digestRef } from "./digest.js";
import { money, budget } from "./money.js";
import { identity } from "./identity.js";
import { verdict } from "./verdict.js";

describe("common primitives", () => {
  it("ulid accepts a generated ulid and rejects garbage", () => {
    expect(ulid.safeParse(generateUlid()).success).toBe(true);
    expect(ulid.safeParse("not-a-ulid").success).toBe(false);
    expect(ulid.safeParse("01jabcdef0123456789abcdefg").success).toBe(false); // lowercase
  });

  it("id accepts any non-empty string and rejects empty", () => {
    expect(id.safeParse("permit-01").success).toBe(true);
    expect(id.safeParse("").success).toBe(false);
  });

  it("rfc3339 requires an explicit offset", () => {
    expect(rfc3339.safeParse("2026-08-29T12:00:00Z").success).toBe(true);
    expect(rfc3339.safeParse("2026-08-29T12:00:00+02:00").success).toBe(true);
    expect(rfc3339.safeParse("2026-08-29T12:00:00").success).toBe(false); // no offset
    expect(rfc3339.safeParse("2026-08-29").success).toBe(false);
  });

  it("digest requires sha256: prefix and 64 lowercase hex chars", () => {
    expect(digest.safeParse("sha256:" + "0".repeat(64)).success).toBe(true);
    expect(digest.safeParse("sha256:" + "0".repeat(63)).success).toBe(false);
    expect(digest.safeParse("sha256:" + "A".repeat(64)).success).toBe(false); // uppercase
    expect(digest.safeParse("md5:" + "0".repeat(64)).success).toBe(false);
  });

  it("digestRef rejects extra keys (it is the minimal by-digest ref shape)", () => {
    const valid = { digest: "sha256:" + "1".repeat(64) };
    expect(digestRef.safeParse(valid).success).toBe(true);
    expect(digestRef.safeParse({ ...valid, mediaType: "application/json" }).success).toBe(false);
  });

  it("money and budget are integer minor units, never floats", () => {
    expect(money.safeParse({ currency: "USD", amountMinorUnits: 150 }).success).toBe(true);
    expect(money.safeParse({ currency: "USD", amountMinorUnits: 1.5 }).success).toBe(false);
    expect(budget.safeParse({ currency: "USD", capMinorUnits: 2000 }).success).toBe(true);
    expect(budget.safeParse({ currency: "USD", capMinorUnits: -1 }).success).toBe(false);
  });

  it("identity requires a kind from the known set", () => {
    expect(
      identity.safeParse({ id: "user-tim", kind: "human", issuer: "https://auth.example.com" })
        .success,
    ).toBe(true);
    expect(
      identity.safeParse({ id: "x", kind: "robot", issuer: "https://auth.example.com" }).success,
    ).toBe(false);
  });

  it("verdict is exactly PASS/FAIL/INDETERMINATE", () => {
    expect(verdict.options).toEqual(["PASS", "FAIL", "INDETERMINATE"]);
  });
});
