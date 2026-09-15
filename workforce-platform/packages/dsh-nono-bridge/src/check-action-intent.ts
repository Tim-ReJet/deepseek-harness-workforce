import type { ActionIntent } from "@reactorjet/workforce-contracts";
import type { CapabilityManifest } from "@workforce/permit-compiler";
import { actionIntentToCapabilities } from "./capability-map.js";

/**
 * The permit-check half of plan 16's pipeline step "ToolDefinition
 * projection → runtime ActionIntent → **permit check + nono** → tool
 * invocation" (`plans/16-mcp-tool-admission.md:251`: "The tool executor
 * does not directly call the server. It creates ActionIntent and delegates
 * to the Workforce bridge.").
 *
 * `allowed: false` always carries a `reason` and a `missingCapabilities`
 * list. `allowed: true` carries a `reason` and omits `missingCapabilities`
 * (nothing is missing).
 */
export interface CheckActionIntentResult {
  allowed: boolean;
  reason: string;
  missingCapabilities?: string[];
}

/**
 * Compares an ActionIntent's mapped capability requirements against an
 * already-compiled `CapabilityManifest` (NONO-002's `compilePermitToManifest`
 * output) and returns an explicit allow/deny.
 *
 * Pure, synchronous, in-process: no I/O, no credential, no call to nono's
 * live supervisor or to Cerbos/the Permit Issuer (D-41 local fast path —
 * once the manifest is admitted, this runs with no per-call policy round
 * trip). Fails closed in both directions:
 *
 * - An unmapped `semanticAction` (`actionIntentToCapabilities` returns
 *   `[]`) is denied, not silently allowed — an empty requirement list is
 *   never read as "requires nothing."
 * - A mapped capability the manifest does not actually grant is denied.
 *   Grant presence is read off the manifest's own sections, never assumed:
 *   `scm.repository.*`/`process.execute.*` capabilities (the two families
 *   `actionIntentToCapabilities` — and `permit-compiler`'s
 *   `grantsWorkdirAccess` — key on) are satisfied only by a `write`/
 *   `readwrite` entry in `manifest.filesystem.grants`; any other capability
 *   family this bridge does not (yet) map to a filesystem grant is
 *   satisfied only by a non-`"blocked"` `manifest.network.mode` — an
 *   absent or `"blocked"` network mode never counts as granted either.
 *   `actionIntentToCapabilities` today only ever returns capabilities in
 *   the filesystem family, so the network branch is unreached in
 *   practice; it exists so a future capability family added to that
 *   mapping is denied by default here (invariant 3's "narrowest reading"),
 *   not implicitly allowed because this function had no rule for it.
 *
 * `checkActionIntent` takes no override argument and derives its decision
 * only from `manifest` and `intent` — it cannot be used to widen a
 * Workforce permit's outcome (invariant 7).
 */
export function checkActionIntent(
  intent: ActionIntent,
  manifest: CapabilityManifest,
): CheckActionIntentResult {
  const required = actionIntentToCapabilities(intent);

  if (required.length === 0) {
    return {
      allowed: false,
      reason:
        `ActionIntent semanticAction "${intent.semanticAction}" is not mapped to any nono ` +
        `capability by actionIntentToCapabilities. An unmapped semanticAction is denied, not ` +
        `treated as requiring nothing.`,
      missingCapabilities: [],
    };
  }

  const missing = required.filter((capability) => !isGrantedByManifest(capability, manifest));

  if (missing.length > 0) {
    return {
      allowed: false,
      reason:
        `ActionIntent semanticAction "${intent.semanticAction}" requires ` +
        `capabilit${missing.length === 1 ? "y" : "ies"} not granted by the compiled ` +
        `CapabilityManifest: ${missing.join(", ")}.`,
      missingCapabilities: missing,
    };
  }

  return {
    allowed: true,
    reason:
      `ActionIntent semanticAction "${intent.semanticAction}" requires ` +
      `[${required.join(", ")}], all granted by the compiled CapabilityManifest.`,
  };
}

/**
 * `scm.repository.*`/`process.execute.*` — the same two families
 * `permit-compiler`'s `grantsWorkdirAccess` keys on (documented, not a
 * private internal shape: see `capability-map.ts`'s own module doc and
 * `permit-compiler/src/index.ts`'s `grantsWorkdirAccess` doc comment).
 * Duplicated here as a prefix check rather than imported because
 * `grantsWorkdirAccess` itself is not exported from `@workforce/permit-compiler`.
 */
function isWorkdirCapability(capability: string): boolean {
  return capability.startsWith("scm.repository.") || capability.startsWith("process.execute.");
}

function isGrantedByManifest(capability: string, manifest: CapabilityManifest): boolean {
  if (isWorkdirCapability(capability)) {
    return Boolean(
      manifest.filesystem?.grants.some(
        (grant) => grant.access === "write" || grant.access === "readwrite",
      ),
    );
  }

  return manifest.network?.mode !== undefined && manifest.network.mode !== "blocked";
}
