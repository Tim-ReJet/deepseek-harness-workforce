/**
 * agent-instance — D-31 / ADR-026's "identity in Biro, contracts in
 * Workforce" split. Biro's agent directory (tenant + principal) is the
 * single identity source; this module defines the Workforce-side contracts
 * that *reference* that identity — an episodic-activation reference
 * (`AgentInstanceRef`), a task-correlation reference (`AssignmentRef`), and
 * a wire message contract (`AgentMessage`). Neither this module nor its
 * three types "holds authority" (D-31): none of them carries a
 * capability/effect/grant-shaped field, and `invariant-13.test.ts` proves
 * they are structurally unreachable from the permit-compiler and
 * authority-runtime packages.
 *
 * `AgentInstanceRef.principal` is a reference into
 * `packages/contracts/src/common/principal-ref.ts`'s `PrincipalRef` (kind
 * `"agent"`) — this is not a second identity store; `instanceId` and
 * `generation` are the episodic-activation fields ADR-026 adds on top of
 * that identity (an activation is "one episodic turn of an agent
 * instance", always executed as a Cell under an ExecutionPermit — the
 * permit, not this ref, carries the authority for that turn).
 *
 * `AssignmentRef.status` plus `AgentInstanceRef.generation` are what D-31's
 * own validation requires: "restart across generations keeps identity and
 * outstanding assignments" — a caller can tell "same instance, new
 * generation, assignment still active" by comparing an assignment's
 * `agentInstance.instanceId` (stable) against its `agentInstance.generation`
 * (bumped per activation) while `status` stays `"active"`, without losing
 * the assignment's own identity (`assignmentId`).
 *
 * `AgentMessage` deliberately excludes any delivery-mode field describing
 * *how* Biro decides to wake a recipient (ADR-026 Consequences' "two named
 * delivery modes on the existing `wakeRecipients` flag") — that flag lives
 * in Biro's `agent_wakeup_requests`/`agent_messages` tables, is this
 * task's explicit non-goal repository, and is a Biro-side wake-decision
 * detail, not a field of the wire message contract Workforce defines here.
 * `deliveryStatus` models the message's own delivery lifecycle
 * (pending/delivered/read/failed), which is a distinct concern this
 * package does own.
 */
import { z } from "zod";
import { principalRef } from "../common/principal-ref.js";
import { artifactRef } from "../common/artifact-ref.js";
import { rfc3339 } from "../common/time.js";
import { id } from "../common/ids.js";

export const AGENT_INSTANCE_REF_SCHEMA = "workforce.agent-instance-ref/v1" as const;
export const ASSIGNMENT_REF_SCHEMA = "workforce.assignment-ref/v1" as const;
export const AGENT_MESSAGE_SCHEMA = "workforce.agent-message/v1" as const;

// ---------------------------------------------------------------------------
// AgentInstanceRef
// ---------------------------------------------------------------------------

/**
 * A reference into Biro's agent identity (tenant + principal) plus the
 * episodic-activation fields ADR-026 requires on top of it. `instanceId` is
 * the stable, persistent handle across restarts; `generation` increments
 * per activation (episodic execution); `activatedAt` is when this
 * generation began. Carries no capability/effect/grant field — an
 * activation's authority lives in its `ExecutionPermit`, never here.
 */
export const agentInstanceRef = z
  .object({
    schema: z.literal(AGENT_INSTANCE_REF_SCHEMA),
    /** Reference into Biro's identity source, narrowed to kind "agent". */
    principal: principalRef.extend({ kind: z.literal("agent") }),
    /** Stable across restarts/generations — the persistent instance handle. */
    instanceId: id,
    /** Bumped per episodic activation. Zero-based, monotonic per instance. */
    generation: z.number().int().nonnegative(),
    /** When this generation was activated. */
    activatedAt: rfc3339,
  })
  .strict();
export type AgentInstanceRef = z.infer<typeof agentInstanceRef>;

// ---------------------------------------------------------------------------
// AssignmentRef
// ---------------------------------------------------------------------------

/**
 * Task correlation for one agent instance's outstanding piece of work.
 * References a WorkOrder and a task-level correlation id; carries an
 * `ownerPrincipal` for ownership-change tracking (D-31's "ownership
 * change" field). Carries no capability/effect/grant field — an
 * assignment can be revoked, but revoking it does not itself narrow or
 * widen any permit; the permit is the sole authority artifact.
 */
export const assignmentRef = z
  .object({
    schema: z.literal(ASSIGNMENT_REF_SCHEMA),
    assignmentId: id,
    agentInstance: agentInstanceRef,
    workOrderId: id,
    taskCorrelationId: id,
    status: z.enum(["active", "completed", "revoked"]),
    /** Who currently owns this assignment — reassignable over time. */
    ownerPrincipal: principalRef,
  })
  .strict();
export type AssignmentRef = z.infer<typeof assignmentRef>;

// ---------------------------------------------------------------------------
// AgentMessage
// ---------------------------------------------------------------------------

/**
 * The wire contract for one inter-agent-instance message. A message,
 * mention, routine, or handoff can wake an agent instance; it cannot grant
 * it authority (Invariant 13) — this shape deliberately carries no
 * capability/effect/permit field of any kind, only identity references
 * (sender/recipient), correlation (threadId), delivery lifecycle
 * (deliveryStatus), and payload references a receiving Cell is *already*
 * permitted to fetch (permittedPayloadRefs — the permitting happens
 * elsewhere, at the receiving Cell's own ExecutionPermit; this field is
 * not itself a grant, just a list of `ArtifactRef`s the sender attached).
 */
export const agentMessage = z
  .object({
    schema: z.literal(AGENT_MESSAGE_SCHEMA),
    messageId: id,
    threadId: id,
    sender: agentInstanceRef,
    recipient: agentInstanceRef,
    sentAt: rfc3339,
    deliveryStatus: z.enum(["pending", "delivered", "read", "failed"]),
    permittedPayloadRefs: z.array(artifactRef),
  })
  .strict();
export type AgentMessage = z.infer<typeof agentMessage>;

/**
 * Field names that would make any of these three types authority-bearing
 * (D-31: "neither holds authority"). Used by `index.test.ts` to assert the
 * absence is enforced mechanically, not just by design intention, and
 * mirrored by a grep in `invariant-13.test.ts`'s own self-check.
 */
export const DISALLOWED_AUTHORITY_FIELDS = [
  "capabilities",
  "capability",
  "effects",
  "effect",
  "grant",
  "permit",
  "permission",
  "authority",
  "scope",
] as const;
