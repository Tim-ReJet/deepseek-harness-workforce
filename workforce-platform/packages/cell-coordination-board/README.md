# @workforce/cell-coordination-board

Runtime wiring for `workforce.cell-coordination-board/v1` (ADR-029 / plan 31 SWARM-03…07).

- Persists board revisions under `{cellWorkspace}/.workforce/cell-coordination-board.json`.
- Cold-starts by verifying `boardDigest` and matching `delegationPlanDigest` to the sealed DelegationPlan.
- Runs all nine `CELL_COORDINATION_BOARD_VALIDATION_HOOKS` on propose → validate → commit.
- Filesystem writes are gated by DelegationPlan `ownedPaths` only; board tickets cannot widen path authority.
- Wake/A2A events may not commit board mutations (`wakeInvariant`).

Biro does not write the board at runtime (ADR-026 wake paths only); this package is Workforce execution-Cell scoped.

Live wiring in this repo: `providers/execution-cell-worker.ts` (board boot/commit + ActionIntent admission) and `providers/ordinary-path-launcher.ts` (`executionCell` boot before nono/DSH spawn).
