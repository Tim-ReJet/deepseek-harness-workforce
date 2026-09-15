import { describe, expect, it } from "vitest";
import { InMemoryEffectRegistry } from "./registry.js";
import type { EffectDefinition } from "./index.js";

function makeDefinition(overrides: Partial<EffectDefinition> = {}): EffectDefinition {
  return {
    schema: "workforce.effect-definition/v1",
    name: "scm.branch.push",
    version: 1,
    category: "mutation",
    inputSchema: {
      digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
    requiredCapabilities: ["scm.branch.push"],
    defaultRiskClass: "C2",
    idempotency: "gateway-key",
    reversibility: "conditional",
    requiredEvidence: [],
    ...overrides,
  };
}

describe("InMemoryEffectRegistry", () => {
  it("registers and retrieves a definition by name/version", () => {
    const registry = new InMemoryEffectRegistry();
    const definition = makeDefinition();
    registry.register(definition);
    expect(registry.get("scm.branch.push", 1)).toEqual(definition);
  });

  it("returns undefined for an unknown name/version", () => {
    const registry = new InMemoryEffectRegistry();
    expect(registry.get("scm.branch.push", 1)).toBeUndefined();
  });

  it("throws on a duplicate (name, version) registration", () => {
    const registry = new InMemoryEffectRegistry();
    registry.register(makeDefinition());
    expect(() => registry.register(makeDefinition())).toThrow();
  });

  it("allows a new version of an already-registered name", () => {
    const registry = new InMemoryEffectRegistry();
    registry.register(makeDefinition());
    expect(() => registry.register(makeDefinition({ version: 2 }))).not.toThrow();
    expect(registry.list()).toHaveLength(2);
  });

  it("lists all registered definitions", () => {
    const registry = new InMemoryEffectRegistry();
    registry.register(makeDefinition());
    registry.register(makeDefinition({ name: "scm.pull_request.create" }));
    expect(registry.list()).toHaveLength(2);
  });
});
