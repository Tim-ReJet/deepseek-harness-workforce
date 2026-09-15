/**
 * workforce.delegation-plan/v1 — Workforce's own execution decomposition of
 * a WorkOrder into workstreams, gates and a bounded effect envelope. This is
 * one of the four Workforce-owned artifacts (plan, permit, provisioning,
 * validation) that never lived inside WorkOrder itself.
 */
import { z } from "zod";
import { digestRef } from "../common/digest.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const DELEGATION_PLAN_SCHEMA = "workforce.delegation-plan/v1" as const;

const workstream = z
  .object({
    id: z.string().min(1),
    objective: z.string().min(1),
  })
  .strict();

const recursion = z
  .object({
    maxIterations: z.number().int().positive(),
    maxChildDepth: z.number().int().nonnegative(),
    noProgressThreshold: z.number().int().positive(),
  })
  .strict();

const riskFinding = z.string().min(1);

const risk = z
  .object({
    class: z.string().min(1),
    findings: z.array(riskFinding),
  })
  .strict();

const workerAssignee = z
  .object({
    agentInstanceId: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();

/** Sealed path ownership grants for Cell workers (ADR-029); not mirrored on the board as authority. */
const delegationWorker = z
  .object({
    id: z.string().min(1),
    assignee: workerAssignee,
    ownedPaths: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const delegationPlan = z
  .object({
    schema: z.literal(DELEGATION_PLAN_SCHEMA),
    id,
    workOrder: digestRef,
    revision: z.number().int().positive(),
    workers: z.array(delegationWorker).optional(),
    workstreams: z.array(workstream).min(1),
    requiredGates: z.array(z.string().min(1)),
    /**
     * Bounded so a child cannot recurse without limit — invariant 3 (child
     * authority can only narrow) applies to depth here even though runtime
     * enforcement is a later unit.
     */
    recursion,
    effectEnvelope: z.array(z.string().min(1)),
    compensationRequirements: z.array(z.string().min(1)),
    risk,
    digest: digestRef.shape.digest,
    extensions,
  })
  .strict();

export type DelegationPlan = z.infer<typeof delegationPlan>;
