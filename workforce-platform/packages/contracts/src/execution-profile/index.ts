/**
 * workforce.execution-profile/v1 — the three named presets from
 * POSTURE_REALIGNMENT_PLAN.md §4 ("Permission breadth and assurance
 * strength are independent"): Workspace autonomy, Bounded operations, High
 * assurance. Plan §4's own framing: "Use three starting presets composed
 * from the same existing contracts. These are conveniences, not separate
 * products or a new hierarchy of authority."
 *
 * This schema deliberately carries no `capabilities`/`effects`/`grant`/
 * `permissions` field. Plan §4: "The effective permission set comes from
 * organizational policy, the WorkOrder, its delegation chain, and current
 * grants—not the preset's name." An ExecutionProfile names a bundle of
 * prose execution-experience/acceptance-behavior description only; it is
 * never itself an authority source, and selecting one grants nothing by
 * itself (see execution-permit/index.ts for the actual grant shape).
 *
 * `profileVersion` exists so "profile versions and resolved obligations are
 * stored with the run" (plan §4) and historical results retain their
 * original verification meaning even if a preset's description is revised
 * later (plan §4: "historical results retain their original verification
 * meaning").
 */
import { z } from "zod";

export const EXECUTION_PROFILE_SCHEMA = "workforce.execution-profile/v1" as const;

/** Closed set — a caller cannot invent a fourth undocumented preset. */
export const PROFILE_IDS = ["workspace-autonomy", "bounded-operations", "high-assurance"] as const;
export const profileId = z.enum(PROFILE_IDS);
export type ProfileId = z.infer<typeof profileId>;

export const executionProfile = z
  .object({
    schema: z.literal(EXECUTION_PROFILE_SCHEMA),
    profileId,
    /** Positive, monotonically-assigned per profileId — see doc comment above. */
    profileVersion: z.number().int().positive(),
    /** Plan §4 table, "Execution experience" column, copied verbatim. */
    executionExperience: z.string().min(1),
    /** Plan §4 table, "Acceptance behavior" column, copied verbatim. */
    acceptanceBehavior: z.string().min(1),
  })
  .strict();

export type ExecutionProfile = z.infer<typeof executionProfile>;
