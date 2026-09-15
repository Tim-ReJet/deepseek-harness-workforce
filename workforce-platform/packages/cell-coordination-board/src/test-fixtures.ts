import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeArtifactDigest, delegationPlan, type DelegationPlan } from "@reactorjet/workforce-contracts";

const here = dirname(fileURLToPath(import.meta.url));

/** Pack delegation-plan fixture with a recomputed sealing digest for tests. */
export function sealedDelegationPlanFixture(): DelegationPlan {
  const raw = delegationPlan.parse(
    JSON.parse(readFileSync(join(here, "../../contracts/fixtures/delegation-plan.json"), "utf8")),
  );
  return { ...raw, digest: computeArtifactDigest(raw) };
}
