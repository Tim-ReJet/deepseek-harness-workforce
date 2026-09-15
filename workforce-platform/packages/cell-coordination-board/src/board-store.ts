import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CELL_COORDINATION_BOARD_SCHEMA,
  cellCoordinationBoard,
  verifyArtifactDigest,
  type CellCoordinationBoard,
  type CellCoordinationBoardValidationHook,
  type DelegationPlan,
} from "@reactorjet/workforce-contracts";
import { computeBoardDigest, verifyBoardDigest } from "./board-digest.js";
import { pathMirrorFromDelegationPlan, pathMirrorMatchesDelegationPlan } from "./path-mirror.js";

export const CELL_BOARD_RELATIVE_PATH = ".workforce/cell-coordination-board.json";

export type ColdStartFailure = {
  ok: false;
  hook: CellCoordinationBoardValidationHook | "store";
  reason: string;
};

export type ColdStartSuccess = { ok: true; board: CellCoordinationBoard };

export type ColdStartResult = ColdStartSuccess | ColdStartFailure;

/** Initialize an empty board revision 1 from a sealed DelegationPlan. */
export function initializeBoardFromDelegationPlan(input: {
  id: string;
  cellId: string;
  runId: string;
  sealedDelegationPlan: DelegationPlan;
}): CellCoordinationBoard {
  if (!verifyArtifactDigest(input.sealedDelegationPlan)) {
    throw new Error("initializeBoardFromDelegationPlan: DelegationPlan digest mismatch");
  }
  const pathMirror = pathMirrorFromDelegationPlan(input.sealedDelegationPlan);
  const withoutDigest: CellCoordinationBoard = {
    schema: CELL_COORDINATION_BOARD_SCHEMA,
    id: input.id,
    cellId: input.cellId,
    runId: input.runId,
    delegationPlanDigest: input.sealedDelegationPlan.digest,
    boardDigest: input.sealedDelegationPlan.digest,
    revision: 1,
    pathMirror,
    tickets: [],
    residualLocks: [],
    pendingProposals: [],
  };
  return {
    ...withoutDigest,
    boardDigest: computeBoardDigest(withoutDigest),
  };
}

/** Verify persisted board against sealed DelegationPlan (cold start). */
export function coldStartVerifyBoard(
  board: CellCoordinationBoard,
  sealedDelegationPlan: DelegationPlan,
): ColdStartResult {
  const parsed = cellCoordinationBoard.safeParse(board);
  if (!parsed.success) {
    return { ok: false, hook: "schemaStrict", reason: parsed.error.message };
  }
  const value = parsed.data;
  if (!verifyBoardDigest(value)) {
    return { ok: false, hook: "schemaStrict", reason: "boardDigest mismatch on load" };
  }
  if (!verifyArtifactDigest(sealedDelegationPlan)) {
    return { ok: false, hook: "planDigestMatch", reason: "Sealed DelegationPlan digest invalid" };
  }
  if (value.delegationPlanDigest !== sealedDelegationPlan.digest) {
    return {
      ok: false,
      hook: "planDigestMatch",
      reason: "Board delegationPlanDigest does not match sealed DelegationPlan",
    };
  }
  if (!pathMirrorMatchesDelegationPlan(value.pathMirror, sealedDelegationPlan)) {
    return {
      ok: false,
      hook: "pathMirrorImmutable",
      reason: "Board pathMirror does not match sealed DelegationPlan workers",
    };
  }
  return { ok: true, board: value };
}

export interface CellBoardStore {
  load(): Promise<CellCoordinationBoard | null>;
  save(board: CellCoordinationBoard): Promise<void>;
  boardFilePath(): string;
}

/** Filesystem-backed board store under the execution Cell workspace root. */
export function createFilesystemCellBoardStore(cellWorkspaceDir: string): CellBoardStore {
  const boardFilePath = () => join(cellWorkspaceDir, CELL_BOARD_RELATIVE_PATH);

  return {
    boardFilePath,
    async load() {
      try {
        const raw = await readFile(boardFilePath(), "utf8");
        const json: unknown = JSON.parse(raw);
        const parsed = cellCoordinationBoard.safeParse(json);
        if (!parsed.success) return null;
        return parsed.data;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async save(board) {
      const path = boardFilePath();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(board, null, 2)}\n`, "utf8");
    },
  };
}

export async function loadBoardColdStart(
  store: CellBoardStore,
  sealedDelegationPlan: DelegationPlan,
): Promise<ColdStartResult> {
  const loaded = await store.load();
  if (!loaded) {
    return { ok: false, hook: "store", reason: "No board revision persisted in Cell workspace" };
  }
  return coldStartVerifyBoard(loaded, sealedDelegationPlan);
}
