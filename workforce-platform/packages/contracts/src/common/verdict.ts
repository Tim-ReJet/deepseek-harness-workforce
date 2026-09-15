/**
 * verdict.ts — the tri-state result of validation/attestation.
 *
 * Invariant: missing required evidence cannot produce PASS. INDETERMINATE
 * exists precisely so "we don't know" is never collapsed into "it passed".
 */
import { z } from "zod";

export const VERDICTS = ["PASS", "FAIL", "INDETERMINATE"] as const;
export const verdict = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdict>;
