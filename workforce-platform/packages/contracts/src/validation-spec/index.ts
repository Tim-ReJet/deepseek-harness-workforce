/**
 * workforce.validation-spec/v1 — how WorkOrder acceptance assertions get
 * checked: which procedures run, at what independence level, and what
 * "complete enough to decide" means (invariant 4: missing evidence cannot
 * produce PASS, so verdictPolicy names an explicit INDETERMINATE case).
 */
import { z } from "zod";
import { digestRef } from "../common/digest.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const VALIDATION_SPEC_SCHEMA = "workforce.validation-spec/v1" as const;

const assertion = z
  .object({
    id: z.string().min(1),
    proposition: z.string().min(1),
    criticality: z.enum(["REQUIRED", "OPTIONAL"]),
    procedures: z.array(z.string().min(1)),
    minimumEvidenceStrength: z.string().min(1),
  })
  .strict();

const procedure = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    independence: z.string().min(1),
  })
  .strict();

const completeness = z
  .object({
    requiredProducers: z.array(z.string().min(1)),
    requireClosedAuthority: z.boolean(),
    requireClosedChildren: z.boolean(),
  })
  .strict();

const verdictPolicy = z
  .object({
    pass: z.string().min(1),
    fail: z.string().min(1),
    indeterminate: z.string().min(1),
  })
  .strict();

export const validationSpec = z
  .object({
    schema: z.literal(VALIDATION_SPEC_SCHEMA),
    id,
    workOrder: digestRef,
    delegationPlan: digestRef,
    assertions: z.array(assertion).min(1),
    procedures: z.array(procedure),
    completeness,
    verdictPolicy,
    digest: digestRef.shape.digest,
    extensions,
  })
  .strict();

export type ValidationSpec = z.infer<typeof validationSpec>;
