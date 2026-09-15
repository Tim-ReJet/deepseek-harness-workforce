/**
 * principal-ref.ts — the canonical, cross-system principal vocabulary
 * (`PrincipalRef`, `DelegationSubject`, `IdentityBindingRef`) plus a pure
 * claims → principal mapping function.
 *
 * This is additive alongside `identity.ts`: `identity` stays unchanged for
 * existing WorkOrder/ExecutionPermit/ToolAdmissionRecord consumers.
 * `PrincipalRef` widens the vocabulary (adds `"workload"` and
 * `"organisation"` kinds, plus `displayName`/`externalSubject`) for new
 * identity-binding consumers without touching the frozen `identity` shape.
 *
 * `resolvePrincipalFromBinding` is pure — no I/O, no Authentik/SPIRE client,
 * no DB. It takes an in-memory list of `IdentityBindingRef` rows (the
 * binding record is authoritative) plus a decoded-claims-shaped object, and
 * returns either a resolved `PrincipalRef` or a typed rejection. IdP group
 * claims never upgrade a role; only the binding record's `principalId` and
 * enabled/revoked state decide the outcome.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// PrincipalRef
// ---------------------------------------------------------------------------

/** A stable, canonical reference to a principal, cross-system. */
export const principalRef = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["human", "service", "agent", "workload", "organisation"]),
    issuer: z.string().min(1),
    tenantId: z.string().min(1).optional(),
    organisationId: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    externalSubject: z.string().min(1).optional(),
  })
  .strict();
export type PrincipalRef = z.infer<typeof principalRef>;

// ---------------------------------------------------------------------------
// DelegationSubject
// ---------------------------------------------------------------------------

/**
 * The delegation chain for a workload/agent action: who is running it, who
 * (optionally) requested it, and who is ultimately accountable for it.
 */
export const delegationSubject = z
  .object({
    workload: principalRef,
    agent: principalRef.optional(),
    requestedBy: principalRef,
    accountableTo: principalRef,
  })
  .strict();
export type DelegationSubject = z.infer<typeof delegationSubject>;

// ---------------------------------------------------------------------------
// IdentityBindingRef
// ---------------------------------------------------------------------------

/**
 * A pure contract shape for an identity-binding row: maps an IdP-issued
 * `(issuer, subject, clientId)` tuple to a `principalId`. Mirrors the shape
 * an `identity_bindings` table would have, but is not itself a table — no
 * DB, no migration. `(issuer, subject, clientId)` is assumed unique.
 */
export const identityBindingRef = z
  .object({
    issuer: z.string().min(1),
    subject: z.string().min(1),
    clientId: z.string().min(1).optional(),
    principalId: z.string().min(1),
    bindingType: z.enum(["human", "service", "agent", "workload", "organisation"]),
    tenantId: z.string().min(1).optional(),
    organisationId: z.string().min(1).optional(),
    enabled: z.boolean(),
    revoked: z.boolean(),
  })
  .strict();
export type IdentityBindingRef = z.infer<typeof identityBindingRef>;

// ---------------------------------------------------------------------------
// resolvePrincipalFromBinding — pure claims -> principal mapping
// ---------------------------------------------------------------------------

/** The decoded-claims-shaped input the mapper resolves against bindings. */
export interface PrincipalClaims {
  issuer: string;
  subject: string;
  clientId?: string;
  tenantId?: string;
  organisationId?: string;
  displayName?: string;
  /** IdP group claims — informational only; never used to select or upgrade a role. */
  groups?: string[];
}

export type PrincipalResolutionRejectionReason =
  | "no-binding"
  | "binding-disabled"
  | "binding-revoked"
  | "tenant-mismatch";

export interface PrincipalResolutionRejection {
  rejected: PrincipalResolutionRejectionReason;
}

/**
 * Resolve a `PrincipalRef` from decoded IdP claims against an in-memory list
 * of `IdentityBindingRef` rows. Pure function: no network, no DB. The
 * binding record is authoritative — `claims.groups` (or any other claim) is
 * never consulted to select a role or principal; only the matched binding's
 * `principalId`/`bindingType`/`tenantId`/`organisationId` are used.
 *
 * Match key is `(issuer, subject, clientId)` — `clientId` participates in
 * the match only when present on both the claims and the binding.
 *
 * Rejection precedence when a binding is found: `tenant-mismatch` (claims
 * carry a tenant that disagrees with the binding's) before
 * `binding-disabled`/`binding-revoked`, since a tenant mismatch means the
 * claims do not actually belong to this binding's tenant.
 */
export function resolvePrincipalFromBinding(
  claims: PrincipalClaims,
  bindings: readonly IdentityBindingRef[],
): PrincipalRef | PrincipalResolutionRejection {
  const binding = bindings.find(
    (b) =>
      b.issuer === claims.issuer &&
      b.subject === claims.subject &&
      (b.clientId === undefined || claims.clientId === undefined || b.clientId === claims.clientId),
  );

  if (!binding) {
    return { rejected: "no-binding" };
  }

  if (
    binding.tenantId !== undefined &&
    claims.tenantId !== undefined &&
    binding.tenantId !== claims.tenantId
  ) {
    return { rejected: "tenant-mismatch" };
  }
  if (
    binding.organisationId !== undefined &&
    claims.organisationId !== undefined &&
    binding.organisationId !== claims.organisationId
  ) {
    return { rejected: "tenant-mismatch" };
  }

  if (binding.revoked) {
    return { rejected: "binding-revoked" };
  }
  if (!binding.enabled) {
    return { rejected: "binding-disabled" };
  }

  return principalRef.parse({
    id: binding.principalId,
    kind: binding.bindingType,
    issuer: binding.issuer,
    tenantId: binding.tenantId,
    organisationId: binding.organisationId,
    displayName: claims.displayName,
    externalSubject: binding.subject,
  });
}
