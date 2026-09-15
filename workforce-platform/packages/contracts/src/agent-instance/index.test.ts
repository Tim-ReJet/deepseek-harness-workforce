import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentInstanceRef,
  assignmentRef,
  agentMessage,
  DISALLOWED_AUTHORITY_FIELDS,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(here, "..", "..", "fixtures", name), "utf8"));
}

const agentInstanceRefFixture = loadFixture("agent-instance-ref.json");
const assignmentRefFixture = loadFixture("assignment-ref.json");
const agentMessageFixture = loadFixture("agent-message.json");

describe("agentInstanceRef", () => {
  it("round-trips the fixture", () => {
    expect(agentInstanceRef.safeParse(agentInstanceRefFixture).success).toBe(true);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const parsed = agentInstanceRef.parse(agentInstanceRefFixture);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(agentInstanceRef.safeParse(roundTripped).success).toBe(true);
    expect(roundTripped).toEqual(parsed);
  });

  it("rejects an unknown top-level key", () => {
    const malformed = { ...(agentInstanceRefFixture as object), unknownField: "nope" };
    expect(agentInstanceRef.safeParse(malformed).success).toBe(false);
  });

  it("rejects a missing instanceId", () => {
    const { instanceId: _drop, ...rest } = agentInstanceRefFixture as Record<string, unknown>;
    expect(agentInstanceRef.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing generation", () => {
    const { generation: _drop, ...rest } = agentInstanceRefFixture as Record<string, unknown>;
    expect(agentInstanceRef.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing activatedAt", () => {
    const { activatedAt: _drop, ...rest } = agentInstanceRefFixture as Record<string, unknown>;
    expect(agentInstanceRef.safeParse(rest).success).toBe(false);
  });

  it("rejects a principal that is not kind 'agent'", () => {
    const fixture = agentInstanceRefFixture as { principal: Record<string, unknown> };
    const malformed = {
      ...fixture,
      principal: { ...fixture.principal, kind: "human" },
    };
    expect(agentInstanceRef.safeParse(malformed).success).toBe(false);
  });

  it("rejects a non-integer generation", () => {
    const malformed = { ...(agentInstanceRefFixture as object), generation: 1.5 };
    expect(agentInstanceRef.safeParse(malformed).success).toBe(false);
  });

  it("rejects a negative generation", () => {
    const malformed = { ...(agentInstanceRefFixture as object), generation: -1 };
    expect(agentInstanceRef.safeParse(malformed).success).toBe(false);
  });

  it("carries no capability/effect/grant-shaped field", () => {
    const parsed = agentInstanceRef.parse(agentInstanceRefFixture);
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(parsed)).not.toContain(forbidden);
    }
  });

  it("schema shape (not just the fixture) carries no capability/effect/grant-shaped field, including optional ones", () => {
    // Object.keys(parsed) only sees keys present in a *specific* fixture —
    // an optional field like `permit?: z.string()` added to the schema
    // would not show up there unless the fixture also sets it. Asserting
    // against the Zod schema's own `.shape` catches an optional
    // authority-shaped field the moment it's added to the schema,
    // regardless of what any fixture happens to populate.
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(agentInstanceRef.shape)).not.toContain(forbidden);
    }
  });
});

describe("assignmentRef", () => {
  it("round-trips the fixture", () => {
    expect(assignmentRef.safeParse(assignmentRefFixture).success).toBe(true);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const parsed = assignmentRef.parse(assignmentRefFixture);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(assignmentRef.safeParse(roundTripped).success).toBe(true);
    expect(roundTripped).toEqual(parsed);
  });

  it("rejects an unknown top-level key", () => {
    const malformed = { ...(assignmentRefFixture as object), unknownField: "nope" };
    expect(assignmentRef.safeParse(malformed).success).toBe(false);
  });

  it("rejects a missing agentInstance", () => {
    const { agentInstance: _drop, ...rest } = assignmentRefFixture as Record<string, unknown>;
    expect(assignmentRef.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing workOrderId", () => {
    const { workOrderId: _drop, ...rest } = assignmentRefFixture as Record<string, unknown>;
    expect(assignmentRef.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing taskCorrelationId", () => {
    const { taskCorrelationId: _drop, ...rest } = assignmentRefFixture as Record<string, unknown>;
    expect(assignmentRef.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const malformed = { ...(assignmentRefFixture as object), status: "paused" };
    expect(assignmentRef.safeParse(malformed).success).toBe(false);
  });

  it("accepts every valid status value", () => {
    for (const status of ["active", "completed", "revoked"] as const) {
      const candidate = { ...(assignmentRefFixture as object), status };
      expect(assignmentRef.safeParse(candidate).success).toBe(true);
    }
  });

  it("detects 'same instance, new generation, assignment still active' without losing assignment identity", () => {
    const parsed = assignmentRef.parse(assignmentRefFixture);
    const restarted = assignmentRef.parse({
      ...parsed,
      agentInstance: {
        ...parsed.agentInstance,
        generation: parsed.agentInstance.generation + 1,
        activatedAt: "2026-09-07T09:00:00Z",
      },
    });
    // Same persistent instance, new generation, same assignment, still active.
    expect(restarted.agentInstance.instanceId).toBe(parsed.agentInstance.instanceId);
    expect(restarted.agentInstance.generation).toBeGreaterThan(parsed.agentInstance.generation);
    expect(restarted.assignmentId).toBe(parsed.assignmentId);
    expect(restarted.status).toBe("active");
  });

  it("carries no capability/effect/grant-shaped field", () => {
    const parsed = assignmentRef.parse(assignmentRefFixture);
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(parsed)).not.toContain(forbidden);
    }
  });

  it("schema shape (not just the fixture) carries no capability/effect/grant-shaped field, including optional ones", () => {
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(assignmentRef.shape)).not.toContain(forbidden);
    }
  });
});

describe("agentMessage", () => {
  it("round-trips the fixture", () => {
    expect(agentMessage.safeParse(agentMessageFixture).success).toBe(true);
  });

  it("round-trips through JSON.stringify/parse", () => {
    const parsed = agentMessage.parse(agentMessageFixture);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(agentMessage.safeParse(roundTripped).success).toBe(true);
    expect(roundTripped).toEqual(parsed);
  });

  it("rejects an unknown top-level key", () => {
    const malformed = { ...(agentMessageFixture as object), unknownField: "nope" };
    expect(agentMessage.safeParse(malformed).success).toBe(false);
  });

  it("rejects a missing sender", () => {
    const { sender: _drop, ...rest } = agentMessageFixture as Record<string, unknown>;
    expect(agentMessage.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing recipient", () => {
    const { recipient: _drop, ...rest } = agentMessageFixture as Record<string, unknown>;
    expect(agentMessage.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing threadId", () => {
    const { threadId: _drop, ...rest } = agentMessageFixture as Record<string, unknown>;
    expect(agentMessage.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid deliveryStatus", () => {
    const malformed = { ...(agentMessageFixture as object), deliveryStatus: "sent" };
    expect(agentMessage.safeParse(malformed).success).toBe(false);
  });

  it("accepts every valid deliveryStatus value", () => {
    for (const deliveryStatus of ["pending", "delivered", "read", "failed"] as const) {
      const candidate = { ...(agentMessageFixture as object), deliveryStatus };
      expect(agentMessage.safeParse(candidate).success).toBe(true);
    }
  });

  it("accepts an empty permittedPayloadRefs array", () => {
    const candidate = { ...(agentMessageFixture as object), permittedPayloadRefs: [] };
    expect(agentMessage.safeParse(candidate).success).toBe(true);
  });

  it("rejects a malformed payload ref (missing digest)", () => {
    const candidate = {
      ...(agentMessageFixture as object),
      permittedPayloadRefs: [{ mediaType: "application/json" }],
    };
    expect(agentMessage.safeParse(candidate).success).toBe(false);
  });

  it("carries no capability/effect/grant-shaped field at the top level or on either agentInstanceRef", () => {
    const parsed = agentMessage.parse(agentMessageFixture);
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(parsed)).not.toContain(forbidden);
      expect(Object.keys(parsed.sender)).not.toContain(forbidden);
      expect(Object.keys(parsed.recipient)).not.toContain(forbidden);
    }
    // Explicit per D-31/ADR-026: no permit field of any kind.
    expect(parsed).not.toHaveProperty("permit");
    expect(parsed).not.toHaveProperty("permitRef");
  });

  it("schema shape (not just the fixture) carries no capability/effect/grant-shaped field at the top level or on either agentInstanceRef, including optional ones", () => {
    for (const forbidden of DISALLOWED_AUTHORITY_FIELDS) {
      expect(Object.keys(agentMessage.shape)).not.toContain(forbidden);
      expect(Object.keys(agentMessage.shape.sender.shape)).not.toContain(forbidden);
      expect(Object.keys(agentMessage.shape.recipient.shape)).not.toContain(forbidden);
    }
  });
});
