import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFilesystemCellBoardStore,
  initializeBoardFromDelegationPlan,
  loadBoardColdStart,
} from "./board-store.js";
import { sealedDelegationPlanFixture } from "./test-fixtures.js";

const planFixture = sealedDelegationPlanFixture();

describe("filesystem cell board store", () => {
  it("persists and cold-starts by boardDigest + delegationPlanDigest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cell-board-"));
    try {
      const store = createFilesystemCellBoardStore(dir);
      const board = initializeBoardFromDelegationPlan({
        id: "01JBOARD00000000000000000001",
        cellId: "01JCELL",
        runId: "01JRUN00000000000000000001",
        sealedDelegationPlan: planFixture,
      });
      await store.save(board);
      const loaded = await loadBoardColdStart(store, planFixture);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) expect(loaded.board.revision).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
