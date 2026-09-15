import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { policyDecision, policyInput } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const decisionFixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "policy-decision.json"), "utf8"),
);

describe("policyDecision", () => {
  it("round-trips the fixture", () => {
    expect(policyDecision.safeParse(decisionFixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(policyDecision.safeParse({ ...decisionFixture, unknownField: "nope" }).success).toBe(
      false,
    );
  });

  it("accepts REQUIRE_APPROVAL with a populated obligations array", () => {
    const withApproval = {
      ...decisionFixture,
      decision: "REQUIRE_APPROVAL",
      obligations: [
        {
          key: "step_up",
          description: "requires a human step-up approval before this action proceeds",
        },
      ],
    };
    expect(policyDecision.safeParse(withApproval).success).toBe(true);
  });

  it("rejects a decision value outside ALLOW|DENY|REQUIRE_APPROVAL", () => {
    expect(
      policyDecision.safeParse({ ...decisionFixture, decision: "MAYBE" }).success,
    ).toBe(false);
  });

  it("rejects a policyDigest that is not a sha256: digest", () => {
    expect(
      policyDecision.safeParse({ ...decisionFixture, policyDigest: "not-a-digest" }).success,
    ).toBe(false);
  });
});

describe("policyInput", () => {
  const fixture = {
    decisionId: "decision-01",
    principal: {
      id: "workorder-owner-01",
      kind: "agent",
      roles: ["workorder-owner"],
      attributes: { elevated: false },
    },
    resource: {
      kind: "workforce:delegation",
      id: "delegation-01",
      attributes: { tenantId: "acme" },
    },
    action: "plan",
    context: {
      tenantId: "acme",
      organisationId: "acme-org",
      environment: "staging",
      currentTime: "2026-09-07T08:00:00Z",
    },
  };

  it("round-trips a normalized-attribute request", () => {
    expect(policyInput.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(policyInput.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(false);
  });

  it("accepts optional context fields when present", () => {
    const withOptional = {
      ...fixture,
      context: {
        ...fixture.context,
        workOrderId: "wo-01",
        delegationPlanDigest:
          "sha256:8888888888888888888888888888888888888888888888888888888888888888",
        riskClass: "standard",
        budget: { currency: "USD", capMinorUnits: 2000 },
      },
    };
    expect(policyInput.safeParse(withOptional).success).toBe(true);
  });

  it("rejects a currentTime that is not RFC3339", () => {
    const bad = { ...fixture, context: { ...fixture.context, currentTime: "not-a-time" } };
    expect(policyInput.safeParse(bad).success).toBe(false);
  });
});
