import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workOrder } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "workorder.json"), "utf8"),
);

describe("workOrder", () => {
  it("round-trips the pack example fixture", () => {
    const result = workOrder.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown top-level key (producer-side strict parse)", () => {
    const result = workOrder.safeParse({ ...fixture, unknownField: "nope" });
    expect(result.success).toBe(false);
  });

  it("tolerates a namespaced extensions object", () => {
    const result = workOrder.safeParse({
      ...fixture,
      extensions: { "biro.dashboard": { color: "blue" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects execution-machinery fields (DSH profile, model, command, image, RuntimeClass, local path)", () => {
    const withExecutionField = (field: string) =>
      workOrder.safeParse({ ...fixture, [field]: "should-not-be-here" });

    for (const field of [
      "dshProfile",
      "model",
      "command",
      "image",
      "runtimeClass",
      "RuntimeClass",
      "localPath",
    ]) {
      expect(withExecutionField(field).success, `expected ${field} to be rejected`).toBe(false);
    }
  });

  it("has no execution-machinery keys in its own shape", () => {
    const keys = Object.keys(workOrder.shape);
    for (const forbidden of [
      "dshProfile",
      "model",
      "command",
      "image",
      "runtimeClass",
      "RuntimeClass",
      "localPath",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
