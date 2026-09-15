import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionIntent, ExecutionPermit } from "@reactorjet/workforce-contracts";
import { compilePermitToManifest } from "@workforce/permit-compiler";
import { actionIntentToCapabilities } from "./capability-map.js";

const here = dirname(fileURLToPath(import.meta.url));

const executionPermitFixture: ExecutionPermit = JSON.parse(
  readFileSync(
    join(here, "..", "..", "contracts", "fixtures", "execution-permit.json"),
    "utf8",
  ),
);

const actionIntentFixture: ActionIntent = JSON.parse(
  readFileSync(join(here, "..", "..", "contracts", "fixtures", "action-intent.json"), "utf8"),
);

describe("actionIntent -> capabilities -> compilePermitToManifest round-trip", () => {
  it("grants filesystem access when the fixture ActionIntent's semanticAction is scm.repository.write", () => {
    expect(actionIntentFixture.semanticAction).toBe("scm.repository.write");

    const capabilities = actionIntentToCapabilities(actionIntentFixture);
    expect(capabilities).toEqual(["scm.repository.write"]);

    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: { ...executionPermitFixture.grant, capabilities },
    };

    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });

    expect(manifest.filesystem?.grants).toEqual([
      { path: "/tmp/bridge-001", access: "readwrite", type: "directory" },
    ]);
  });

  it("does not invent a filesystem grant when the semanticAction is unknown", () => {
    const unknownIntent: ActionIntent = {
      ...actionIntentFixture,
      semanticAction: "service.production.deploy",
    };

    const capabilities = actionIntentToCapabilities(unknownIntent);
    expect(capabilities).toEqual([]);

    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: { ...executionPermitFixture.grant, capabilities },
    };

    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });

    expect(manifest.filesystem).toBeUndefined();
  });
});
