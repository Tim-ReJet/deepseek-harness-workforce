/**
 * run-manifest/v1 — records one attempt/generation lineage without
 * duplicating full evidence: WorkOrder/plan/permit references, Cell/
 * generation/workload identity, runtime composition digest, infrastructure
 * run status, child runs, resource consumption, the nested EvidenceIndex,
 * closure state, and event/effect/evidence root digests.
 *
 * Invariant 1: the component that causes an effect cannot be the final
 * authority accepting it — RunManifest is produced by the same execution
 * lineage that ran the Cell, so it never carries a verdict. `status` and
 * `closureState` are infrastructure/lifecycle states only; PASS/FAIL/
 * INDETERMINATE belong exclusively to the distinct OutcomeAttestation,
 * which references a run by digest and is never embedded here.
 */
import { z } from "zod";
import { digest, digestRef } from "../common/digest.js";
import { rfc3339 } from "../common/time.js";
import { identity } from "../common/identity.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";
import { evidenceIndex } from "../evidence-index/index.js";

export const RUN_MANIFEST_SCHEMA = "workforce.run-manifest/v1" as const;

/**
 * Infrastructure lifecycle states only — deliberately excludes PASS/FAIL
 * (invariant 2). A run can be `sealed` and still receive any verdict once
 * OutcomeAttestation is issued against it.
 */
export const RUN_STATUSES = ["pending", "running", "sealed", "aborted", "cancelled"] as const;
export const runStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatus>;

/**
 * Evidence-closure lifecycle, distinct from `status`: whether the sealing
 * protocol (stop effects, revoke authority, settle in-flight effects, ...)
 * has completed for this run. Not a verdict — a `closed` run is not
 * thereby "passing".
 */
export const CLOSURE_STATES = ["open", "closing", "closed"] as const;
export const closureState = z.enum(CLOSURE_STATES);
export type ClosureState = z.infer<typeof closureState>;

const cellIdentity = z
  .object({
    cellId: id,
    generation: z.number().int().nonnegative(),
    workloadId: id,
  })
  .strict();

const resourceConsumption = z
  .object({
    cpu: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
    memory: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
    duration: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
  })
  .strict();

export const runManifest = z
  .object({
    schema: z.literal(RUN_MANIFEST_SCHEMA),
    id,
    version: z.number().int().positive(),
    createdAt: rfc3339,
    producer: identity,

    workOrder: digestRef,
    plan: digestRef,
    permit: digestRef,

    cell: cellIdentity,
    runtimeCompositionDigest: digest,

    /** Infrastructure state only — never PASS/FAIL (invariant 2). */
    status: runStatus,
    childRuns: z.array(digestRef),
    resourceConsumption,

    evidenceIndex,
    /** Lifecycle enum, not a verdict — see `closureState` above. */
    closureState,

    eventRootDigest: digest,
    effectRootDigest: digest,
    evidenceRootDigest: digest,

    extensions,
    digest,
  })
  .strict();

export type RunManifest = z.infer<typeof runManifest>;
