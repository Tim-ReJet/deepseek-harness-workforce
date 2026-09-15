/**
 * identity.ts — a stable identity reference for a producer/issuer/admitter,
 * used everywhere a document must name "who says so" (WorkOrder.issuedBy,
 * ExecutionPermit.issuedBy, ToolAdmissionRecord.admittedBy, ...).
 */
import { z } from "zod";

export const identity = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["human", "service", "agent"]),
    issuer: z.string().min(1),
    tenantId: z.string().min(1).optional(),
    organisationId: z.string().min(1).optional(),
  })
  .strict();
export type Identity = z.infer<typeof identity>;
