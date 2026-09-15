/**
 * binding.ts — pure helpers binding a resolved ExecutionProfile to a run via
 * the existing namespaced `extensions` escape hatch (common/extension.ts),
 * per plan §4: "Profile versions and resolved obligations are stored with
 * the run." This is not a core-schema change to WorkOrder or RunManifest:
 * both already carry an optional `extensions: Record<string,
 * Record<string, unknown>>` field, and these helpers only read/write one
 * namespaced key inside it.
 *
 * Additive/non-destructive by design (Invariant 17, README.md): a
 * RunManifest or WorkOrder produced before this convention existed has no
 * "workforce.execution-profile" extension entry, and `extensions` itself
 * is optional — `readProfileBindingExtension` must return `undefined`, not
 * throw, for both cases, and for any malformed/legacy-shaped entry under
 * the key, so a missing or unrecognized binding never invalidates an
 * otherwise-acceptable artifact.
 */
import { z } from "zod";
import type { Extensions } from "../common/extension.js";
import { profileId, type ExecutionProfile, type ProfileId } from "./index.js";

/** The namespaced key this binding convention writes into `extensions`. */
export const EXECUTION_PROFILE_EXTENSION_KEY = "workforce.execution-profile" as const;

export interface ProfileBinding {
  profileId: ProfileId;
  profileVersion: number;
  /** Extensions values are untyped objects (extension.ts) — see binding.ts doc comment. */
  [key: string]: unknown;
}

const profileBindingShape = z
  .object({
    profileId,
    profileVersion: z.number().int().positive(),
  })
  .strict();

/**
 * Builds the `extensions` fragment binding a resolved profile to a run.
 * Callers spread this into an artifact's existing `extensions` object
 * (e.g. `{ ...other, ...buildProfileBindingExtension(profile) }`) — it
 * never replaces the whole `extensions` object.
 */
export function buildProfileBindingExtension(
  profile: ExecutionProfile,
): Record<typeof EXECUTION_PROFILE_EXTENSION_KEY, ProfileBinding> {
  return {
    [EXECUTION_PROFILE_EXTENSION_KEY]: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
    },
  };
}

/**
 * Reads the profile binding back out of an artifact's `extensions` field.
 * Returns `undefined` — never throws — when `extensions` is absent, the
 * namespaced key is absent, or the value under that key does not match the
 * expected `{profileId, profileVersion}` shape (e.g. a future schema
 * evolution, or hand-edited data); this keeps historical artifacts
 * produced before this convention existed schema-valid and interpretable.
 */
export function readProfileBindingExtension(
  extensions: Extensions | undefined,
): ProfileBinding | undefined {
  if (!extensions) return undefined;
  const raw = extensions[EXECUTION_PROFILE_EXTENSION_KEY];
  if (raw === undefined) return undefined;
  const parsed = profileBindingShape.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
