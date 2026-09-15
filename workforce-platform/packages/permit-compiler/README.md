# @workforce/permit-compiler

Compiles a Workforce `ExecutionPermit` into a nono capability-manifest
subset. Pure, in-process, no I/O: `compilePermitToManifest(permit, options)`
reads only `permit.grant.capabilities`, `permit.grant.effects`, and
`permit.grant.networkAccess`, and returns a `CapabilityManifest` (see
`src/index.ts` for the hand-written,
deliberately narrow TypeScript subset of nono's
`crates/nono/schema/capability-manifest.schema.json`).

This is NONO-002's batch-2 slice: the smallest compiler that admits an
ordinary Batch-2 task (POSTURE_REALIGNMENT_PLAN.md §5.1), not plan 05's
fuller compiler (ProvisioningSpec, admitted runtime/tool descriptors,
workload/platform facts, base profile, credential routes, resource limits,
trust policy, audit/rollback — all later, separately-owned slices).

## What is mapped today

| Input | Manifest effect |
|---|---|
| Any `scm.repository.*` or `process.execute.*` capability present | `filesystem.grants = [{ path: options.workdir, access: "readwrite", type: "directory" }]` |
| Any capability matching `scm.*` or `process.execute.*` | Recognized ("known") — enforceable, does not throw |
| Any other capability | **Unenforceable** — throws `UnenforceableCapabilityError` (D-33 `UNENFORCEABLE` outcome), fail-closed rather than silently dropped |

`scm.branch.*` and `scm.pull_request.*` are recognized ("known") but do not
themselves add anything beyond the `scm.repository.*` filesystem grant —
their credential-route/network handling belongs to SECRET-001/SECRET-002,
not this compiler.

Additionally:

| Input | Manifest effect |
|---|---|
| `grant.networkAccess` present and non-empty | `network = { mode: "proxy", allow_domains: [...] }` |
| `grant.networkAccess` absent or `[]` | `network = { mode: "blocked" }` |

`network` is derived from `grant.networkAccess`
(`packages/contracts/src/execution-permit/index.ts`, CONTRACT-004) alone —
never from `grant.capabilities` or `grant.effects`, which mean SCM/process
operations, not network egress (Invariant 3/7: no inference of a wider
grant than the permit's one field defined for this purpose expresses).
`network.mode` is never `"unrestricted"` from this compiler (nono defaults
an *omitted* `network` to `"unrestricted"`, so this compiler always emits
an explicit `network` block to avoid that trap).

`allow_domains` is always populated (to exactly `networkAccess[].destination`,
in order, never a superset) whenever `mode` is `"proxy"`, and always omitted
for `"blocked"`. This is load-bearing, not cosmetic: nono's own
manifest-sourced sandbox prep
(`nono-workforce/crates/nono-cli/src/sandbox_prepare.rs`, the manifest
branch) sets `profile_network_block: false`, and
`nono-workforce/crates/nono-proxy/src/server.rs`'s filter construction falls
back to `ProxyFilter::allow_all()` whenever `allowed_hosts` is empty —
`strict_filter` only changes *empty*-allowlist behavior, so a bare
`{ mode: "proxy" }` with no domains listed does not compile to "narrower
than unrestricted", it compiles to unrestricted proxy egress. Nono's own
per-destination domain/endpoint matching
(`HostFilter::check_host`, `nono/src/net_filter.rs`) already exists and
enforces `allow_domains` unconditionally once it is non-empty; this
compiler's job is only to populate that field from the permit's grant, which
it now does.

## What is explicitly unmapped and fail-closed

- **Any capability outside `scm.*`/`process.execute.*`** throws
  `UnenforceableCapabilityError` rather than being silently admitted or
  silently dropped.
- **`credentials`, `resources`, `rollback`** manifest sections are always
  omitted — SECRET-001/SECRET-002 and a later slice own those.
- **`ProvisioningSpec`, admitted runtime/tool descriptors, workload/platform
  facts, base profile** are not consumed as compiler input at all (plan 05's
  fuller input list) — only `ExecutionPermit.grant` is read.

## Network mode gap (closed by CONTRACT-004, allow_domains closed on top of it)

NONO-002 batch-2's first ship flagged that no `ExecutionPermit` field meant
"this permit grants reach to an external network destination", distinct
from `grant.capabilities`/`grant.effects` — and fail-closed to always
`"blocked"` until one existed rather than inventing a string convention.
CONTRACT-004 (`packages/contracts/src/execution-permit/index.ts`) added
`grant.networkAccess: Array<{ destination: string; purpose?: string }>`
(optional, additive, `.strict()`) for exactly this. A first pass on top of
CONTRACT-004 wired `mode` to that field (present-and-non-empty → `"proxy"`,
absent-or-empty → `"blocked"`) but left `allow_domains` unset, which review
traced through nono's manifest-sourced sandbox prep and proxy filter
construction to an effective allow-all under `"proxy"` mode — wider than the
grant, not narrower (Invariant 3). `resolveNetwork` now emits
`allow_domains: networkAccess.map(g => g.destination)` alongside
`mode: "proxy"` in the same step, so the two can never drift apart.
`grant.capabilities`/`grant.effects` still never influence `network` at all
— see `resolveNetwork`'s doc comment in `src/index.ts`.

## Tests

`pnpm -F @workforce/permit-compiler test` / `... typecheck`. See
`src/compile.test.ts` — sections cover the base filesystem/network mapping
(unchanged from the first ship), the `networkAccess` → `proxy`/`blocked`
mapping above (including the shared `execution-permit-network-grant.json`
fixture, the no-inference-from-capabilities/effects guard, the
never-empty-`allow_domains`-under-`"proxy"` guard, and the
exactly-the-grant's-destinations monotonicity check for a multi-destination
grant), and the D-33 unenforceable-capability fail-closed path.
