/**
 * artifact-digest.test.ts — CONTRACT-002's "compute/verify the `digest`
 * field for WorkOrder and the four Workforce artifacts" requirement,
 * exercised against the real pack example fixtures.
 *
 * The committed fixtures under `fixtures/*.json` carry placeholder digests
 * (`sha256:0000...`, `sha256:1111...`, ...) copied verbatim from the pack's
 * `examples/` — they are unsigned drafts, not artifacts this unit re-signs.
 * Rather than rewrite five cross-referencing fixtures' digests (WorkOrder's
 * real digest would ripple into every artifact that references it by
 * digest), this test recomputes each fixture's real digest and proves the
 * helper is correct end-to-end on real artifact shapes: deterministic,
 * order-independent, and self-consistent via `verifyArtifactDigest`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DIGEST_REGEX, computeArtifactDigest, verifyArtifactDigest } from "./common/digest.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

describe("artifact digest helpers over real fixtures", () => {
  it.each([
    "workorder.json",
    "delegation-plan.json",
    "execution-permit.json",
    "provisioning-spec.json",
    "validation-spec.json",
    "run-manifest.json",
  ])("%s: recomputed digest is a valid sha256 digest, deterministic, and self-verifies once applied", (file) => {
    const fixture = loadFixture(file);

    const digestOnce = computeArtifactDigest(fixture);
    const digestTwice = computeArtifactDigest(fixture);
    expect(digestOnce).toMatch(DIGEST_REGEX);
    expect(digestOnce).toBe(digestTwice); // deterministic

    // The committed fixture's digest is a placeholder — it must not verify
    // against the real payload (it is an unsigned draft, per this unit's
    // brief).
    expect(verifyArtifactDigest(fixture as Record<string, unknown> & { digest: string })).toBe(
      false,
    );

    // Substituting the recomputed digest makes the artifact self-consistent.
    const withRealDigest = { ...fixture, digest: digestOnce };
    expect(
      verifyArtifactDigest(withRealDigest as Record<string, unknown> & { digest: string }),
    ).toBe(true);
  });

  it("digest is independent of the artifact's own top-level key order", () => {
    const fixture = loadFixture("workorder.json");
    const reversedKeys = Object.fromEntries(Object.entries(fixture).reverse());
    expect(computeArtifactDigest(fixture)).toBe(computeArtifactDigest(reversedKeys));
  });

  it("digest changes if any non-digest/signature field changes", () => {
    const fixture = loadFixture("execution-permit.json");
    const tampered = {
      ...fixture,
      grant: { ...(fixture.grant as Record<string, unknown>), delegationDepthRemaining: 99 },
    };
    expect(computeArtifactDigest(fixture)).not.toBe(computeArtifactDigest(tampered));
  });

  it("digest is unaffected by changing the signature field alone (ExecutionPermit)", () => {
    const fixture = loadFixture("execution-permit.json");
    const resigned = { ...fixture, signature: "a-totally-different-signature" };
    expect(computeArtifactDigest(fixture)).toBe(computeArtifactDigest(resigned));
  });

  it("evidence-index.json: computeArtifactDigest is deterministic and order-independent (EvidenceIndex has no self digest field — rootDigest commits over referenced evidence, not the document itself)", () => {
    const fixture = loadFixture("evidence-index.json");
    const reversedKeys = Object.fromEntries(Object.entries(fixture).reverse());
    const digestOnce = computeArtifactDigest(fixture);
    expect(digestOnce).toMatch(DIGEST_REGEX);
    expect(digestOnce).toBe(computeArtifactDigest(fixture)); // deterministic
    expect(digestOnce).toBe(computeArtifactDigest(reversedKeys)); // order-independent
  });
});
