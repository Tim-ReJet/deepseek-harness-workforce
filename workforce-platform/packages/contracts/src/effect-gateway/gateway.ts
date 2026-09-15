/**
 * `EffectGateway.prepare()` — plan 15's "Reservation transaction" steps
 * 1-9, narrowed to this slice's in-memory subset (see effect-ledger's
 * header comment for the same scoping). Validates the caller-supplied
 * `ExecutionPermit`/`ToolAdmissionRecord` against the `EffectIntent`,
 * reserves a row in EFFECT-001's `EffectLedger`, and returns a
 * schema-valid `OperationEnvelope` binding the intent to its authority.
 *
 * Deliberately out of scope (plan 15 step 10 onward / PROVIDER-002):
 * `execute()`, `readBack()`, `compensate()`, any `EffectProvider`, nono,
 * Postgres. No signature/JWT/PKI verification — permit/admission trust is
 * assumed to have already been established by whoever handed these
 * artifacts to the gateway; `prepare()` only checks expiry and effect-class
 * binding, both pure data comparisons.
 */
import { computeArtifactDigest, type Digest, type DigestRef } from "../common/digest.js";
import type { EffectIntent } from "../effect-intent/index.js";
import type { ExecutionPermit } from "../execution-permit/index.js";
import type { ToolAdmissionRecord } from "../tool-admission-record/index.js";
import { operationEnvelope, type OperationEnvelope } from "../operation-envelope/index.js";
import { EffectLedger } from "../effect-ledger/ledger.js";

/** Thrown when `executionPermit.validity.expiresAt` has already passed `now`. */
export class ExecutionPermitExpiredError extends Error {
  constructor(expiresAt: string, now: Date) {
    super(
      `EffectGateway: execution permit expired at ${expiresAt} (now: ${now.toISOString()})`,
    );
    this.name = "ExecutionPermitExpiredError";
  }
}

/** Thrown when the intent's effect class is not covered by the permit's grant. */
export class EffectClassNotGrantedError extends Error {
  constructor(effectClass: string) {
    super(
      `EffectGateway: execution permit does not grant effect class "${effectClass}"`,
    );
    this.name = "EffectClassNotGrantedError";
  }
}

/** Thrown when the intent's effect class is not covered by the admitted tool. */
export class EffectClassNotAdmittedError extends Error {
  constructor(effectClass: string) {
    super(
      `EffectGateway: tool admission does not cover effect class "${effectClass}"`,
    );
    this.name = "EffectClassNotAdmittedError";
  }
}

export interface PrepareInput {
  effectIntent: EffectIntent;
  executionPermit: ExecutionPermit;
  toolAdmission: ToolAdmissionRecord;
  /** Step-up permit reference, if this effect class required one — a plain digest, not a resolved artifact. */
  effectPermitDigest?: Digest;
  workloadIdentity: string;
  cellGeneration: number;
}

/**
 * `EffectGateway` wraps one `EffectLedger` instance (in-memory,
 * per-process — see `effect-ledger/ledger.ts`) and exposes the
 * `prepare()` half of plan 15's reservation transaction.
 */
export class EffectGateway {
  constructor(private readonly ledger: EffectLedger) {}

  /**
   * Validate permit expiry and effect-class grant/admission, reserve a
   * ledger row keyed by the intent's `idempotencyKey`, and return the
   * resulting `OperationEnvelope`. A repeat call with the same
   * `effectIntent`/permit/admission (same idempotency key and identical
   * envelope-relevant fields) reserves no new row and returns an envelope
   * with the same digest — the idempotent-replay case falls out of
   * `EffectLedger.reserve()`.
   *
   * Throws before touching the ledger on: expired permit, effect class not
   * granted by the permit, or effect class not covered by the tool
   * admission record.
   */
  prepare(input: PrepareInput, now: Date): OperationEnvelope {
    const { effectIntent, executionPermit, toolAdmission, effectPermitDigest, workloadIdentity, cellGeneration } =
      input;

    if (new Date(executionPermit.validity.expiresAt).getTime() <= now.getTime()) {
      throw new ExecutionPermitExpiredError(executionPermit.validity.expiresAt, now);
    }

    const grantedEffectClasses = new Set(
      executionPermit.grant.effects.map((effect) => effect.effectClass),
    );
    if (!grantedEffectClasses.has(effectIntent.effectClass)) {
      throw new EffectClassNotGrantedError(effectIntent.effectClass);
    }

    if (!toolAdmission.effectClasses.includes(effectIntent.effectClass)) {
      throw new EffectClassNotAdmittedError(effectIntent.effectClass);
    }

    const row = this.ledger.reserve({
      effectId: effectIntent.id,
      idempotencyKey: effectIntent.idempotencyKey,
      requestDigest: effectIntent.digest,
      ownerFence: cellGeneration,
    });

    const executionPermitDigest = computeArtifactDigest(executionPermit);

    const envelopeBody: Omit<OperationEnvelope, "digest"> = {
      schema: "workforce.operation-envelope/v1",
      id: `envelope-${row.idempotencyKey}`,
      effectIntent: { digest: effectIntent.digest } satisfies DigestRef,
      executionPermit: { digest: executionPermitDigest } satisfies DigestRef,
      ...(effectPermitDigest ? { effectPermit: { digest: effectPermitDigest } } : {}),
      toolAdmission: { digest: toolAdmission.digest } satisfies DigestRef,
      workloadIdentity,
      cellGeneration,
      idempotencyKey: row.idempotencyKey,
      expiresAt: executionPermit.validity.expiresAt,
    };

    const envelope: OperationEnvelope = {
      ...envelopeBody,
      digest: computeArtifactDigest(envelopeBody),
    };

    return operationEnvelope.parse(envelope);
  }
}
