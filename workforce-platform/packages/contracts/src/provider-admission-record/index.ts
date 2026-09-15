/**
 * workforce.provider-admission/v1 — the record that a provider-shaped unit
 * of supply chain (a DSH plugin/bundle, a nono package, a runtime image, an
 * agent/effect/validation provider, or a model adapter) has been reviewed
 * and admitted for use, with the capabilities/effect classes it is trusted
 * to exercise and the isolation class it must run under.
 *
 * Mirrors `ToolAdmissionRecord` (CONTRACT-002/tool-admission-record) at a
 * broader granularity — provider-level rather than single-tool — and reuses
 * the same primitives (`digest`/`digestRef`/`identity`/`rfc3339`/`id`/
 * `extensions`) rather than inventing parallel ones. Per plan 18, `status`
 * is `ADMITTED | QUARANTINED | DENIED | REVOKED` (not `ToolAdmissionRecord`'s
 * `REJECTED`), and `requiredIsolation` is a bare `z.string().min(1)` — there
 * is no shared `IsolationClass` type in this package, and this unit does not
 * introduce one.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { identity } from "../common/identity.js";
import { rfc3339 } from "../common/time.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const PROVIDER_ADMISSION_RECORD_SCHEMA = "workforce.provider-admission/v1" as const;

export const PROVIDER_ADMISSION_TYPES = [
  "dsh-plugin",
  "dsh-bundle",
  "nono-package",
  "runtime-image",
  "agent-provider",
  "effect-provider",
  "validation-provider",
  "model-adapter",
] as const;
export const providerAdmissionType = z.enum(PROVIDER_ADMISSION_TYPES);
export type ProviderAdmissionType = z.infer<typeof providerAdmissionType>;

/** Where the provider came from: identity of its publisher plus version/digest. */
const providerSource = z
  .object({
    publisher: identity,
    version: z.string().min(1),
    digest,
  })
  .strict();

export const PROVIDER_ADMISSION_STATUSES = [
  "ADMITTED",
  "QUARANTINED",
  "DENIED",
  "REVOKED",
] as const;
export const providerAdmissionStatus = z.enum(PROVIDER_ADMISSION_STATUSES);
export type ProviderAdmissionStatus = z.infer<typeof providerAdmissionStatus>;

export const providerAdmissionRecord = z
  .object({
    schema: z.literal(PROVIDER_ADMISSION_RECORD_SCHEMA),
    id,
    type: providerAdmissionType,
    source: providerSource,
    version: z.string().min(1),
    digest,
    provenanceRef: digestRef,
    sbomRef: digestRef.optional(),
    vulnerabilityReportRef: digestRef.optional(),
    testEvidenceRefs: z.array(digestRef),
    capabilities: z.array(z.string().min(1)),
    effectClasses: z.array(z.string().min(1)),
    requiredIsolation: z.string().min(1),
    status: providerAdmissionStatus,
    admittedAt: rfc3339,
    expiresAt: rfc3339.optional(),
    admittedBy: identity,
    /** Opaque signature string — envelope/verification is store-owned (mirrors ToolAdmissionRecord). */
    signature: z.string().min(1),
    /** Ids of other provider admission records this one depends on, for impact queries. Optional. */
    dependsOn: z.array(z.string().min(1)).default([]),
    extensions,
  })
  .strict();

export type ProviderAdmissionRecord = z.infer<typeof providerAdmissionRecord>;
