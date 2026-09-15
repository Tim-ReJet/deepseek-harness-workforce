// Functional schemas (camelCase) — the canonical workorder/v1 protocol.
export * from "./workorder.js";
export * from "./approval.js";
export * from "./events.js";
export * from "./evidence.js";
export * from "./hash.js";
export * from "./common.js";
export * from "./state-machine.js";
export * from "./a2a-projection.js";

// Conformance fixtures (snake_case variants) — keep for migrated consumers.
export {
  ULID as ULID_ALT,
  type ULID as ULID_ALT_TYPE,
  ISODateTime as ISODateTime_ALT,
  type ISODateTime as ISODateTime_ALT_TYPE,
  MINIMAL_WORKORDER,
  MINIMAL_EVIDENCE_BUNDLE,
} from "./schemas.js";
