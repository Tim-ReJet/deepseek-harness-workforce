/**
 * workorder-v1.ts — a one-way compatibility mapper from a frozen
 * `workorder/v1` object (`@workforce/workorder-protocol`) to a V2 WorkOrder
 * draft (`biro.workorder/v2`, this package).
 *
 * This is a *mapper*, not a second schema owner: `workorder/v1` stays
 * byte-compatible and untouched (`packages/workorder-protocol/**` is
 * read-only from here). The mapper never mutates its input and never writes
 * to anything under `packages/workorder-protocol`.
 *
 * Full mapping rules are documented in `./README.md` — read that file before
 * changing this one; this file implements the rules, it does not restate
 * the rationale for each one.
 */
import { z } from "zod";
import type { WorkOrder as WorkOrderV1 } from "@workforce/workorder-protocol";
import { safeParseWorkOrder } from "@workforce/workorder-protocol";
import { workOrder as workOrderV2Schema, WORKORDER_SCHEMA, type WorkOrder as WorkOrderV2 } from "../workorder/index.js";
import { computeArtifactDigest, withoutDigestAndSignature } from "../common/digest.js";
import type { Identity } from "../common/identity.js";

/** Namespace the V1 leftovers are dumped under on the V2 `extensions` object. */
export const COMPAT_EXTENSION_NAMESPACE = "compat.workorder.v1" as const;

/**
 * Marker used as V2 `Identity.issuer` for identities mapped from a V1
 * `principalRef`, which carries no `issuer` field of its own. Never a real
 * issuer URL — callers must not treat this as an authentication authority.
 */
export const COMPAT_IDENTITY_ISSUER = "workorder/v1" as const;

/** V1 `principalRef.kind` -> V2 `identity.kind`. V2 has no agent-role granularity. */
function mapPrincipalKind(kind: WorkOrderV1["issuedBy"]["kind"]): Identity["kind"] {
  switch (kind) {
    case "human":
      return "human";
    case "service":
      return "service";
    case "ceo-agent":
    case "workforce-lead":
    case "platform-lead":
      return "agent";
    default: {
      // Exhaustiveness guard: a new V1 principal kind must be triaged here,
      // not silently coerced.
      const _never: never = kind;
      throw new Error(`mapWorkOrderV1ToV2: unmapped V1 principalRef.kind '${String(_never)}'`);
    }
  }
}

function mapIdentity(principal: WorkOrderV1["issuedBy"], tenantId: string): Identity {
  return {
    id: principal.id,
    kind: mapPrincipalKind(principal.kind),
    issuer: COMPAT_IDENTITY_ISSUER,
    tenantId,
  };
}

/** Drop `undefined`-valued keys so optional V1 fields don't appear as literal `undefined` in extensions. */
function definedEntries(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export interface MapWorkOrderV1ToV2Options {
  /**
   * V2 `organisationId` is required but V1 has no matching concept; the
   * companyId is the closest analogue and is used by default. Override only
   * if the caller has a real organisation id V1 didn't carry.
   */
  organisationId?: string;
  /** V2 `version` is required; V1 has no revision counter for the WorkOrder itself. Defaults to 1. */
  version?: number;
}

/**
 * Map a frozen `workorder/v1` object onto a `biro.workorder/v2` draft.
 *
 * One-way: there is no `mapWorkOrderV2ToV1`, and this function never PASSes
 * or FAILs anything — verdicts are OutcomeAttestation's job, not a
 * compatibility mapper's. The returned draft still requires a real `digest`
 * signer / attestor pass through the normal V2 pipeline before it is
 * treated as authoritative; this mapper only guarantees the *shape* parses.
 *
 * Throws if `v1` does not itself parse as a valid `workorder/v1` WorkOrder —
 * the mapper refuses to guess at a malformed source.
 */
export function mapWorkOrderV1ToV2(
  v1: WorkOrderV1,
  options: MapWorkOrderV1ToV2Options = {},
): WorkOrderV2 {
  const parsed = safeParseWorkOrder(v1);
  if (!parsed.success) {
    throw new Error(
      `mapWorkOrderV1ToV2: input is not a valid workorder/v1 WorkOrder: ${parsed.error.message}`,
    );
  }
  const src = parsed.data;

  const issuedBy = mapIdentity(src.issuedBy, src.tenantId);

  const scopeConstraints = Object.entries(src.constraints).map(([key, value]) => ({
    id: key,
    type: "must" as const,
    condition: `${key} = ${JSON.stringify(value)}`,
    reason: "Migrated verbatim from workorder/v1 `constraints`; not re-evaluated as a V2 scope constraint.",
  }));

  const compatExtension = definedEntries({
    protocol: src.protocol,
    goldenPathId: src.goldenPathId,
    complianceProfile: src.complianceProfile,
    inputs: src.inputs,
    constraints: src.constraints,
    policyBundle: src.policyBundle,
    architectureRef: src.architectureRef,
    blockRevision: src.blockRevision,
    budgetLease: src.budgetLease,
    approvalToken: src.approvalToken,
    marketplaceIntent: src.marketplaceIntent,
    billingIntent: src.billingIntent,
    // Full raw source (not the zod-parsed `src`, which strips unknown keys),
    // so a future/unknown V1 field this mapper doesn't know to name above is
    // still preserved rather than silently dropped.
    source: v1,
  });

  const draft = {
    schema: WORKORDER_SCHEMA,
    id: src.id,
    version: options.version ?? 1,
    tenantId: src.tenantId,
    organisationId: options.organisationId ?? src.companyId,
    issuedBy,
    objective: {
      goal: src.intent,
      outcomes: [
        {
          id: "outcome-1",
          description: src.intent,
        },
      ],
      context: `Migrated from workorder/v1 golden path '${src.goldenPathId}'.`,
      nonGoals: [],
    },
    scope: {
      targets: [
        {
          kind: "workorder-v1.architecture-block",
          id: src.architectureRef,
        },
      ],
      constraints: scopeConstraints,
    },
    // V1 has no explicit authority-ceiling concept; defaults to empty until a
    // real ceiling is derived downstream (e.g. from the DelegationPlan that
    // replaces this draft's golden path).
    authorityCeiling: {
      capabilities: [],
      prohibited: [],
    },
    resources: {
      budget: {
        currency: src.budgetLease.currency,
        capMinorUnits: src.budgetLease.capMinorUnits,
      },
      deadline: src.budgetLease.expiresAt,
    },
    acceptance: {
      assertions: [
        {
          id: "a1",
          proposition: "Migrated from workorder/v1; no V1 acceptance criteria existed to carry forward.",
          criticality: "REQUIRED" as const,
        },
      ],
    },
    accountability: {
      owner: issuedBy,
      // V1's policyBundle.humanApprovalRequired is a list of action names,
      // not policy references — it is not a valid V2 approvalPolicies value
      // and is left in extensions instead of being coerced into one here.
      approvalPolicies: [],
    },
    lifecycle: {
      mode: "workorder-v1-compat",
    },
    provenance: {
      source: "workorder/v1",
      createdAt: src.createdAt,
    },
    extensions: {
      [COMPAT_EXTENSION_NAMESPACE]: compatExtension,
    },
  };

  const digest = computeArtifactDigest(withoutDigestAndSignature(draft as Record<string, unknown>));

  return workOrderV2Schema.parse({ ...draft, digest });
}

/**
 * Safe variant of {@link mapWorkOrderV1ToV2}: never throws, returns a typed
 * result instead.
 */
export function safeMapWorkOrderV1ToV2(
  v1: WorkOrderV1,
  options: MapWorkOrderV1ToV2Options = {},
): { success: true; data: WorkOrderV2 } | { success: false; error: Error | z.ZodError } {
  try {
    return { success: true, data: mapWorkOrderV1ToV2(v1, options) };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error };
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
