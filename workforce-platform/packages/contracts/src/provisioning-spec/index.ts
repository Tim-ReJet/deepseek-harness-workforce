/**
 * workforce.provisioning-spec/v1 — the concrete runtime/workload/authority/
 * credential shape a Cell is provisioned with. This is where DSH distribution,
 * orchestrator, image-equivalent runtime composition, etc. live — deliberately
 * *not* on WorkOrder (see workorder/index.ts's forbidden-fields note).
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const PROVISIONING_SPEC_SCHEMA = "workforce.provisioning-spec/v1" as const;

const runtime = z
  .object({
    distribution: z.string().min(1),
    compositionDigest: digest,
    orchestrator: z.string().min(1),
    agentProviders: z.array(z.string().min(1)),
    plugins: z.array(z.string().min(1)),
  })
  .strict();

const workload = z
  .object({
    provider: z.string().min(1),
    isolationClass: z.string().min(1),
    cpu: z.string().min(1),
    memory: z.string().min(1),
    storage: z.string().min(1),
    lifetimeSeconds: z.number().int().positive(),
  })
  .strict();

const authority = z
  .object({
    provider: z.string().min(1),
    manifestDigest: digest,
  })
  .strict();

const tool = z
  .object({
    admissionId: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

const network = z
  .object({
    kind: z.string().min(1),
    resources: z.array(z.string().min(1)),
  })
  .strict();

const credential = z
  .object({
    id: z.string().min(1),
    brokerKey: z.string().min(1),
    usage: z.string().min(1),
    audience: z.string().min(1),
    operations: z.array(z.string().min(1)),
    maxTtlSeconds: z.number().int().positive(),
    exposure: z.string().min(1),
  })
  .strict();

export const provisioningSpec = z
  .object({
    schema: z.literal(PROVISIONING_SPEC_SCHEMA),
    id,
    workOrder: digestRef,
    delegationPlan: digestRef,
    runtime,
    workload,
    authority,
    tools: z.array(tool),
    network: z.array(network),
    credentials: z.array(credential),
    evidence: z.array(z.string().min(1)),
    digest,
    extensions,
  })
  .strict();

export type ProvisioningSpec = z.infer<typeof provisioningSpec>;
