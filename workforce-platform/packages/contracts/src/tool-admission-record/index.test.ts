import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toolAdmissionRecord } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "..", "..", "fixtures", "tool-admission-record.json"), "utf8"),
);

describe("toolAdmissionRecord", () => {
  it("round-trips the pack example fixture", () => {
    expect(toolAdmissionRecord.safeParse(fixture).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    expect(toolAdmissionRecord.safeParse({ ...fixture, unknownField: "nope" }).success).toBe(
      false,
    );
  });

  it("tolerates a namespaced extensions object", () => {
    expect(
      toolAdmissionRecord.safeParse({ ...fixture, extensions: { "mcp.registry": { x: 1 } } })
        .success,
    ).toBe(true);
  });

  it("restricts status to ADMITTED/REJECTED/REVOKED", () => {
    expect(toolAdmissionRecord.safeParse({ ...fixture, status: "PENDING" }).success).toBe(false);
  });
});
