/**
 * workforce.policy-decision/v1 — the canonical policy input/decision shapes
 * (plan 12 "Canonical policy input" / "Canonical decision result"). Cerbos
 * decides policy; it does not enforce anything (Invariant 9), so this
 * module only defines the request/result contract a `PolicyProvider`
 * exchanges — never a permit, capability grant, or enforcement side effect.
 *
 * `PolicyInput` is the request shape: normalized attributes and content
 * digests only (ADR-028 §7) — never raw prompts, secret values, unbounded
 * model output, or large evidence payloads.
 *
 * `PolicyDecision` is the result shape and the one canonical, schema-tagged
 * artifact in this module (mirrors execution-permit/index.ts's structure:
 * schema literal + Zod export + inferred type). `decision` is
 * `ALLOW | DENY | REQUIRE_APPROVAL`; Cerbos itself only ever returns
 * allow/deny — `REQUIRE_APPROVAL` is a Workforce-side interpretation
 * layered on top by the provider that produces this shape (plan 12: "Cerbos
 * natively returns allow/deny. REQUIRE_APPROVAL is a Workforce
 * interpretation."), never invented independent of what Cerbos reported for
 * that call (Invariant 14 — a DENY is never converted into ALLOW or
 * REQUIRE_APPROVAL).
 *
 * `PolicyInput` is not itself signed or digested — it is not registered in
 * `scripts/generate-json-schema.ts` / `ARTIFACT_SCHEMAS` / conformance,
 * the same convention `action-intent/index.ts` documents for
 * runtime/session-boundary shapes that aren't persisted top-level
 * artifacts. `PolicyDecision` *is* registered there: `ExecutionPermit`
 * carries a `policyDecisionDigest` reference to it (AUTH-001, out of scope
 * here), so its shape must be stable and digestable.
 */
import { z } from "zod";
import { digest } from "../common/digest.js";
import { rfc3339 } from "../common/time.js";

export const POLICY_DECISION_SCHEMA = "workforce.policy-decision/v1" as const;

// ── PolicyInput ──────────────────────────────────────────────────────────

const policyPrincipal = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    roles: z.array(z.string().min(1)),
    attributes: z.record(z.string(), z.unknown()),
  })
  .strict();

const policyResource = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1),
    attributes: z.record(z.string(), z.unknown()),
  })
  .strict();

const policyContext = z
  .object({
    tenantId: z.string().min(1),
    organisationId: z.string().min(1),
    environment: z.string().min(1),
    workOrderId: z.string().min(1).optional(),
    delegationPlanDigest: digest.optional(),
    riskClass: z.string().min(1).optional(),
    /** Opaque at this layer — the caller's normalized budget shape, not re-typed here. */
    budget: z.unknown().optional(),
    currentTime: rfc3339,
  })
  .strict();

export const policyInput = z
  .object({
    decisionId: z.string().min(1),
    principal: policyPrincipal,
    resource: policyResource,
    action: z.string().min(1),
    context: policyContext,
  })
  .strict();
export type PolicyInput = z.infer<typeof policyInput>;

// ── PolicyDecision ───────────────────────────────────────────────────────

export const POLICY_DECISION_VALUES = ["ALLOW", "DENY", "REQUIRE_APPROVAL"] as const;
export const policyDecisionValue = z.enum(POLICY_DECISION_VALUES);
export type PolicyDecisionValue = z.infer<typeof policyDecisionValue>;

const policyConstraint = z
  .object({
    key: z.string().min(1),
    description: z.string().min(1),
    value: z.unknown().optional(),
  })
  .strict();

const policyObligation = z
  .object({
    key: z.string().min(1),
    description: z.string().min(1),
    value: z.unknown().optional(),
  })
  .strict();

const policyReason = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const policyDecision = z
  .object({
    schema: z.literal(POLICY_DECISION_SCHEMA),
    decision: policyDecisionValue,
    constraints: z.array(policyConstraint),
    obligations: z.array(policyObligation),
    reasons: z.array(policyReason),
    policyVersion: z.string().min(1),
    policyDigest: digest,
    cerbosCallId: z.string().min(1),
    decidedAt: rfc3339,
  })
  .strict();
export type PolicyDecision = z.infer<typeof policyDecision>;
