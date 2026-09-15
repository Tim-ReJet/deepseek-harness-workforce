/**
 * workorder.ts — the WorkOrder: the single binding artifact that crosses the
 * Biro -> Workforce seam. Everything else in the protocol (events, evidence,
 * the audit splice) is keyed by its `id`.
 */
// CONTRACT_MIRROR_VERSION: 3
// v3 (2026-08-23): no change to this file's surface. Bumped to re-attest the
// sync after biro's mirror was found to be MISSING approvalToken.operationSetHash
// — zod strips unknown keys, so biro silently dropped the C1+ commitment and
// Workforce refused every C1+ approval. Found by biro's contract-snapshot check.

import { z } from "zod";
import {
  ulid,
  isoDateTime,
  complianceProfile,
  budgetLease,
  principalRef,
  PROTOCOL_ID,
} from "./common.js";
import { approvalToken } from "./approval.js";

export const workOrder = z.object({
  /**
   * ULID. Doubles as the Temporal workflow id: the seam's idempotency key.
   * Redelivering a WorkOrder with an id already seen must reattach to the
   * existing workflow, never start a second one.
   */
  id: ulid,

  /** Protocol tag. Literal so a v2 message is rejected by a v1 consumer. */
  protocol: z.literal(PROTOCOL_ID),

  /** Isolation tenant — the top-level boundary for policy, memory, and audit. */
  tenantId: z.string().min(1),

  /** The Biro company on whose behalf this WorkOrder is issued. */
  companyId: z.string().min(1),

  /** The Biro CEO agent identity that issued this WorkOrder. */
  issuedBy: principalRef,

  /**
   * Business-language description of the outcome the owner delegated. This is
   * intent, not a plan — Workforce turns it into a plan at the PLANNED gate.
   */
  intent: z.string().min(1, "intent must be a non-empty business-language description"),

  /** The golden path selected to satisfy the intent. */
  goldenPathId: z.string().min(1),

  /** Compliance regime the golden path must be executed under. */
  complianceProfile,

  /** Grant-time spend cap. */
  budgetLease,

  /** Golden-path parameters (typed per golden path; opaque at the protocol level). */
  inputs: z.record(z.string(), z.unknown()),

  /** Additional constraints on execution (region pins, deadlines, etc.). */
  constraints: z.record(z.string(), z.unknown()),

  /**
   * Present only after the PLANNED gate has been approved. A WorkOrder carrying
   * a token whose `planHash` does not match the current plan must not be
   * applied (see state-machine `checkApplyAuthorization`).
   */
  approvalToken: approvalToken.optional(),

  /**
   * Policy bundle carried from Biro. Maps to Cerbos policy pack names and
   * their configuration. When absent or empty, Workforce must deny all actions
   * (missing-policy → DENY).
   */
  policyBundle: z.record(z.string(), z.unknown()),

  /**
   * Reference to the architecture block graph node that backs this WorkOrder.
   * Links the WorkOrder to the architecture decision record (ADR) that was
   * approved at the PLANNED gate.
   */
  architectureRef: z.string().min(1, "architectureRef must reference an architecture block graph node"),

  /**
   * Monotonic revision number of the architecture block. Incremented each time
   * the architecture is revised after initial approval. Used to detect replanning
   * and ensure the WorkOrder carries the correct architecture version.
   */
  blockRevision: z.number().int().positive("blockRevision must be a positive integer"),

  /** When Biro issued the WorkOrder. */
  createdAt: isoDateTime,

  /**
   * Marketplace intent — deploy, list, update, or remove an agent on a marketplace.
   * Optional for backward compatibility.
   */
  marketplaceIntent: z.object({
    action: z.enum(["deploy", "list", "update", "remove"]),
    agentId: z.string().min(1),
    marketplaceId: z.string().optional(),
    listingUrl: z.string().url().optional(),
  }).optional(),

  /**
   * Billing intent — create products/prices, attribute revenue, or sync customers.
   * Optional for backward compatibility.
   */
  billingIntent: z.object({
    action: z.enum(["create_product", "create_price", "attribute_revenue", "sync_customer"]),
    provider: z.string().min(1),
    productId: z.string().optional(),
    priceId: z.string().optional(),
    customerId: z.string().optional(),
  }).optional(),
});

export type WorkOrder = z.infer<typeof workOrder>;

/**
 * Parse and validate an unknown value as a WorkOrder.
 * Throws a ZodError if validation fails.
 */
export function parseWorkOrder(input: unknown): WorkOrder {
  return workOrder.parse(input);
}

/**
 * Safely parse an unknown value as a WorkOrder using Zod's safeParse.
 * Returns a typed result with { success: true, data: WorkOrder } or
 * { success: false, error: ZodError }.
 */
export function safeParseWorkOrder(input: unknown): { success: true; data: WorkOrder } | { success: false; error: z.ZodError } {
  const result = workOrder.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
