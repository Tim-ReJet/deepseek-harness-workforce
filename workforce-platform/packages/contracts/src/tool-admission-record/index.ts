/**
 * workforce.tool-admission/v1 — the record that a specific tool (MCP server
 * tool, package, etc.) has been reviewed and admitted for use, with the
 * canonical capabilities/effect classes it is trusted to exercise and the
 * runtime requirements it must be sandboxed with.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { identity } from "../common/identity.js";
import { rfc3339 } from "../common/time.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const TOOL_ADMISSION_RECORD_SCHEMA = "workforce.tool-admission/v1" as const;

const toolIdentity = z
  .object({
    providerType: z.string().min(1),
    serverOrPackageId: z.string().min(1),
    version: z.string().min(1),
    sourceDigest: digest,
    toolName: z.string().min(1),
    inputSchemaDigest: digest,
  })
  .strict();

const filesystemRequirements = z
  .object({
    capabilities: z.array(z.string().min(1)),
  })
  .strict();

const networkRequirements = z
  .object({
    hosts: z.array(z.string().min(1)),
  })
  .strict();

const credentialRequirement = z
  .object({
    brokerKey: z.string().min(1),
  })
  .strict();

const resourceRequirements = z
  .object({
    maxSeconds: z.number().int().positive(),
  })
  .strict();

const runtimeRequirements = z
  .object({
    isolationClass: z.string().min(1),
    filesystem: filesystemRequirements,
    network: networkRequirements,
    credentials: z.array(credentialRequirement),
    resources: resourceRequirements,
  })
  .strict();

const outputPolicy = z
  .object({
    maxBytes: z.number().int().positive(),
    treatAsData: z.boolean(),
    secretRedaction: z.boolean(),
  })
  .strict();

export const TOOL_ADMISSION_STATUSES = ["ADMITTED", "REJECTED", "REVOKED"] as const;
export const toolAdmissionStatus = z.enum(TOOL_ADMISSION_STATUSES);

export const toolAdmissionRecord = z
  .object({
    schema: z.literal(TOOL_ADMISSION_RECORD_SCHEMA),
    id,
    identity: toolIdentity,
    canonicalCapabilities: z.array(z.string().min(1)),
    effectClasses: z.array(z.string().min(1)),
    runtimeRequirements,
    outputPolicy,
    admittedBy: identity,
    admittedAt: rfc3339,
    status: toolAdmissionStatus,
    provenanceRef: digestRef,
    testEvidenceRefs: z.array(digestRef),
    digest,
    /** Opaque signature string — envelope/verification is CONTRACT-002+. */
    signature: z.string().min(1),
    extensions,
  })
  .strict();

export type ToolAdmissionRecord = z.infer<typeof toolAdmissionRecord>;
