import type { BoardWriteProposal, CellCoordinationBoard } from "@reactorjet/workforce-contracts";

/** Apply a validated patch; does not bump revision or recompute boardDigest. */
export function applyBoardPatch(
  board: CellCoordinationBoard,
  patch: BoardWriteProposal["patch"],
): CellCoordinationBoard {
  let tickets = [...board.tickets];
  if (patch.ticketsRemove?.length) {
    const remove = new Set(patch.ticketsRemove);
    tickets = tickets.filter((t) => !remove.has(t.id));
  }
  if (patch.ticketsUpsert?.length) {
    for (const ticket of patch.ticketsUpsert) {
      const idx = tickets.findIndex((t) => t.id === ticket.id);
      if (idx >= 0) tickets[idx] = ticket;
      else tickets.push(ticket);
    }
  }

  let residualLocks = [...(board.residualLocks ?? [])];
  if (patch.residualLocksRemove?.length) {
    const removeLocks = new Set(patch.residualLocksRemove);
    residualLocks = residualLocks.filter((l) => !removeLocks.has(l.lockToken));
  }
  if (patch.residualLocksUpsert?.length) {
    for (const lock of patch.residualLocksUpsert) {
      const idx = residualLocks.findIndex((l) => l.lockToken === lock.lockToken);
      if (idx >= 0) residualLocks[idx] = lock;
      else residualLocks.push(lock);
    }
  }

  return {
    ...board,
    tickets,
    residualLocks,
    pathMirror: board.pathMirror,
  };
}
