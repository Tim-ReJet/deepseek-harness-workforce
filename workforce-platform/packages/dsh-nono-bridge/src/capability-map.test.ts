import { describe, expect, it } from "vitest";
import type { ActionIntent } from "@reactorjet/workforce-contracts";
import { actionIntentToCapabilities } from "./capability-map.js";

function makeIntent(semanticAction: string): ActionIntent {
  return {
    schema: "workforce.action-intent/v1",
    id: "action-intent-01",
    workOrderId: "workorder-01",
    runId: "run-01",
    cellId: "01JCELL",
    taskId: "task-01",
    semanticAction,
    target: { type: "scm.repository", id: "github://acme/biro" },
    parameters: {},
    toolBinding: { toolName: "git" },
    createdAt: "2026-08-28T08:04:00Z",
    digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  };
}

describe("actionIntentToCapabilities", () => {
  it("maps scm.repository.* by passing the action through", () => {
    expect(actionIntentToCapabilities(makeIntent("scm.repository.write"))).toEqual([
      "scm.repository.write",
    ]);
    expect(actionIntentToCapabilities(makeIntent("scm.repository.read"))).toEqual([
      "scm.repository.read",
    ]);
  });

  it("maps process.execute.* to process.execute.development", () => {
    expect(actionIntentToCapabilities(makeIntent("process.execute.shell"))).toEqual([
      "process.execute.development",
    ]);
  });

  it("fails closed on an unknown semanticAction: empty array, no guessed grant", () => {
    expect(actionIntentToCapabilities(makeIntent("service.production.deploy"))).toEqual([]);
    expect(actionIntentToCapabilities(makeIntent("database.query"))).toEqual([]);
  });
});
