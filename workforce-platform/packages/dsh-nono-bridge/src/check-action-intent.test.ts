import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionIntent, ExecutionPermit } from "@reactorjet/workforce-contracts";
import { compilePermitToManifest } from "@workforce/permit-compiler";
import { checkActionIntent } from "./check-action-intent.js";

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

describe("checkActionIntent", () => {
  it("allows when the compiled manifest grants the intent's required capability", () => {
    expect(actionIntentFixture.semanticAction).toBe("scm.repository.write");

    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: {
        ...executionPermitFixture.grant,
        capabilities: ["scm.repository.write"],
      },
    };
    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });

    const result = checkActionIntent(actionIntentFixture, manifest);

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("scm.repository.write");
    expect(result.missingCapabilities).toBeUndefined();
  });

  it("denies when the manifest does not grant the required capability (fully closed manifest: no filesystem grant, network.mode blocked)", () => {
    // Permit grants capabilities outside the scm.repository.*/process.execute.*
    // workdir family and no networkAccess, so compilePermitToManifest emits no
    // filesystem section and network.mode stays "blocked" (resolveNetwork's
    // fail-closed default) -- a manifest that grants nothing the fixture
    // ActionIntent (scm.repository.write) needs.
    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: {
        ...executionPermitFixture.grant,
        capabilities: ["scm.branch.push", "scm.pull_request.create"],
      },
    };
    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });
    expect(manifest.filesystem).toBeUndefined();
    expect(manifest.network).toEqual({ mode: "blocked" });

    const result = checkActionIntent(actionIntentFixture, manifest);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("scm.repository.write");
    expect(result.missingCapabilities).toEqual(["scm.repository.write"]);
  });

  it("denies an unmapped semanticAction instead of implicitly allowing an empty requirement list", () => {
    const unknownIntent: ActionIntent = {
      ...actionIntentFixture,
      semanticAction: "service.production.deploy",
    };

    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: {
        ...executionPermitFixture.grant,
        capabilities: ["scm.repository.write", "process.execute.development"],
      },
    };
    // Even a maximally permissive manifest must not rescue an unmapped action.
    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });
    expect(manifest.filesystem).toBeDefined();

    const result = checkActionIntent(unknownIntent, manifest);

    expect(result.allowed).toBe(false);
    expect(result.missingCapabilities).toEqual([]);
    expect(result.reason).toContain("service.production.deploy");
    expect(result.reason).toContain("not mapped");
  });

  it("denies scm.repository.write when the manifest's filesystem grant is read-only", () => {
    const manifest = {
      $schema: "https://nono.sh/schemas/capability-manifest.schema.json",
      version: "0.1.0" as const,
      filesystem: {
        grants: [{ path: "/tmp/bridge-001", access: "read" as const, type: "directory" as const }],
      },
      network: { mode: "blocked" as const },
    };

    const result = checkActionIntent(actionIntentFixture, manifest);

    expect(result.allowed).toBe(false);
    expect(result.missingCapabilities).toEqual(["scm.repository.write"]);
  });

  it("allows process.execute.* when the manifest grants readwrite filesystem access", () => {
    const processIntent: ActionIntent = {
      ...actionIntentFixture,
      semanticAction: "process.execute.shell",
    };

    const permit: ExecutionPermit = {
      ...executionPermitFixture,
      grant: {
        ...executionPermitFixture.grant,
        capabilities: ["process.execute.development"],
      },
    };
    const manifest = compilePermitToManifest(permit, { workdir: "/tmp/bridge-001" });

    const result = checkActionIntent(processIntent, manifest);

    expect(result.allowed).toBe(true);
  });
});
