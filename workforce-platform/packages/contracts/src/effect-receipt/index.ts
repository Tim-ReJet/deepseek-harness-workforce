/**
 * workforce.effect-receipt/v1 — the outcome record for one executed
 * `EffectIntent` (plan 15's `EffectReceipt`). Plan 15 never specified a
 * full interface for this artifact, so this is intentionally kept slim:
 * just enough to record ledger-relevant outcome state. Extend later
 * (readback payloads, evidence refs) once EffectProvider wiring lands.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { id } from "../common/ids.js";

export const EFFECT_RECEIPT_SCHEMA = "workforce.effect-receipt/v1" as const;

/** Plan 15's terminal/attempt outcome states relevant to a receipt. */
export const EFFECT_RECEIPT_STATES = [
  "COMMITTED",
  "FAILED",
  "UNKNOWN",
  "COMPENSATED",
  "COMPENSATION_FAILED",
] as const;
export const effectReceiptState = z.enum(EFFECT_RECEIPT_STATES);

export const effectReceipt = z
  .object({
    schema: z.literal(EFFECT_RECEIPT_SCHEMA),
    id,
    effectIntent: digestRef,
    state: effectReceiptState,
    providerId: z.string().min(1).optional(),
    externalEffectId: z.string().min(1).optional(),
    digest,
  })
  .strict();

export type EffectReceipt = z.infer<typeof effectReceipt>;
