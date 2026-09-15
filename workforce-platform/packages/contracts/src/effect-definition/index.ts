/**
 * workforce.effect-definition/v1 — the canonical registry entry for one
 * external-mutation effect type (plan 15, "Canonical effect registry").
 * This is the *type definition* (e.g. `scm.branch.push`), not a single
 * in-flight effect — see `effect-intent/index.ts` for that.
 *
 * Naming note: `defaultRiskClass` is the ADR-007 `C0`–`C4` mutation-tier
 * axis already shipped as `EffectClass` in `packages/workforce-runner`. It
 * is a different field, on a different artifact, from a different axis
 * than `effectClass` on `EffectIntent` (which is a dotted effect *type id*
 * string like `scm.branch.push`, matching `execution-permit`'s
 * `grant.effects[].effectClass: z.string()`). This package intentionally
 * does not export a type named `EffectClass` to avoid shadowing the
 * ADR-007 type.
 */
import { z } from "zod";
import { digestRef } from "../common/digest.js";

export const EFFECT_DEFINITION_SCHEMA = "workforce.effect-definition/v1" as const;

/** Plan 15 effect categories. */
export const EFFECT_DEFINITION_CATEGORIES = [
  "read",
  "mutation",
  "administrative",
  "communication",
  "financial",
] as const;
export const effectDefinitionCategory = z.enum(EFFECT_DEFINITION_CATEGORIES);

/** ADR-007 mutation-risk tier — the shipped `EffectClass` axis, referenced
 * here by value only (no type import from workforce-runner). */
export const EFFECT_DEFINITION_RISK_CLASSES = ["C0", "C1", "C2", "C3", "C4"] as const;
export const effectDefinitionRiskClass = z.enum(EFFECT_DEFINITION_RISK_CLASSES);

export const EFFECT_DEFINITION_IDEMPOTENCY_MODES = [
  "provider-native",
  "gateway-key",
  "state-readback",
  "not-idempotent",
] as const;
export const effectDefinitionIdempotencyMode = z.enum(EFFECT_DEFINITION_IDEMPOTENCY_MODES);

export const EFFECT_DEFINITION_REVERSIBILITIES = [
  "reversible",
  "conditional",
  "irreversible",
] as const;
export const effectDefinitionReversibility = z.enum(EFFECT_DEFINITION_REVERSIBILITIES);

export const effectDefinition = z
  .object({
    schema: z.literal(EFFECT_DEFINITION_SCHEMA),
    /** Dotted effect type id, e.g. `scm.branch.push`. */
    name: z.string().min(1),
    version: z.number().int().positive(),
    category: effectDefinitionCategory,
    /** By-digest reference — no SchemaRef package invented for this slice. */
    inputSchema: digestRef,
    /** Capability strings — no CapabilityRef object invented for this slice. */
    requiredCapabilities: z.array(z.string().min(1)),
    defaultRiskClass: effectDefinitionRiskClass,
    idempotency: effectDefinitionIdempotencyMode,
    reversibility: effectDefinitionReversibility,
    requiredEvidence: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type EffectDefinition = z.infer<typeof effectDefinition>;
