/**
 * events.ts — the WorkOrderEvent discriminated union: the lifecycle milestones
 * that stream back across the seam.
 *
 * Invariants encoded here:
 *  - Every event carries a **mandatory, non-empty `narrative`** (Section 4's
 *    banned-vocabulary rule as a schema obligation — no silent milestones).
 *  - Every event carries a monotonic `seq` (strict-increase is enforced by the
 *    state-machine reducer, not the schema).
 *  - A PLANNED event's embedded plan must carry a `planHash` that matches its
 *    own canonical content (self-consistency of the commitment).
 */

import { z } from "zod";
import {
  ulid,
  hashHex,
  isoDateTime,
  mutationTier,
  riskTier,
  minorUnits,
} from "./common.js";
import { approvalToken } from "./approval.js";
import { computePlanHash } from "./hash.js";

// ---------------------------------------------------------------------------
// Plan (payload of the PLANNED event)
// ---------------------------------------------------------------------------

/** A single planned mutation, tier-classified for the PLANNED gate. */
export const planChange = z.object({
  stepId: z.string().min(1),
  /** Human-readable description of what this step does. */
  description: z.string().min(1),
  /** Mutation tier — drives approval requirements and step ordering. */
  tier: mutationTier,
  /** Adapter that will execute the step (e.g. "@workforce/oss-adapters/vercel"). */
  adapterId: z.string().min(1).optional(),
  /** Resource this step targets, if known at plan time. */
  resourceRef: z.string().min(1).optional(),
  /** Per-step cost estimate in minor units. */
  estimatedCostMinorUnits: minorUnits.optional(),
});
export type PlanChange = z.infer<typeof planChange>;

export const plan = z
  .object({
    /** One-line summary rendered on the plan card. */
    summary: z.string().min(1),
    /** The ordered list of mutations (irreversible steps must be sequenced last). */
    changes: z.array(planChange).min(1),
    /** Total estimated cost in minor units. */
    estimatedCostMinorUnits: minorUnits,
    /**
     * Whether this plan requires an approval token before APPLYING. True iff it
     * contains an irreversible step or exceeds the budget lease. Redundant with
     * the tier analysis on purpose: the flag is what the UI reads, the tiers are
     * what the guard enforces.
     */
    requiresApproval: z.boolean(),
    /** Canonical hash of this plan (excluding this field). The commitment key. */
    planHash: hashHex,
    /** Coarse risk classification. */
    riskTier,
  })
  .superRefine((p, ctx) => {
    // The embedded planHash must match the plan's canonical content.
    const expected = computePlanHash(p as unknown as Record<string, unknown> & { planHash: string });
    if (p.planHash !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["planHash"],
        message: `planHash does not match canonical plan content (expected ${expected})`,
      });
    }
    // Belt-and-suspenders: an irreversible step must force requiresApproval.
    const hasIrreversible = p.changes.some((c) => c.tier === "irreversible");
    if (hasIrreversible && !p.requiresApproval) {
      ctx.addIssue({
        code: "custom",
        path: ["requiresApproval"],
        message: "a plan containing an irreversible step must set requiresApproval=true",
      });
    }
  });
export type Plan = z.infer<typeof plan>;

// ---------------------------------------------------------------------------
// Step evidence (payload of APPLIED, and the per-step evidence in the bundle)
// ---------------------------------------------------------------------------

export const STEP_STATUSES = [
  "applied",
  "verified",
  "compensated",
  "failed",
] as const;

/** Evidence for a single executed (or compensated) step. */
export const stepEvidence = z.object({
  stepId: z.string().min(1),
  adapterId: z.string().min(1).optional(),
  tier: mutationTier,
  status: z.enum(STEP_STATUSES),
  /** Content-addressed hashes of artifacts (logs, scans, screenshots). */
  artifactHashes: z.array(hashHex),
  /** Actual cost committed by this step, in minor units. */
  costMinorUnits: minorUnits.optional(),
  startedAt: isoDateTime.optional(),
  finishedAt: isoDateTime.optional(),
  /** Structured, adapter-specific output (URLs, resource ids, etc.). */
  output: z.record(z.string(), z.unknown()).optional(),
});
export type StepEvidence = z.infer<typeof stepEvidence>;

// ---------------------------------------------------------------------------
// The event union
// ---------------------------------------------------------------------------

/** Fields common to every milestone event. */
const eventBase = z.object({
  workOrderId: ulid,
  /** Monotonic sequence number within a WorkOrder (strict increase enforced by reducer). */
  seq: z.number().int().nonnegative(),
  ts: isoDateTime,
  /** MANDATORY human-readable narrative. Never optional, never empty. */
  narrative: z.string().min(1, "every event must carry a non-empty narrative"),
});

const errorPayload = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

/** All milestone event type tags. `APPLIED` is an event but not a lifecycle state. */
export const EVENT_TYPES = [
  "RECEIVED",
  "PLANNED",
  "APPROVED",
  "REJECTED",
  "APPLYING",
  "APPLIED",
  "VERIFYING",
  "VERIFIED",
  "FAILED",
  "COMPENSATION_ISSUED",
  "COMPENSATION_CONFIRMED",
  "ROLLED_BACK",
  "COMPLETED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const workOrderEvent = z.discriminatedUnion("type", [
  eventBase.extend({ type: z.literal("RECEIVED") }),
  eventBase.extend({ type: z.literal("PLANNED"), plan }),
  eventBase.extend({ type: z.literal("APPROVED"), approvalToken }),
  eventBase.extend({ type: z.literal("REJECTED"), reason: z.string().min(1) }),
  eventBase.extend({ type: z.literal("APPLYING"), stepId: z.string().min(1).optional() }),
  eventBase.extend({ type: z.literal("APPLIED"), step: stepEvidence }),
  eventBase.extend({ type: z.literal("VERIFYING"), stepId: z.string().min(1).optional() }),
  eventBase.extend({ type: z.literal("VERIFIED") }),
  eventBase.extend({ type: z.literal("FAILED"), error: errorPayload }),
  eventBase.extend({
    type: z.literal("COMPENSATION_ISSUED"),
    /** Steps for which compensation has been issued (but not yet confirmed). */
    stepIds: z.array(z.string().min(1)),
  }),
  eventBase.extend({
    type: z.literal("COMPENSATION_CONFIRMED"),
    /** Steps whose compensation has been independently verified as settled. */
    stepIds: z.array(z.string().min(1)),
  }),
  eventBase.extend({ type: z.literal("ROLLED_BACK") }),
  eventBase.extend({ type: z.literal("COMPLETED") }),
]);

export type WorkOrderEvent = z.infer<typeof workOrderEvent>;

/**
 * Parse and validate an unknown value as a WorkOrderEvent.
 * Throws a ZodError if validation fails.
 */
export function parseEvent(input: unknown): WorkOrderEvent {
  return workOrderEvent.parse(input);
}

/**
 * Safely parse an unknown value as a WorkOrderEvent using Zod's safeParse.
 */
export function safeParseEvent(input: unknown): { success: boolean; data?: WorkOrderEvent; error?: z.ZodError } {
  const result = workOrderEvent.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
