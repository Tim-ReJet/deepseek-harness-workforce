/**
 * workorder/v1 — Canonical Biro↔Workforce seam protocol.
 *
 * This is the contract-first A2A protocol described in Fable 5 §3.
 * Biro (control plane) issues WorkOrders. Workforce (execution plane)
 * executes them and returns Evidence Bundles. The seam is carried over
 * Agentgateway A2A but the contract is typed, versioned, and
 * schema-validated — never freeform prose.
 *
 * @version 1.0.0
 * @see fable5-analysis/section-1-architecture.md §3
 */

import { z } from "zod";

// ── Primitives ──────────────────────────────────────────────────────

/** ULID — sortable, URL-safe, 26-char unique identifier. */
export const ULID = z.string().regex(/^[0-7][0-9a-hjkmnp-tv-z]{25}$/, "ULID");
export type ULID = z.infer<typeof ULID>;

/** ISO 8601 datetime string. */
export const ISODateTime = z.string().datetime();
export type ISODateTime = z.infer<typeof ISODateTime>;

/** Monetary amount in micro-units (1 = 0.000001 of the currency unit). */
export const MicroUnits = z.number().int().nonnegative();
export type MicroUnits = z.infer<typeof MicroUnits>;

// ── Intent ──────────────────────────────────────────────────────────

/** Structured goal with constraints — what the CEO agent wants built. */
export const Intent = z.object({
  /** Human-readable goal description. */
  goal: z.string().min(1),
  /** Structured constraints: tech stack, requirements, non-goals. */
  constraints: z.object({
    stack: z.string().optional(),
    requirements: z.array(z.string()).optional(),
    nonGoals: z.array(z.string()).optional(),
  }).optional(),
  /** Narrative — mandatory context; explains the "why" behind the intent. */
  narrative: z.string().min(1),
});
export type Intent = z.infer<typeof Intent>;

// ── Budget ───────────────────────────────────────────────────────────

/** Budget lease — Biro grants, Workforce enforces. */
export const BudgetLease = z.object({
  /** Cap in micro-units. Workforce must not exceed this. */
  cap: MicroUnits,
  /** ISO 4217 currency code. */
  currency: z.string().length(3).default("USD"),
  /** Lease expiry. Workforce must not start work after this. */
  expiry: ISODateTime,
});
export type BudgetLease = z.infer<typeof BudgetLease>;

// ── Policy ───────────────────────────────────────────────────────────

/** Compliance regime reference. */
export const ComplianceRegime = z.enum([
  "none",
  "soc2",
  "hipaa",
  "pci",
  "gdpr",
  "fedramp",
]);

/** Policy context — tenant-level policy pack references. */
export const PolicyContext = z.object({
  /** Tenant policy pack ref (e.g. "reactorjet/prod"). */
  tenantPolicyPack: z.string().optional(),
  /** Compliance regime for this work order. */
  complianceRegime: ComplianceRegime.optional(),
});
export type PolicyContext = z.infer<typeof PolicyContext>;

// ── Golden Path ─────────────────────────────────────────────────────

/** Reference to a pre-approved golden path template. */
export const GoldenPathRef = z.object({
  /** Golden path identifier (e.g. "nextjs-neon-vercel"). */
  id: z.string(),
  /** Version of the golden path to use. */
  version: z.string().default("latest"),
});
export type GoldenPathRef = z.infer<typeof GoldenPathRef>;

// ── Approval ─────────────────────────────────────────────────────────

/** Pre-approved scope from Biro's governance gates. */
export const ApprovalToken = z.object({
  /** The plan hash this approval covers — Workforce must verify it matches. */
  plan_hash: z.string(),
  /** Who approved (board member, owner, automated gate). */
  approved_by: z.string(),
  /** When the approval was granted. */
  approved_at: ISODateTime,
  /** What scope was approved (e.g. "all", "provision_only", "up_to_staging"). */
  scope: z.string().default("all"),
});
export type ApprovalToken = z.infer<typeof ApprovalToken>;

// ── WorkOrder (Request) ─────────────────────────────────────────────

/** Mutation tier — governs how dangerous a mutation is. */
export const MutationTier = z.enum([
  "reversible",
  "conditionally_reversible",
  "irreversible",
]);

/**
 * WorkOrder — the binding artifact that crosses the Biro→Workforce seam.
 *
 * Sent from Biro's CEO agent to Workforce's lead agent via Agentgateway A2A.
 * ULID serves as the idempotency key — Workforce MUST deduplicate by id.
 */
export const WorkOrder = z.object({
  /** ULID — idempotency key. Workforce MUST reject duplicates. */
  id: ULID,
  /** Tenant identifier. */
  tenant_id: z.string().min(1),
  /** Project identifier (if scoped to a project). */
  project_id: z.string().optional(),
  /** Structured intent — what to build. */
  intent: Intent,
  /** Golden path reference (if following a template). */
  golden_path_ref: GoldenPathRef.optional(),
  /** Budget lease — the spend ceiling. */
  budget_lease: BudgetLease,
  /** Approval token — pre-approved scope from Biro's gates. */
  approval_token: ApprovalToken.optional(),
  /** Policy context — compliance regime, tenant policies. */
  policy_context: PolicyContext.optional(),
  /** A2A address of the issuing CEO agent (for lifecycle callbacks). */
  callback: z.string().optional(),
  /** Priority (lower = higher priority). */
  priority: z.number().int().min(0).default(100),
  /** Deadline — after which Workforce should escalate rather than execute. */
  deadline: ISODateTime.optional(),
});
export type WorkOrder = z.infer<typeof WorkOrder>;

// ── Lifecycle Milestones ────────────────────────────────────────────

/**
 * Execution status — Workforce's internal lifecycle milestones
 * that cross the seam back to Biro.
 */
export const ExecutionStatus = z.enum([
  "PLANNED",      // Plan + cost estimate + mutation-tier summary returned BEFORE apply
  "APPLYING",     // Execution in progress
  "VERIFIED",     // All gates passed, evidence collected
  "COMPENSATION_ISSUED",  // Rollback requested, compensation in progress
  "COMPENSATION_CONFIRMED", // Rollback complete, state restored
  "ROLLED_BACK",  // Execution rolled back successfully
  "FAILED",       // Execution failed — no recovery
]);

/** Progress event — streaming update during execution. */
export const ProgressEvent = z.object({
  workorder_id: ULID,
  status: ExecutionStatus,
  /** Human-readable description of current activity. */
  message: z.string(),
  /** Timestamp of this event. */
  timestamp: ISODateTime,
  /** Optional detail payload. */
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

// ── Revenue & Marketplace ────────────────────────────────────────────

/** Marketplace intent embedded in WorkOrder — deploy/list/update/remove an agent. */
export const MarketplaceIntent = z.object({
  action: z.enum(["deploy", "list", "update", "remove"]),
  agentId: z.string().min(1),
  marketplaceId: z.string().optional(),
  listingUrl: z.string().url().optional(),
});
export type MarketplaceIntent = z.infer<typeof MarketplaceIntent>;

/** Billing intent embedded in WorkOrder — products, prices, attribution, sync. */
export const BillingIntent = z.object({
  action: z.enum(["create_product", "create_price", "attribute_revenue", "sync_customer"]),
  provider: z.string().min(1),
  productId: z.string().optional(),
  priceId: z.string().optional(),
  customerId: z.string().optional(),
});
export type BillingIntent = z.infer<typeof BillingIntent>;

/** Marketplace listing — evidence of an agent published to a marketplace. */
export const MarketplaceListing = z.object({
  listingUrl: z.string().url(),
  marketplaceId: z.string().min(1),
  agentId: z.string().min(1),
  status: z.enum(["published", "pending", "rejected", "removed"]),
  listedAt: ISODateTime,
  updatedAt: ISODateTime.optional(),
});
export type MarketplaceListing = z.infer<typeof MarketplaceListing>;

/** Revenue actuals — revenue generated by a deployed agent. */
export const RevenueActuals = z.object({
  agentId: z.string().min(1),
  periodStart: ISODateTime,
  periodEnd: ISODateTime,
  amountMinorUnits: MicroUnits,
  currency: z.string().length(3).default("USD"),
  source: z.string().min(1),
});
export type RevenueActuals = z.infer<typeof RevenueActuals>;

/** Customer attribution — linking a payment to an agent. */
export const CustomerAttribution = z.object({
  paymentId: z.string().min(1),
  customerId: z.string().min(1),
  agentId: z.string().min(1),
  amountMinorUnits: MicroUnits,
  currency: z.string().length(3).default("USD"),
  attributedAt: ISODateTime,
});
export type CustomerAttribution = z.infer<typeof CustomerAttribution>;

// ── Evidence (Response) ─────────────────────────────────────────────

/** A single piece of evidence (test result, scan output, deployment URL). */
export const EvidenceItem = z.object({
  /** Evidence kind (e.g. "test", "scan", "deploy_url", "screenshot"). */
  kind: z.string(),
  /** Evidence label. */
  label: z.string(),
  /** Evidence value (URL, hash, result string). */
  value: z.string(),
  /** When this evidence was collected. */
  collected_at: ISODateTime,
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/** Cost actual — line-item spend against the budget lease. */
export const CostActual = z.object({
  /** What the spend was for (e.g. "anthropic_claude_codegen", "neon_branch"). */
  category: z.string(),
  /** Amount in micro-units. */
  amount: MicroUnits,
  /** Currency. */
  currency: z.string().length(3).default("USD"),
  /** Provider invoice/transaction reference. */
  reference: z.string().optional(),
});
export type CostActual = z.infer<typeof CostActual>;

/** Audit chain segment — hash-chained for integrity. */
export const AuditChainSegment = z.object({
  /** Previous segment hash (null for first segment). */
  previous_hash: z.string().nullable(),
  /** This segment's hash. */
  segment_hash: z.string(),
  /** The WorkOrder id this segment belongs to. */
  workorder_id: ULID,
  /** When this segment was created. */
  created_at: ISODateTime,
});
export type AuditChainSegment = z.infer<typeof AuditChainSegment>;

/** Rollback manifest — what can and cannot be undone. */
export const RollbackManifest = z.object({
  /** Compensation actions available. */
  compensations: z.array(z.object({
    action: z.string(),
    /** What resource this compensation targets. */
    target: z.string(),
    /** Whether this compensation is reversible. */
    reversible: z.boolean(),
  })),
  /** Resources that cannot be rolled back. */
  irreversible: z.array(z.string()),
});
export type RollbackManifest = z.infer<typeof RollbackManifest>;

/**
 * Evidence Bundle — the complete response from Workforce to Biro.
 *
 * Biro appends each segment to its own hash chain keyed by WorkOrder id,
 * creating a single auditable trail: intent (Biro) → decision (Biro gate)
 * → execution (Workforce) → evidence (bundle) joined on WorkOrder id.
 */
export const EvidenceBundle = z.object({
  /** The WorkOrder this evidence responds to. */
  workorder_id: ULID,
  /** Delta applied to the operational graph. */
  executed_graph_delta: z.record(z.string(), z.unknown()).optional(),
  /** Collected evidence items. */
  evidence: z.array(EvidenceItem),
  /** Line-item cost breakdown against the lease. */
  cost_actuals: z.array(CostActual),
  /** Hash-chained audit segment. */
  audit_chain_segment: AuditChainSegment,
  /** Rollback manifest — what compensation exists. */
  rollback_manifest: RollbackManifest,
  /** Marketplace listing evidence (optional — backward compatible). */
  marketplace_listings: z.array(MarketplaceListing).optional(),
  /** Revenue actuals from deployed agents (optional — backward compatible). */
  revenue_actuals: z.array(RevenueActuals).optional(),
  /** Customer attribution records (optional — backward compatible). */
  customer_attributions: z.array(CustomerAttribution).optional(),
  /** Final execution status. */
  final_status: ExecutionStatus,
  /** When execution completed. */
  completed_at: ISODateTime,
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

// ── Conformance fixtures ────────────────────────────────────────────

/** Minimum valid WorkOrder — must pass schema validation. */
export const MINIMAL_WORKORDER: WorkOrder = {
  id: "01J0000000000000000000000000" as ULID,
  tenant_id: "tenant-1",
  intent: {
    goal: "Build a task tracker",
    narrative: "We need a simple task tracking system for internal use.",
  },
  budget_lease: {
    cap: 5000000,  // $5.00 in micro-units
    currency: "USD",
    expiry: "2027-01-01T00:00:00Z",
  },
  priority: 100,
};

/** Minimum valid EvidenceBundle — for testing round-trips. */
export const MINIMAL_EVIDENCE_BUNDLE: EvidenceBundle = {
  workorder_id: "01J0000000000000000000000000" as ULID,
  evidence: [{
    kind: "test",
    label: "TypeScript typecheck passed",
    value: "0 errors",
    collected_at: "2026-07-23T00:00:00Z",
  }],
  cost_actuals: [{
    category: "anthropic_claude_codegen",
    amount: 1500000,  // $1.50
    currency: "USD",
  }],
  audit_chain_segment: {
    previous_hash: null,
    segment_hash: "test-hash-001",
    workorder_id: "01J0000000000000000000000000" as ULID,
    created_at: "2026-07-23T00:00:00Z",
  },
  rollback_manifest: {
    compensations: [{
      action: "delete_branch",
      target: "neon:br-test",
      reversible: true,
    }],
    irreversible: [],
  },
  final_status: "VERIFIED",
  completed_at: "2026-07-23T00:00:00Z",
};
