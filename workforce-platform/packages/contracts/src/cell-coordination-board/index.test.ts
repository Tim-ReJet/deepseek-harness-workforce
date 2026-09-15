import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CELL_COORDINATION_BOARD_VALIDATION_HOOKS,
  cellCoordinationBoard,
  cellCoordinationBoardValidationHook,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "cell-coordination-board.json"), "utf8"),
);

describe("cellCoordinationBoard", () => {
  it("round-trips the pack example fixture", () => {
    expect(cellCoordinationBoard.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(cellCoordinationBoard.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(
      false,
    );
  });

  it("rejects pathMirror entries that are not delegation-plan sourced", () => {
    const bad = {
      ...fixture,
      pathMirror: [{ path: "x/", ownerWorkerId: "w", source: "board" }],
    };
    expect(cellCoordinationBoard.safeParse(bad).success).toBe(false);
  });

  it("documents validation hooks from the write protocol", () => {
    expect(CELL_COORDINATION_BOARD_VALIDATION_HOOKS).toHaveLength(9);
    for (const hook of CELL_COORDINATION_BOARD_VALIDATION_HOOKS) {
      expect(cellCoordinationBoardValidationHook.safeParse(hook).success).toBe(true);
    }
  });
});
