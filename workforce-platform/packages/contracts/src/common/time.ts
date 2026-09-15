/**
 * time.ts — RFC 3339 timestamps with an explicit offset. Consistent with the
 * pack decision to require an offset (a naive local timestamp is not
 * defensible in a signed, cross-tenant audit trail).
 */
import { z } from "zod";

export const RFC3339_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export const rfc3339 = z
  .string()
  .regex(RFC3339_REGEX, "must be an RFC3339 timestamp with a UTC 'Z' or numeric offset");
export type Rfc3339 = z.infer<typeof rfc3339>;
