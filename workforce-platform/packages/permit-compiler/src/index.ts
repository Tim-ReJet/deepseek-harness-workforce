import { executionPermit, type ExecutionPermit } from "@reactorjet/workforce-contracts";

/**
 * Hand-written minimal subset of nono's capability-manifest schema
 * (`nono/crates/nono/schema/capability-manifest.schema.json`, Draft 2020-12,
 * `version` pinned to const "0.1.0"). Only the fields this compiler emits
 * are modeled here — the full schema also allows `credentials`, `process`,
 * `resources`, and `rollback`, all `additionalProperties: true` and none
 * required. Do not codegen this from the nono JSON Schema; keep it
 * hand-written and narrow per NONO-002-scout §2/§6.
 */
export interface CapabilityManifest {
  $schema: string;
  version: "0.1.0";
  filesystem?: {
    grants: Array<{
      path: string;
      access: "read" | "write" | "readwrite";
      type?: "file" | "directory";
    }>;
  };
  network?: {
    mode: "blocked" | "proxy" | "unrestricted";
    /**
     * Domains allowed through the nono proxy (nono's `Network.allow_domains`,
     * `nono-workforce/crates/nono/schema/capability-manifest.schema.json`).
     * Only meaningful when `mode` is `"proxy"` — omitted for `"blocked"`.
     * Required whenever `mode` is `"proxy"`: nono's own manifest-to-sandbox
     * wiring (`nono-cli/src/sandbox_prepare.rs` around the manifest branch)
     * sets `profile_network_block: false` for a manifest-sourced network
     * policy, so an empty `allow_domains` under `mode: "proxy"` falls
     * through to `ProxyFilter::allow_all()` in `nono-proxy/src/server.rs`
     * (ordinary, non-strict allowlist construction: empty allowed_hosts ->
     * allow_all) — ie. "proxy" with no domains listed is NOT narrower than
     * unrestricted, it silently *is* unrestricted. `allow_domains` must
     * always name the same destinations the permit actually granted, never
     * more, so mode alone can never widen access beyond the grant.
     */
    allow_domains?: string[];
  };
}

export interface CompilePermitOptions {
  /**
   * Stopgap parameter: ExecutionPermit carries no filesystem path field at
   * all, so the caller must supply the workdir the compiler should grant
   * filesystem access to. A future ProvisioningSpec-aware version should
   * replace this with a permit/spec-derived path instead of a caller arg.
   */
  workdir: string;
}

const CAPABILITY_MANIFEST_SCHEMA_URI =
  "https://nono.sh/schemas/capability-manifest.schema.json";

/**
 * Capabilities that imply readwrite filesystem access to the workdir. This
 * is deliberately the single mapping rule for the first ship — the pack
 * plan's fuller input set (ProvisioningSpec, admitted runtime/tool
 * descriptors, workload/platform facts, base profile, `requiredIsolation`,
 * `stepUpRequiredFor`, `evidenceObligations`, effects/budget/delegation
 * depth) is intentionally NOT consumed yet. See NONO-002-scout §1/§4/§6.
 */
function grantsWorkdirAccess(capabilities: readonly string[]): boolean {
  return capabilities.some(
    (capability) =>
      capability.startsWith("scm.repository.") ||
      capability.startsWith("process.execute."),
  );
}

/**
 * Capability families this compiler has *any* enforcement rule for today,
 * even where that rule adds nothing beyond the `scm.repository.*`
 * filesystem grant `grantsWorkdirAccess` already produces (`scm.branch.*`,
 * `scm.pull_request.*` — their credential-route/network handling is
 * SECRET-001/SECRET-002's concern, out of scope here per this task's
 * packet). Broader than `grantsWorkdirAccess`'s own prefix check on
 * purpose: that function decides what manifest section to emit, this one
 * decides whether the compiler has a rule for a capability at all.
 *
 * A capability matching neither family is one this compiler cannot map to
 * an enforceable manifest rule — D-33 (plans/30-open-decisions.md#D-33)
 * and plan 05's "fail if a requested guarantee cannot be enforced"
 * compiler invariant require that to surface as a distinguishable,
 * testable `UNENFORCEABLE` outcome, not be silently dropped.
 */
const KNOWN_CAPABILITY_PREFIXES = ["scm.", "process.execute."] as const;

function isKnownCapability(capability: string): boolean {
  return KNOWN_CAPABILITY_PREFIXES.some((prefix) => capability.startsWith(prefix));
}

/**
 * Thrown when `ExecutionPermit.grant.capabilities` contains a capability
 * this compiler has no enforcement rule for at all. Deliberately a plain
 * typed `Error` subclass (not a new Result/error-hierarchy type) so
 * `compilePermitToManifest`'s success-path return type and existing call
 * sites (dsh-nono-bridge) stay unchanged — this package's one other
 * failure mode (a malformed permit) already fails by throwing, so this
 * follows the same style. `outcome` uses D-33's enforcement-coverage
 * vocabulary (`ENFORCED | REQUIRES_STRONGER_ENVIRONMENT | UNENFORCEABLE`);
 * this compiler only ever produces `UNENFORCEABLE` — the other two values
 * describe a runtime placement decision this pure function does not make.
 */
export class UnenforceableCapabilityError extends Error {
  readonly outcome = "UNENFORCEABLE" as const;
  readonly capabilities: readonly string[];

  constructor(capabilities: readonly string[]) {
    super(
      `ExecutionPermit requests ${capabilities.length === 1 ? "a capability" : "capabilities"} ` +
        `with no enforceable manifest rule: ${capabilities.join(", ")}`,
    );
    this.name = "UnenforceableCapabilityError";
    this.capabilities = capabilities;
  }
}

/**
 * Resolves the nono `network` manifest section from what the permit
 * actually grants.
 *
 * Keys off `grant.networkAccess` (CONTRACT-004,
 * `packages/contracts/src/execution-permit/index.ts`) exclusively — the one
 * field the contracts schema defines to mean "genuine outbound-network
 * destination", distinct from `grant.capabilities`
 * (`scm.*`/`process.execute.*`) and `grant.effects[].effectClass` (scoped
 * SCM/process operations with their own credential-route shape, not raw
 * network egress; SECRET-001/SECRET-002's concern). Absent or empty
 * `networkAccess` compiles to `{ mode: "blocked" }`, matching CONTRACT-004's
 * own documented equivalence and this compiler's pre-existing fail-closed
 * default.
 *
 * A present, non-empty `networkAccess` array compiles to `mode: "proxy"`
 * *with* `allow_domains` set to exactly the permit's own destinations —
 * never `"unrestricted"`, and never `"proxy"` with `allow_domains` omitted.
 * The latter matters operationally, not just stylistically: nono's
 * manifest-sourced sandbox prep (`nono-cli/src/sandbox_prepare.rs`) sets
 * `profile_network_block: false` for a manifest-driven network policy, and
 * `nono-proxy/src/server.rs`'s filter construction falls back to
 * `ProxyFilter::allow_all()` whenever `allowed_hosts` is empty, regardless
 * of `strict_filter`. So `{ mode: "proxy" }` with no domains listed does not
 * mean "narrower than unrestricted" the way it would for an OS-level
 * capability — it silently *compiles to* unrestricted proxy egress. Listing
 * every granted destination in `allow_domains` is what keeps
 * `HostFilter::check_host` (`nono/src/net_filter.rs`) enforcing the
 * allowlist regardless of `strict_filter`'s value (non-empty allowed_hosts
 * filters unconditionally; `strict` only changes empty-allowlist behavior).
 *
 * Monotonic by construction: the only way to get anything but
 * `{ mode: "blocked" }` out is for the permit to explicitly grant at least
 * one network destination in the one field defined for that purpose, and
 * the emitted `allow_domains` is exactly that destination list — never a
 * superset, never inferred from any other field.
 */
function resolveNetwork(
  networkAccess: ExecutionPermit["grant"]["networkAccess"],
): CapabilityManifest["network"] {
  if (networkAccess === undefined || networkAccess.length === 0) {
    return { mode: "blocked" };
  }
  return {
    mode: "proxy",
    allow_domains: networkAccess.map((grant) => grant.destination),
  };
}

/**
 * Compiles an ExecutionPermit into a nono capability-manifest.
 *
 * Reads only `grant.capabilities`, `grant.effects`, and
 * `grant.networkAccess`. Emits `version`/`$schema` always, and one
 * `filesystem.grants` entry when a `scm.repository.*` or
 * `process.execute.*` capability is present. `network` is derived by
 * `resolveNetwork` from `grant.networkAccess` alone (`mode: "proxy"` with
 * matching `allow_domains` when non-empty, `mode: "blocked"` otherwise — see
 * that function's doc comment).
 * Omits `credentials`, `resources`, and `rollback` entirely — nothing in
 * the permit is mapped to them yet, and the manifest schema allows
 * omitting everything but `version`.
 *
 * Fails closed (throws `UnenforceableCapabilityError`) when a requested
 * capability matches no family this compiler has any rule for, per D-33's
 * enforcement-coverage invariant — it never silently drops an unmappable
 * requirement.
 *
 * Pure function: deterministic and monotonic (only ever adds grants
 * derived directly from present capabilities/effects, never wider than
 * the permit).
 */
export function compilePermitToManifest(
  permit: ExecutionPermit,
  options: CompilePermitOptions,
): CapabilityManifest {
  const parsed = executionPermit.parse(permit);

  const unenforceable = parsed.grant.capabilities.filter(
    (capability) => !isKnownCapability(capability),
  );
  if (unenforceable.length > 0) {
    throw new UnenforceableCapabilityError(unenforceable);
  }

  const manifest: CapabilityManifest = {
    $schema: CAPABILITY_MANIFEST_SCHEMA_URI,
    version: "0.1.0",
    network: resolveNetwork(parsed.grant.networkAccess),
  };

  if (grantsWorkdirAccess(parsed.grant.capabilities)) {
    manifest.filesystem = {
      grants: [
        {
          path: options.workdir,
          access: "readwrite",
          type: "directory",
        },
      ],
    };
  }

  return manifest;
}
