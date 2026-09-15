/**
 * workorder/v2 — the V2 WorkOrder. Biro issues this; Workforce never mutates
 * it. It is a *what/why/how-much*, never a *how*: no DSH profile, no model
 * choice, no command, no image, no RuntimeClass, no local filesystem path.
 * Execution machinery is DelegationPlan/ExecutionPermit/ProvisioningSpec's
 * job, not WorkOrder's.
 *
 * `workorder/v1` (`@workforce/workorder-protocol`) is frozen and unrelated —
 * this is a new, independently versioned schema, not a V1 mutation.
 */
import { z } from "zod";
import { budget } from "../common/money.js";
import { rfc3339 } from "../common/time.js";
import { identity } from "../common/identity.js";
import { digest } from "../common/digest.js";
import { ulid } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const WORKORDER_SCHEMA = "biro.workorder/v2" as const;

const outcome = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

const objective = z
  .object({
    goal: z.string().min(1),
    outcomes: z.array(outcome).min(1),
    context: z.string().min(1),
    nonGoals: z.array(z.string().min(1)),
  })
  .strict();

const scopeTarget = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

const scopeConstraint = z
  .object({
    id: z.string().min(1),
    type: z.enum(["must", "should", "may"]),
    condition: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

const scope = z
  .object({
    targets: z.array(scopeTarget).min(1),
    constraints: z.array(scopeConstraint),
  })
  .strict();

const authorityCeiling = z
  .object({
    capabilities: z.array(z.string().min(1)),
    prohibited: z.array(z.string().min(1)),
  })
  .strict();

const resources = z
  .object({
    budget,
    deadline: rfc3339,
  })
  .strict();

const acceptanceAssertion = z
  .object({
    id: z.string().min(1),
    proposition: z.string().min(1),
    criticality: z.enum(["REQUIRED", "OPTIONAL"]),
  })
  .strict();

const acceptance = z
  .object({
    assertions: z.array(acceptanceAssertion).min(1),
  })
  .strict();

const accountability = z
  .object({
    owner: identity,
    approvalPolicies: z.array(z.string().min(1)),
  })
  .strict();

const lifecycle = z
  .object({
    mode: z.string().min(1),
  })
  .strict();

const provenance = z
  .object({
    source: z.string().min(1),
    createdAt: rfc3339,
  })
  .strict();

/** Producer-side strict schema: unknown top-level keys are rejected. */
export const workOrder = z
  .object({
    schema: z.literal(WORKORDER_SCHEMA),
    id: ulid,
    version: z.number().int().positive(),
    tenantId: z.string().min(1),
    organisationId: z.string().min(1),
    issuedBy: identity,
    objective,
    scope,
    authorityCeiling,
    resources,
    acceptance,
    accountability,
    lifecycle,
    provenance,
    digest,
    extensions,
  })
  .strict();

export type WorkOrder = z.infer<typeof workOrder>;

/**
 * Field names that must never appear on WorkOrder: it authorizes *what* may
 * be done and *how much may be spent*, never *how* — that is execution
 * machinery owned by DelegationPlan/ExecutionPermit/ProvisioningSpec.
 */
export const FORBIDDEN_WORKORDER_FIELDS = [
  "dshProfile",
  "model",
  "command",
  "image",
  "runtimeClass",
  "RuntimeClass",
  "localPath",
] as const;
