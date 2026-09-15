/**
 * workforce.effect-intent/v1 — the normalized, validated effect a Cell is
 * about to authorize/reserve (plan 15's `EffectIntent`). `actionIntent` is
 * a plain `digestRef` here: this slice does not depend on BRIDGE-001's
 * (unmerged) `ActionIntent` type, only on its content-addressed reference.
 *
 * Naming note: `effectClass` here is a dotted effect *type id* string
 * (e.g. `scm.branch.push`), matching `execution-permit`'s
 * `grant.effects[].effectClass: z.string()` — not the ADR-007 `C0`–`C4`
 * risk-tier axis (`EffectDefinition.defaultRiskClass` in
 * `effect-definition/index.ts`). Same field name, deliberately different
 * meaning; see that module's header comment for the full collision note.
 */
import { z } from "zod";
import { digestRef, digest } from "../common/digest.js";
import { id } from "../common/ids.js";
import { effectDefinitionReversibility } from "../effect-definition/index.js";

export const EFFECT_INTENT_SCHEMA = "workforce.effect-intent/v1" as const;

const effectIntentTarget = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
    version: z.string().optional(),
  })
  .strict();

export const effectIntent = z
  .object({
    schema: z.literal(EFFECT_INTENT_SCHEMA),
    id,
    actionIntent: digestRef,
    /** Dotted effect type id — see header comment. */
    effectClass: z.string().min(1),
    effectVersion: z.number().int().positive(),
    target: effectIntentTarget,
    desiredChange: z.unknown(),
    /** No predicate language invented for this slice — opaque values. */
    preconditions: z.array(z.unknown()),
    idempotencyKey: z.string().min(1),
    reversibility: effectDefinitionReversibility,
    requiredCapabilities: z.array(z.string().min(1)),
    digest,
  })
  .strict();

export type EffectIntent = z.infer<typeof effectIntent>;
