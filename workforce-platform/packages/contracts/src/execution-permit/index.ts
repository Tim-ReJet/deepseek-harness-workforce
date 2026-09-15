/**
 * workforce.execution-permit/v1 — the signed, time-boxed, narrowly-scoped
 * grant that authorizes one Cell generation to act. Invariant 3: a permit's
 * `grant.capabilities`/`grant.effects` are typed as lists specifically so a
 * later re-issuance can only subset them, never widen them.
 *
 * `grant.networkAccess` (CONTRACT-004, additive) is a distinct, optional
 * grant of genuine outbound-network destinations (e.g. package-registry
 * reach for dependency installation) — disjoint in meaning from
 * `grant.capabilities` (`scm.*`/`process.execute.*`) and
 * `grant.effects[].effectClass`, neither of which is network egress.
 * Omitted or empty means no network grant, matching the permit-compiler's
 * existing fail-closed `network: blocked` default (see
 * packages/permit-compiler/README.md "Network mode gap") — this field does
 * not itself grant or enforce anything; a future node wires the compiler to
 * consume it.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { budget } from "../common/money.js";
import { rfc3339 } from "../common/time.js";
import { identity } from "../common/identity.js";
import { id } from "../common/ids.js";
import { extensions } from "../common/extension.js";

export const EXECUTION_PERMIT_SCHEMA = "workforce.execution-permit/v1" as const;

const subject = z
  .object({
    spiffeId: z.string().min(1),
    cellId: z.string().min(1),
    generation: z.number().int().nonnegative(),
    runtimeCompositionDigest: digest,
  })
  .strict();

const grantEffect = z
  .object({
    effectClass: z.string().min(1),
    target: z.string().min(1),
  })
  .strict();

/**
 * One scoped outbound-network destination this permit grants reach to.
 * `destination` is a plain opaque string (host, registry URL, etc.) — this
 * package does not police its format, matching `grantEffect.target` above.
 */
const networkGrant = z
  .object({
    destination: z.string().min(1),
    purpose: z.string().min(1).optional(),
  })
  .strict();

const grant = z
  .object({
    /** Narrowable-only capability list (invariant 3). */
    capabilities: z.array(z.string().min(1)),
    effects: z.array(grantEffect),
    budget,
    delegationDepthRemaining: z.number().int().nonnegative(),
    /**
     * Optional and additive (CONTRACT-004). Absent or `[]` both mean "no
     * network grant" — never inferred from `capabilities`/`effects`.
     */
    networkAccess: z.array(networkGrant).optional(),
  })
  .strict();

const conditions = z
  .object({
    requiredIsolation: z.string().min(1),
    stepUpRequiredFor: z.array(z.string().min(1)),
    evidenceObligations: z.array(z.string().min(1)),
  })
  .strict();

const validity = z
  .object({
    notBefore: rfc3339,
    expiresAt: rfc3339,
    nonce: z.string().min(1),
  })
  .strict();

export const executionPermit = z
  .object({
    schema: z.literal(EXECUTION_PERMIT_SCHEMA),
    id,
    workOrder: digestRef,
    delegationPlan: digestRef,
    subject,
    grant,
    conditions,
    policyDecisionDigest: digest,
    validity,
    issuedBy: identity,
    /** Opaque signature string — envelope/verification is CONTRACT-002+. */
    signature: z.string().min(1),
    extensions,
  })
  .strict();

export type ExecutionPermit = z.infer<typeof executionPermit>;
