import { describe, expect, it } from "vitest";
import type { BoardWriteProposal } from "@reactorjet/workforce-contracts";
import { commitBoardWrite } from "./commit.js";
import { coldStartVerifyBoard, initializeBoardFromDelegationPlan } from "./board-store.js";
import { computeBoardDigest } from "./board-digest.js";
import { gateOwnedPathWrite } from "./owned-paths.js";
import { sealedDelegationPlanFixture } from "./test-fixtures.js";

const planFixture = sealedDelegationPlanFixture();

describe("cell coordination board runtime", () => {
  it("rejects cold start when boardDigest mismatches", () => {
    const board = initializeBoardFromDelegationPlan({
      id: "01JBOARD00000000000000000001",
      cellId: "01JCELL",
      runId: "01JRUN00000000000000000001",
      sealedDelegationPlan: planFixture,
    });
    const tampered = {
      ...board,
      boardDigest: `sha256:${"b".repeat(64)}`,
    };
    const result = coldStartVerifyBoard(tampered, planFixture);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("boardDigest mismatch");
  });

  it("rejects pathMirror mutation relative to sealed DelegationPlan", () => {
    const board = initializeBoardFromDelegationPlan({
      id: "01JBOARD00000000000000000001",
      cellId: "01JCELL",
      runId: "01JRUN00000000000000000001",
      sealedDelegationPlan: planFixture,
    });
    const tampered = {
      ...board,
      pathMirror: [{ path: "packages/other/", ownerWorkerId: "worker-api", source: "delegation-plan" as const }],
      boardDigest: computeBoardDigest({
        ...board,
        pathMirror: [{ path: "packages/other/", ownerWorkerId: "worker-api", source: "delegation-plan" as const }],
      }),
    };
    const result = coldStartVerifyBoard(tampered, planFixture);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.hook).toBe("pathMirrorImmutable");
  });

  it("denies filesystem writes off ownedPaths even when a board ticket hints the path", () => {
    const gate = gateOwnedPathWrite({
      delegationPlan: planFixture,
      workerId: "worker-web",
      relativePath: "packages/api/src/index.ts",
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("board cannot override");
  });

  it("rejects wake-only admission from committing", () => {
    const board = initializeBoardFromDelegationPlan({
      id: "01JBOARD00000000000000000001",
      cellId: "01JCELL",
      runId: "01JRUN00000000000000000001",
      sealedDelegationPlan: planFixture,
    });
    const result = commitBoardWrite({
      admission: { kind: "wake", wakeRef: "a2a-msg-01" },
      board,
      sealedDelegationPlan: planFixture,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.hook).toBe("wakeInvariant");
  });

  it("commits a valid proposal and bumps revision with consistent boardDigest", () => {
    const board = initializeBoardFromDelegationPlan({
      id: "01JBOARD00000000000000000001",
      cellId: "01JCELL",
      runId: "01JRUN00000000000000000001",
      sealedDelegationPlan: planFixture,
    });
    const proposal: BoardWriteProposal = {
      proposalId: "prop-1",
      proposer: { agentInstanceId: "01JAGENTAPI", workerId: "worker-api" },
      proposedAt: "2026-09-14T12:00:00Z",
      expectedRevision: 1,
      delegationPlanDigest: planFixture.digest,
      patch: {
        ticketsUpsert: [
          {
            id: "ticket-1",
            title: "API work",
            status: "in_progress",
            priority: 1,
            assignee: { agentInstanceId: "01JAGENTAPI", workerId: "worker-api" },
            ownedPathHints: ["packages/api/"],
          },
        ],
      },
    };
    const result = commitBoardWrite({
      admission: { kind: "proposal", proposal },
      board,
      sealedDelegationPlan: planFixture,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextBoard.revision).toBe(2);
      expect(result.nextBoard.tickets).toHaveLength(1);
      expect(result.nextBoard.boardDigest).toBe(computeBoardDigest(result.nextBoard));
    }
  });

  it("rejects proposals with revision mismatch", () => {
    const board = initializeBoardFromDelegationPlan({
      id: "01JBOARD00000000000000000001",
      cellId: "01JCELL",
      runId: "01JRUN00000000000000000001",
      sealedDelegationPlan: planFixture,
    });
    const proposal: BoardWriteProposal = {
      proposalId: "prop-stale",
      proposer: { agentInstanceId: "01JAGENTAPI", workerId: "worker-api" },
      proposedAt: "2026-09-14T12:00:00Z",
      expectedRevision: 99,
      delegationPlanDigest: planFixture.digest,
      patch: { ticketsUpsert: [] },
    };
    const result = commitBoardWrite({
      admission: { kind: "proposal", proposal },
      board,
      sealedDelegationPlan: planFixture,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.hook).toBe("revisionMatch");
  });
});
