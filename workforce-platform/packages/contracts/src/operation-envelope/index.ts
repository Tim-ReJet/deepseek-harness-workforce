/**
 * workforce.operation-envelope/v1 — plan 15's `OperationEnvelope`: the
 * binding of one runtime `EffectIntent` to the authority (`ExecutionPermit`,
 * optional step-up `EffectPermit`) and admitted implementation
 * (`ToolAdmissionRecord`) it is allowed to run under, plus the executor
 * identity/generation that fenced the reservation.
 *
 * All four authorizing artifacts are plain `digestRef`s, matching
 * `effect-intent/index.ts`'s `actionIntent` pattern: this slice does not
 * depend on resolving the referenced artifact, only on committing to its
 * digest. `EffectGateway.prepare()` is the only producer of this schema in
 * this slice — no signature/JWT/PKI verification, no provider invocation.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { rfc3339 } from "../common/time.js";
import { id } from "../common/ids.js";

export const OPERATION_ENVELOPE_SCHEMA = "workforce.operation-envelope/v1" as const;

export const operationEnvelope = z
  .object({
    schema: z.literal(OPERATION_ENVELOPE_SCHEMA),
    id,
    effectIntent: digestRef,
    executionPermit: digestRef,
    /** Step-up permit reference — only required for plan 15's step-up-gated effect classes. */
    effectPermit: digestRef.optional(),
    toolAdmission: digestRef,
    workloadIdentity: z.string().min(1),
    cellGeneration: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1),
    expiresAt: rfc3339,
    digest,
  })
  .strict();

export type OperationEnvelope = z.infer<typeof operationEnvelope>;
