/**
 * approval.ts — the ApprovalToken minted by Biro after the PLANNED gate.
 *
 * The token is a signed capability that authorizes moving a specific plan into
 * APPLYING. Its defining property (the W2 red-team fix) is that it commits to a
 * **plan hash**, not merely to a scope/tier ceiling. Workforce asserts
 * `computePlanHash(actualPlan) === token.planHash` on the APPLYING transition,
 * so an operator (or a compromised lead) cannot swap in a different plan of the
 * same tier under the same token.
 */
// CONTRACT_MIRROR_VERSION: 3
// v3 (2026-08-23): no change to this file's surface. Bumped to re-attest the
// sync after biro's mirror was found to be MISSING approvalToken.operationSetHash
// — zod strips unknown keys, so biro silently dropped the C1+ commitment and
// Workforce refused every C1+ approval. Found by biro's contract-snapshot check.

import { z } from "zod";
import { ulid, hashHex, isoDateTime, principalRef } from "./common.js";

export const approvalToken = z.object({
  /** The WorkOrder this token authorizes; must match the WorkOrder being applied. */
  workOrderId: ulid,
  /** Canonical hash of the exact PLANNED plan this token approves. */
  planHash: hashHex,
  /**
   * Canonical hash of the complete, owner-reviewable C1+ operation manifest.
   * Optional on the wire for non-mutating/backward-compatible flows, but a
   * Workforce transition with any C1+ operation must require an exact match.
   */
  operationSetHash: hashHex.optional(),
  /** Who approved (the CEO agent acting on the owner's tap, or a human). */
  approver: principalRef,
  issuedAt: isoDateTime,
  /** After this instant the token is void; re-approval is required. */
  expiresAt: isoDateTime,
  /**
   * Opaque detached signature over the token's canonical content, produced by
   * Biro's tenant-scoped signing key. Verification of the signature material
   * itself is Biro's concern; the protocol requires only that it be present.
   */
  signature: z.string().min(1),
});

export type ApprovalToken = z.infer<typeof approvalToken>;

/**
 * Parse and validate an unknown value as an ApprovalToken.
 * Throws a ZodError if validation fails.
 */
export function parseApprovalToken(input: unknown): ApprovalToken {
  return approvalToken.parse(input);
}

/**
 * Safely parse an unknown value as an ApprovalToken using Zod's safeParse.
 */
export function safeParseApprovalToken(input: unknown): { success: boolean; data?: ApprovalToken; error?: z.ZodError } {
  const result = approvalToken.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
