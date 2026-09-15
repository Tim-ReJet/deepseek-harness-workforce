import type { ActionIntent } from "@reactorjet/workforce-contracts";

/**
 * `semanticAction` prefix → nono capability strings. Deliberately
 * non-exhaustive: this table only covers the two families
 * `compilePermitToManifest`'s `grantsWorkdirAccess` already keys on
 * (`scm.repository.*`, `process.execute.*`). It is NOT a general-purpose
 * semantic-action registry — do not add `service.*`/`database.*`/etc.
 * entries here speculatively. An unmatched `semanticAction` maps to an
 * empty capability list (fail-closed: no capability is ever guessed).
 */
export function actionIntentToCapabilities(intent: ActionIntent): string[] {
  const { semanticAction } = intent;

  if (semanticAction.startsWith("scm.repository.")) {
    return [semanticAction];
  }

  if (semanticAction.startsWith("process.execute.")) {
    return ["process.execute.development"];
  }

  return [];
}
