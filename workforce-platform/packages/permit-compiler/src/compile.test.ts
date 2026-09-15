import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePermitToManifest, UnenforceableCapabilityError } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(here, "..", "..", "contracts", "fixtures", "execution-permit.json"),
    "utf8",
  ),
);

// Shared fixture, read-only per packet owned_paths — never modify this file.
const networkGrantFixture = JSON.parse(
  readFileSync(
    join(
      here,
      "..",
      "..",
      "contracts",
      "fixtures",
      "execution-permit-network-grant.json",
    ),
    "utf8",
  ),
);

describe("compilePermitToManifest", () => {
  it("emits a schema-valid manifest with version 0.1.0", () => {
    const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
    expect(manifest.version).toBe("0.1.0");
  });

  it("grants readwrite on the workdir when scm/process capabilities are present", () => {
    const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
    expect(manifest.filesystem?.grants).toEqual([
      { path: "/workspace", access: "readwrite", type: "directory" },
    ]);
  });

  it("always blocks network, and omits credentials/resources/rollback entirely", () => {
    const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
    const loose = manifest as unknown as Record<string, unknown>;
    expect(manifest.network).toEqual({ mode: "blocked" });
    expect(loose.credentials).toBeUndefined();
    expect(loose.resources).toBeUndefined();
    expect(loose.rollback).toBeUndefined();
  });

  it("keeps network blocked even when the fixture grants scm/process capabilities", () => {
    expect(fixture.grant.capabilities).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^scm\./),
        expect.stringMatching(/^process\.execute\./),
      ]),
    );
    const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
    expect(manifest.network).toEqual({ mode: "blocked" });
  });

  it("is deterministic across repeated calls", () => {
    const a = compilePermitToManifest(fixture, { workdir: "/workspace" });
    const b = compilePermitToManifest(fixture, { workdir: "/workspace" });
    expect(a).toEqual(b);
  });

  it("rejects a malformed permit", () => {
    expect(() =>
      compilePermitToManifest(
        { ...fixture, grant: undefined },
        { workdir: "/workspace" },
      ),
    ).toThrow();
  });

  describe("network mode (NONO-002 batch-2)", () => {
    it("blocks network for a permit with only known scm/process capabilities and no networkAccess (unchanged regression)", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          capabilities: ["scm.repository.read", "process.execute.development"],
          effects: [],
        },
      };
      expect(permit.grant.networkAccess).toBeUndefined();

      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network).toEqual({ mode: "blocked" });
    });

    it("still blocks network for a permit whose only effect is the fixture's scm.pull_request.create (scoped SCM op, not network egress)", () => {
      // The fixture's one effect (`scm.pull_request.create` -> a GitHub
      // resource identifier) does not, by itself, grant network reach: it
      // is a scoped SCM operation (SECRET-001/SECRET-002's credential-route
      // concern). The base fixture carries no `grant.networkAccess`, so
      // this stays blocked regardless of what `grant.effects` contains.
      expect(fixture.grant.networkAccess).toBeUndefined();
      const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
      expect(manifest.network).toEqual({ mode: "blocked" });
    });

    it("blocks network when networkAccess is present but empty (absent/empty equivalence, per CONTRACT-004)", () => {
      const permit = {
        ...fixture,
        grant: { ...fixture.grant, networkAccess: [] },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network).toEqual({ mode: "blocked" });
    });

    it("compiles to network: { mode: 'proxy', allow_domains } when the permit grants a networkAccess destination", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          networkAccess: [
            { destination: "registry.npmjs.org", purpose: "dependency installation" },
          ],
        },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network).toEqual({
        mode: "proxy",
        allow_domains: ["registry.npmjs.org"],
      });
    });

    it("compiles the shared execution-permit-network-grant.json fixture to network: { mode: 'proxy', allow_domains }", () => {
      const manifest = compilePermitToManifest(networkGrantFixture, { workdir: "/workspace" });
      expect(manifest.network).toEqual({
        mode: "proxy",
        allow_domains: ["registry.npmjs.org"],
      });
    });

    it("never emits mode: 'proxy' with allow_domains empty or absent (nono falls back to allow-all on an empty allowlist even when non-strict — an empty-domain proxy grant would be wider than the permit, not narrower)", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          networkAccess: [{ destination: "registry.npmjs.org" }],
        },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network?.mode).toBe("proxy");
      expect(manifest.network?.allow_domains).toBeDefined();
      expect(manifest.network?.allow_domains?.length).toBeGreaterThan(0);
    });

    it("emits allow_domains as exactly the permit's granted destinations, never a superset (Invariant 3: monotonic, never wider than the grant)", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          networkAccess: [
            { destination: "registry.npmjs.org", purpose: "dependency installation" },
            { destination: "pypi.org", purpose: "dependency installation" },
          ],
        },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network).toEqual({
        mode: "proxy",
        allow_domains: ["registry.npmjs.org", "pypi.org"],
      });
    });

    it("omits allow_domains when network is blocked (unchanged shape for the blocked case)", () => {
      const manifest = compilePermitToManifest(fixture, { workdir: "/workspace" });
      expect(manifest.network).toEqual({ mode: "blocked" });
      expect((manifest.network as Record<string, unknown>).allow_domains).toBeUndefined();
    });

    it("does not grant network from capabilities/effects alone, even when networkAccess is absent (Invariant 3/7: no inference)", () => {
      // Same capabilities/effects as the proxy-granting fixture above, but
      // no networkAccess field at all -> must stay blocked. Guards against
      // resolveNetworkMode ever keying off capabilities/effects instead of
      // the one field the contract defines for this purpose.
      const permit = { ...fixture };
      expect(permit.grant.capabilities.some((c: string) => c.startsWith("scm."))).toBe(true);
      expect(permit.grant.effects.length).toBeGreaterThan(0);
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network).toEqual({ mode: "blocked" });
    });

    it("never emits 'unrestricted' network mode, regardless of input", () => {
      const permit = {
        ...fixture,
        grant: { ...fixture.grant, capabilities: [], effects: [] },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network?.mode).not.toBe("unrestricted");
    });

    it("never emits 'unrestricted' even when networkAccess grants a destination", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          networkAccess: [{ destination: "registry.npmjs.org" }],
        },
      };
      const manifest = compilePermitToManifest(permit, { workdir: "/workspace" });
      expect(manifest.network?.mode).not.toBe("unrestricted");
    });
  });

  describe("unenforceable capabilities (D-33 fail-closed path)", () => {
    it("throws a typed UnenforceableCapabilityError for a capability with no mapping rule, instead of silently dropping it", () => {
      const permit = {
        ...fixture,
        grant: {
          ...fixture.grant,
          capabilities: ["scm.repository.read", "service.production.deploy"],
        },
      };

      expect(() => compilePermitToManifest(permit, { workdir: "/workspace" })).toThrow(
        UnenforceableCapabilityError,
      );

      let caught: unknown;
      try {
        compilePermitToManifest(permit, { workdir: "/workspace" });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(UnenforceableCapabilityError);
      const error = caught as UnenforceableCapabilityError;
      expect(error.outcome).toBe("UNENFORCEABLE");
      expect(error.capabilities).toEqual(["service.production.deploy"]);
    });

    it("does not compile a wider or narrower manifest before throwing for an unmappable capability", () => {
      const permit = {
        ...fixture,
        grant: { ...fixture.grant, capabilities: ["database.query.execute"] },
      };
      expect(() => compilePermitToManifest(permit, { workdir: "/workspace" })).toThrow(
        UnenforceableCapabilityError,
      );
    });

    it("accepts scm.branch.* and scm.pull_request.* as known (already present in the shared fixture)", () => {
      expect(() => compilePermitToManifest(fixture, { workdir: "/workspace" })).not.toThrow();
    });
  });
});
