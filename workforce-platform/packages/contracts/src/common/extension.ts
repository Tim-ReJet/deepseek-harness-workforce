/**
 * extension.ts — the namespaced escape hatch every canonical artifact
 * carries at its top level. Provider-specific detail lives here, not in the
 * provider-neutral core (pack decision #7). Optional; consumers must
 * tolerate it being present, absent, or containing keys they don't
 * recognize — it is intentionally untyped beyond "an object of objects".
 */
import { z } from "zod";

/** `{ "<namespace>": { ...anything... } }` — optional on every artifact. */
export const extensions = z.record(z.string(), z.record(z.string(), z.unknown())).optional();
export type Extensions = z.infer<typeof extensions>;
