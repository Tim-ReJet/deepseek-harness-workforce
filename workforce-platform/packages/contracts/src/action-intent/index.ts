/**
 * workforce.action-intent/v1 — the runtime intent a DSH tool-call captures
 * before it can be turned into a nono capability grant. Plan 15's Effect
 * Gateway pipeline is `ActionIntent → Effect Normalizer → EffectIntent →
 * Permit and Tool Admission checks → Effect Ledger → provider+nono →
 * EffectReceipt`; only `ActionIntent` (the first stage) is shipped here.
 * `EffectIntent`/`EffectReceipt` are later units — not defined in this
 * package.
 *
 * This is a runtime/session-boundary type, not a signed top-level V2
 * artifact: it is intentionally NOT registered in
 * `packages/contracts/scripts/generate-json-schema.ts` /
 * `ARTIFACT_SCHEMAS` / `conformance.test.ts`.
 */
import { z } from "zod";
import { digest } from "../common/digest.js";
import { rfc3339 } from "../common/time.js";
import { id } from "../common/ids.js";

export const ACTION_INTENT_SCHEMA = "workforce.action-intent/v1" as const;

/**
 * Minimal reference to the resource a semantic action targets, e.g. a
 * repository or a process. Inlined here rather than in a shared type
 * package — nothing else in the repo consumes this shape yet.
 */
const resourceRef = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

/**
 * Minimal reference to the tool binding that is about to execute the
 * intent. Inlined here for the same reason as `resourceRef`.
 */
const toolBindingRef = z
  .object({
    toolName: z.string().min(1),
    version: z.string().min(1).optional(),
  })
  .strict();

export const actionIntent = z
  .object({
    schema: z.literal(ACTION_INTENT_SCHEMA),
    id,
    workOrderId: id,
    runId: id,
    cellId: id,
    taskId: id,
    /** DSH-side semantic action label, e.g. "scm.repository.write". */
    semanticAction: z.string().min(1),
    target: resourceRef,
    parameters: z.record(z.unknown()),
    toolBinding: toolBindingRef,
    createdAt: rfc3339,
    digest,
  })
  .strict();

export type ActionIntent = z.infer<typeof actionIntent>;
