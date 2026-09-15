/**
 * evidence-index/v1 — the per-run index over the evidence a RunManifest
 * closes on: what agency/enforcement/workload evidence was produced, which
 * effects/evaluations occurred, which child OutcomeAttestations exist, and
 * whether every expected producer actually reported in. This is an index,
 * not a verdict — EvidenceIndex never carries PASS/FAIL (invariant 3: that
 * lives on OutcomeAttestation alone).
 *
 * ActionIntent/EffectIntent/EffectReceipt are not defined yet (later unit),
 * so `effects`/`evaluations` are typed as bare digest references here, not
 * as full receipt/evidence schemas.
 */
import { z } from "zod";
import { digest, digestRef } from "../common/digest.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const EVIDENCE_INDEX_SCHEMA = "workforce.evidence-index/v1" as const;

/**
 * A reference to evidence produced by a named provider. ArtifactRef-shaped
 * (digest is identity; mediaType optional) plus the `producer` that
 * generated it — provider-specific detail beyond this belongs in
 * `extensions`, not in bespoke fields here.
 */
export const providerEvidenceRef = z
  .object({
    producer: z.string().min(1),
    digest,
    mediaType: z.string().min(1).optional(),
  })
  .strict();
export type ProviderEvidenceRef = z.infer<typeof providerEvidenceRef>;

export const PRODUCER_STATUSES = ["PRESENT", "MISSING", "PARTIAL"] as const;
export const producerStatus = z.enum(PRODUCER_STATUSES);
export type ProducerStatus = z.infer<typeof producerStatus>;

const requiredProducerStatus = z
  .object({
    producer: z.string().min(1),
    status: producerStatus,
  })
  .strict();

export const evidenceIndex = z
  .object({
    schema: z.literal(EVIDENCE_INDEX_SCHEMA),
    workOrderId: id,
    runId: id,
    cellId: id,

    agency: z.array(providerEvidenceRef),
    enforcement: z.array(providerEvidenceRef),
    workload: z.array(providerEvidenceRef),

    /** EffectReceipt is not defined yet — referenced by digest only. */
    effects: z.array(digestRef),
    /** VerificationEvidence is not defined yet — referenced by digest only. */
    evaluations: z.array(digestRef),
    /** OutcomeAttestations of child runs, referenced by digest only. */
    children: z.array(digestRef),

    requiredProducerStatus: z.array(requiredProducerStatus),

    rootDigest: digest,
    extensions,
  })
  .strict();

export type EvidenceIndex = z.infer<typeof evidenceIndex>;
