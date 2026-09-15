import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EffectLedger } from "../effect-ledger/ledger.js";
import { operationEnvelope } from "../operation-envelope/index.js";
import type { EffectIntent } from "../effect-intent/index.js";
import type { ExecutionPermit } from "../execution-permit/index.js";
import type { ToolAdmissionRecord } from "../tool-admission-record/index.js";
import {
  EffectClassNotAdmittedError,
  EffectClassNotGrantedError,
  EffectGateway,
  ExecutionPermitExpiredError,
} from "./gateway.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, "..", "..", "fixtures", `${name}.json`), "utf8")) as T;
}

const NOW = new Date("2026-08-28T09:00:00Z");

function makeFixtures() {
  const effectIntent = loadFixture<EffectIntent>("effect-intent");
  const executionPermit = loadFixture<ExecutionPermit>("execution-permit");
  const toolAdmission = loadFixture<ToolAdmissionRecord>("tool-admission-record");

  // The stock fixtures don't share an effect class with each other (they
  // come from independent artifact examples) — align them here so the
  // happy path exercises a permit/admission/intent triple that actually
  // grants the effect being requested.
  executionPermit.grant.effects = [
    { effectClass: effectIntent.effectClass, target: "github://acme/biro" },
  ];
  toolAdmission.effectClasses = [effectIntent.effectClass];

  return { effectIntent, executionPermit, toolAdmission };
}

describe("EffectGateway.prepare", () => {
  it("reserves a ledger row and returns a schema-valid envelope", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();

    const envelope = gateway.prepare(
      {
        effectIntent,
        executionPermit,
        toolAdmission,
        workloadIdentity: executionPermit.subject.spiffeId,
        cellGeneration: executionPermit.subject.generation,
      },
      NOW,
    );

    expect(operationEnvelope.safeParse(envelope).success).toBe(true);
    expect(envelope.idempotencyKey).toBe(effectIntent.idempotencyKey);
    expect(envelope.effectIntent.digest).toBe(effectIntent.digest);
    expect(envelope.toolAdmission.digest).toBe(toolAdmission.digest);

    const row = ledger.getByKey(effectIntent.idempotencyKey);
    expect(row?.state).toBe("RESERVED");
  });

  it("duplicate prepare() with the same intent returns the same ledger row and envelope digest", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();

    const input = {
      effectIntent,
      executionPermit,
      toolAdmission,
      workloadIdentity: executionPermit.subject.spiffeId,
      cellGeneration: executionPermit.subject.generation,
    };

    const first = gateway.prepare(input, NOW);
    const second = gateway.prepare(input, NOW);

    expect(second.digest).toBe(first.digest);
    expect(second).toEqual(first);

    const rowsForKey = ledger.getByKey(effectIntent.idempotencyKey);
    expect(rowsForKey).toBeDefined();
  });

  it("rejects an expired execution permit before touching the ledger", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();
    const expiredNow = new Date("2099-01-01T00:00:00Z");

    expect(() =>
      gateway.prepare(
        {
          effectIntent,
          executionPermit,
          toolAdmission,
          workloadIdentity: executionPermit.subject.spiffeId,
          cellGeneration: executionPermit.subject.generation,
        },
        expiredNow,
      ),
    ).toThrow(ExecutionPermitExpiredError);

    expect(ledger.getByKey(effectIntent.idempotencyKey)).toBeUndefined();
  });

  it("rejects an effect class not granted by the permit before touching the ledger", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();
    executionPermit.grant.effects = [
      { effectClass: "some.other.effect", target: "github://acme/biro" },
    ];

    expect(() =>
      gateway.prepare(
        {
          effectIntent,
          executionPermit,
          toolAdmission,
          workloadIdentity: executionPermit.subject.spiffeId,
          cellGeneration: executionPermit.subject.generation,
        },
        NOW,
      ),
    ).toThrow(EffectClassNotGrantedError);

    expect(ledger.getByKey(effectIntent.idempotencyKey)).toBeUndefined();
  });

  it("rejects an effect class not covered by the tool admission record before touching the ledger", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();
    toolAdmission.effectClasses = ["some.other.effect"];

    expect(() =>
      gateway.prepare(
        {
          effectIntent,
          executionPermit,
          toolAdmission,
          workloadIdentity: executionPermit.subject.spiffeId,
          cellGeneration: executionPermit.subject.generation,
        },
        NOW,
      ),
    ).toThrow(EffectClassNotAdmittedError);

    expect(ledger.getByKey(effectIntent.idempotencyKey)).toBeUndefined();
  });

  it("includes effectPermit in the envelope when a step-up digest is supplied", () => {
    const ledger = new EffectLedger();
    const gateway = new EffectGateway(ledger);
    const { effectIntent, executionPermit, toolAdmission } = makeFixtures();
    const effectPermitDigest =
      "sha256:7777777777777777777777777777777777777777777777777777777777777777" as const;

    const envelope = gateway.prepare(
      {
        effectIntent,
        executionPermit,
        toolAdmission,
        effectPermitDigest,
        workloadIdentity: executionPermit.subject.spiffeId,
        cellGeneration: executionPermit.subject.generation,
      },
      NOW,
    );

    expect(envelope.effectPermit?.digest).toBe(effectPermitDigest);
  });
});
