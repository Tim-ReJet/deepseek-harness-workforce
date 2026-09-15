import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { operationEnvelope } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "operation-envelope.json"), "utf8"),
);

describe("operationEnvelope", () => {
  it("round-trips the fixture", () => {
    expect(operationEnvelope.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(operationEnvelope.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("tolerates a fixture without the optional effectPermit", () => {
    const { effectPermit: _omit, ...rest } = fixture;
    expect(operationEnvelope.safeParse(rest).success).toBe(true);
  });

  it("accepts a fixture with a step-up effectPermit present", () => {
    expect(
      operationEnvelope.safeParse({
        ...fixture,
        effectPermit: {
          digest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an empty idempotencyKey", () => {
    expect(operationEnvelope.safeParse({ ...fixture, idempotencyKey: "" }).success).toBe(false);
  });

  it("rejects an empty workloadIdentity", () => {
    expect(operationEnvelope.safeParse({ ...fixture, workloadIdentity: "" }).success).toBe(false);
  });

  it("rejects a negative cellGeneration", () => {
    expect(operationEnvelope.safeParse({ ...fixture, cellGeneration: -1 }).success).toBe(false);
  });

  it("rejects a non-integer cellGeneration", () => {
    expect(operationEnvelope.safeParse({ ...fixture, cellGeneration: 1.5 }).success).toBe(false);
  });

  it("rejects a malformed expiresAt", () => {
    expect(
      operationEnvelope.safeParse({ ...fixture, expiresAt: "not-a-timestamp" }).success,
    ).toBe(false);
  });

  it("rejects a malformed digest", () => {
    expect(operationEnvelope.safeParse({ ...fixture, digest: "not-a-digest" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown key on effectIntent digestRef", () => {
    expect(
      operationEnvelope.safeParse({
        ...fixture,
        effectIntent: { ...fixture.effectIntent, extra: "nope" },
      }).success,
    ).toBe(false);
  });
});
