import { describe, expect, it } from "vitest";
import { EffectLedger, allowsAssurancePass } from "./ledger.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function reserve(ledger: EffectLedger, fence = 1) {
  return ledger.reserve({
    effectId: "effect-01",
    idempotencyKey: "key-01",
    requestDigest: DIGEST,
    ownerFence: fence,
  });
}

describe("EffectLedger", () => {
  it("fresh reserve inserts a RESERVED row", () => {
    const ledger = new EffectLedger();
    const row = reserve(ledger);
    expect(row.state).toBe("RESERVED");
    expect(ledger.getByKey("key-01")).toEqual(row);
  });

  it("idempotent replay returns the existing row without duplicating", () => {
    const ledger = new EffectLedger();
    const first = reserve(ledger, 1);
    const second = reserve(ledger, 99);
    expect(second).toBe(first);
    expect(second.ownerFence).toBe(1);
    expect(second.state).toBe("RESERVED");
  });

  it("rejects an illegal transition", () => {
    const ledger = new EffectLedger();
    reserve(ledger);
    expect(() => ledger.transition("key-01", "COMMITTED", { ownerFence: 1 })).toThrow(
      /illegal transition RESERVED -> COMMITTED/,
    );
  });

  it("rejects a stale owner fence", () => {
    const ledger = new EffectLedger();
    reserve(ledger, 5);
    expect(() => ledger.transition("key-01", "EXECUTING", { ownerFence: 4 })).toThrow(
      /stale owner fence 4 < 5/,
    );
  });

  it("UNKNOWN (and EXECUTING / COMPENSATING / COMPENSATION_FAILED) block assurance pass", () => {
    const ledger = new EffectLedger();
    reserve(ledger);
    ledger.transition("key-01", "EXECUTING", { ownerFence: 1 });
    expect(allowsAssurancePass(ledger.getByKey("key-01")!)).toBe(false);

    ledger.transition("key-01", "UNKNOWN", { ownerFence: 1 });
    expect(allowsAssurancePass(ledger.getByKey("key-01")!)).toBe(false);
  });

  it("COMMITTED and COMPENSATED allow assurance pass", () => {
    const committed = new EffectLedger();
    reserve(committed);
    committed.transition("key-01", "EXECUTING", { ownerFence: 1 });
    committed.transition("key-01", "COMMITTED", { ownerFence: 1 });
    expect(allowsAssurancePass(committed.getByKey("key-01")!)).toBe(true);

    committed.transition("key-01", "COMPENSATING", { ownerFence: 1 });
    expect(allowsAssurancePass(committed.getByKey("key-01")!)).toBe(false);
    committed.transition("key-01", "COMPENSATED", { ownerFence: 1 });
    expect(allowsAssurancePass(committed.getByKey("key-01")!)).toBe(true);
  });

  it("throws on an unknown idempotency key", () => {
    const ledger = new EffectLedger();
    expect(() => ledger.transition("missing", "EXECUTING", { ownerFence: 1 })).toThrow(
      /no row for idempotency key missing/,
    );
  });
});
