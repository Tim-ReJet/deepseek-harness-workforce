import { digestOfJcs, type Digest } from "@reactorjet/workforce-contracts";
import type { CellCoordinationBoard } from "@reactorjet/workforce-contracts";

/** Board payload hashed for `boardDigest` (field commits to itself). */
export function boardPayloadForDigest(
  board: CellCoordinationBoard,
): Omit<CellCoordinationBoard, "boardDigest"> {
  const { boardDigest: _ignored, ...rest } = board;
  return rest;
}

/** Recompute `boardDigest` from every other field (RFC 8785 JCS). */
export function computeBoardDigest(board: CellCoordinationBoard): Digest {
  return digestOfJcs(boardPayloadForDigest(board));
}

export function verifyBoardDigest(board: CellCoordinationBoard): boolean {
  return board.boardDigest === computeBoardDigest(board);
}
