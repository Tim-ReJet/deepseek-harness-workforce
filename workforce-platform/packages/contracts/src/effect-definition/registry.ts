/**
 * registry.ts — in-memory `EffectDefinition` registry (plan 15's "canonical
 * effect registry", schema-and-registration layer only). No I/O, no
 * Postgres: a `Map` keyed by `name@version`, standing in for a future
 * persistent registry.
 */
import type { EffectDefinition } from "./index.js";

function registryKey(name: string, version: number): string {
  return `${name}@${version}`;
}

export class InMemoryEffectRegistry {
  private readonly definitions = new Map<string, EffectDefinition>();

  /** Register a definition. Throws on a duplicate `(name, version)` pair. */
  register(definition: EffectDefinition): void {
    const key = registryKey(definition.name, definition.version);
    if (this.definitions.has(key)) {
      throw new Error(
        `EffectDefinition already registered for ${definition.name}@${definition.version}`,
      );
    }
    this.definitions.set(key, definition);
  }

  /** Look up a definition by name/version. `undefined` if not registered. */
  get(name: string, version: number): EffectDefinition | undefined {
    return this.definitions.get(registryKey(name, version));
  }

  /** All registered definitions, in registration order. */
  list(): EffectDefinition[] {
    return [...this.definitions.values()];
  }
}
