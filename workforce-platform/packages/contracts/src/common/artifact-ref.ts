/**
 * artifact-ref.ts — a fetchable-by-digest reference to any V2 artifact or
 * blob. Digest is identity; `locations` are hints only. A component that
 * fetches an artifact from any location MUST verify it against `digest`
 * before trusting it (enforced by consumers, not by this type).
 */
import { z } from "zod";
import { digest } from "./digest.js";

export const artifactRef = z
  .object({
    mediaType: z.string().min(1),
    digest,
    size: z.number().int().nonnegative().optional(),
    locations: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ArtifactRef = z.infer<typeof artifactRef>;
