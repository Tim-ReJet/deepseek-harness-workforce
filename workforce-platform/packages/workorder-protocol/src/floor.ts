/**
 * Minimum Biro build the current workorder/v1 protocol surface supports.
 *
 * Raising this is the deliberate escape hatch for a BREAKING protocol change:
 * `scripts/check-workorder-contract-snapshot.ts --update` refuses to accept a
 * breaking regeneration unless this value rose. Bumping it is a statement that
 * already-deployed Biro instances must be redeployed before they will work
 * against this Workforce.
 *
 * Additive changes (new exports, new optional fields) never need a bump.
 */
export const WORKORDER_PROTOCOL_FLOOR = "1.0.0";
