/**
 * workforce.outcome-attestation/v1 — the distinct, independently-issued
 * verdict on a run. Invariant 1: the component that caused an effect
 * (RunManifest's producer) cannot be the final authority accepting it, so
 * OutcomeAttestation only *references* a run by digest — it never embeds it.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { rfc3339 } from "../common/time.js";
import { identity } from "../common/identity.js";
import { id } from "../common/ids.js";
import { verdict } from "../common/verdict.js";
import { extensions } from "../common/extension.js";

export const OUTCOME_ATTESTATION_SCHEMA = "workforce.outcome-attestation/v1" as const;

const assertionResult = z
  .object({
    assertionId: z.string().min(1),
    result: verdict,
    evidenceRefs: z.array(digestRef),
  })
  .strict();

const policyCompliance = z
  .object({
    result: verdict,
    findings: z.array(z.string().min(1)),
  })
  .strict();

const verifiedEffect = z
  .object({
    effectId: z.string().min(1),
    receiptRef: digestRef,
  })
  .strict();

const effects = z
  .object({
    verified: z.array(verifiedEffect),
    prohibited: z.array(z.string().min(1)),
    unresolved: z.array(z.string().min(1)),
  })
  .strict();

export const outcomeAttestation = z
  .object({
    schema: z.literal(OUTCOME_ATTESTATION_SCHEMA),
    id,
    workOrder: digestRef,
    run: digestRef,
    /** Top-level verdict — invariant 4: missing evidence must never be PASS. */
    verdict,
    assertions: z.array(assertionResult),
    policyCompliance,
    effects,
    residualFindings: z.array(z.string().min(1)),
    evidenceRoot: digest,
    policyDecisionDigest: digest,
    issuedAt: rfc3339,
    issuedBy: identity,
    /** Opaque signature string — envelope/verification is CONTRACT-002+. */
    signature: z.string().min(1),
    extensions,
  })
  .strict();

export type OutcomeAttestation = z.infer<typeof outcomeAttestation>;
