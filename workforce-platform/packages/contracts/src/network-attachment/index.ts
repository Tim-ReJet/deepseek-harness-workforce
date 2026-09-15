/**
 * workforce.network-attachment-spec/v1 — declarative description of what a
 * cell/sandbox is allowed to reach on the network, independent of how that
 * reachability is actually provisioned. This is a spec-only slice (NET-001):
 * no live NetBird/management-API calls, no wiring into
 * `provisioningSpec.network`. That live-provider recast is NET-03.
 *
 * `locator` on `networkResourceRef` is a hostname, CIDR, or group name — it
 * must never carry a secret (token, setup key, credential).
 */
import { z } from "zod";
import { id } from "../common/ids.js";
import { rfc3339 } from "../common/time.js";

export const NETWORK_ATTACHMENT_SPEC_SCHEMA = "workforce.network-attachment-spec/v1" as const;

export const networkResourceRef = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    locator: z.string().min(1),
  })
  .strict();

export type NetworkResourceRef = z.infer<typeof networkResourceRef>;

export const networkFlow = z
  .object({
    protocol: z.enum(["TCP", "UDP", "ICMP"]),
    port: z.number().int().positive().optional(),
    direction: z.enum(["egress", "ingress"]),
    to: z.string().min(1),
  })
  .strict();

export type NetworkFlow = z.infer<typeof networkFlow>;

export const networkAttachmentSpec = z
  .object({
    schema: z.literal(NETWORK_ATTACHMENT_SPEC_SCHEMA),
    id,
    kind: z.enum(["cluster-local", "netbird-resource", "netbird-peer", "public-egress", "operator-access"]),
    resources: z.array(networkResourceRef),
    allowedFlows: z.array(networkFlow),
    tenantId: z.string().min(1),
    workOrderId: z.string().min(1),
    cellId: z.string().min(1),
    expiresAt: rfc3339,
    evidenceRequired: z.boolean(),
  })
  .strict();

export type NetworkAttachmentSpec = z.infer<typeof networkAttachmentSpec>;
