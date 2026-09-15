import type { BoardWriteProposal, CellCoordinationBoard, DelegationPlan } from "@reactorjet/workforce-contracts";
import { validateBoardCommit, type ValidationFailure, type ValidationSuccess } from "./validation-hooks.js";

/** Wake/mailbox events may schedule work; they never carry commit authority (ADR-029). */
export type BoardCommitAdmission =
  | { kind: "proposal"; proposal: BoardWriteProposal }
  | { kind: "wake"; wakeRef: string };

export type BoardCommitResult = ValidationSuccess | ValidationFailure;

/**
 * Commit a board write. Fails closed on wake-only admission (`wakeInvariant`).
 */
export function commitBoardWrite(input: {
  admission: BoardCommitAdmission;
  board: CellCoordinationBoard;
  sealedDelegationPlan: DelegationPlan;
}): BoardCommitResult {
  if (input.admission.kind === "wake") {
    return {
      ok: false,
      hook: "wakeInvariant",
      reason:
        `Wake event "${input.admission.wakeRef}" cannot commit board mutations; ` +
        `submit a BoardWriteProposal (message bodies do not widen authority).`,
    };
  }

  const validated = validateBoardCommit({
    board: input.board,
    proposal: input.admission.proposal,
    sealedDelegationPlan: input.sealedDelegationPlan,
  });
  if (!validated.ok) return validated;

  return validated;
}
