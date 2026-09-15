import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executionProfile } from "./index.js";
import {
  buildProfileBindingExtension,
  readProfileBindingExtension,
  EXECUTION_PROFILE_EXTENSION_KEY,
} from "./binding.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = executionProfile.parse(
  JSON.parse(
    readFileSync(
      join(here, "..", "..", "fixtures", "execution-profile-bounded-operations.json"),
      "utf8",
    ),
  ),
);

describe("profile binding extension", () => {
  it("round-trips through buildProfileBindingExtension/readProfileBindingExtension", () => {
    const built = buildProfileBindingExtension(fixture);
    expect(built).toEqual({
      [EXECUTION_PROFILE_EXTENSION_KEY]: {
        profileId: "bounded-operations",
        profileVersion: 1,
      },
    });
    const readBack = readProfileBindingExtension(built);
    expect(readBack).toEqual({ profileId: "bounded-operations", profileVersion: 1 });
  });

  it("is additive: spreads alongside other namespaced extension keys without disturbing them", () => {
    const existing = { "workforce.cell": { hint: "x" } };
    const merged = { ...existing, ...buildProfileBindingExtension(fixture) };
    expect(merged["workforce.cell"]).toEqual({ hint: "x" });
    expect(readProfileBindingExtension(merged)).toEqual({
      profileId: "bounded-operations",
      profileVersion: 1,
    });
  });

  it("returns undefined (not throw) when extensions is undefined", () => {
    expect(readProfileBindingExtension(undefined)).toBeUndefined();
  });

  it("returns undefined (not throw) when extensions has no execution-profile key", () => {
    expect(readProfileBindingExtension({ "workforce.cell": { hint: "x" } })).toBeUndefined();
  });

  it("returns undefined (not throw) for a malformed/legacy-shaped entry under the key", () => {
    expect(() =>
      readProfileBindingExtension({
        [EXECUTION_PROFILE_EXTENSION_KEY]: { notAProfile: true },
      }),
    ).not.toThrow();
    expect(
      readProfileBindingExtension({
        [EXECUTION_PROFILE_EXTENSION_KEY]: { notAProfile: true },
      }),
    ).toBeUndefined();

    // Wrong types for known fields.
    expect(
      readProfileBindingExtension({
        [EXECUTION_PROFILE_EXTENSION_KEY]: { profileId: "workspace-autonomy", profileVersion: "1" },
      }),
    ).toBeUndefined();

    // Unknown profileId string (future preset this reader doesn't know yet).
    expect(
      readProfileBindingExtension({
        [EXECUTION_PROFILE_EXTENSION_KEY]: { profileId: "future-preset", profileVersion: 1 },
      }),
    ).toBeUndefined();

    // Entirely different shape (e.g. a plain string, or an array).
    expect(
      readProfileBindingExtension({ [EXECUTION_PROFILE_EXTENSION_KEY]: "not-an-object" as never }),
    ).toBeUndefined();
  });
});
