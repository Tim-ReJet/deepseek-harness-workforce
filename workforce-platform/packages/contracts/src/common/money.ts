/**
 * money.ts — money is always an integer amount in minor units plus an
 * ISO-4217 currency code. Never a float, never a major-unit decimal string.
 */
import { z } from "zod";

/** ISO-4217 currency code (3 uppercase letters). */
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO-4217 currency code");
export type CurrencyCode = z.infer<typeof currencyCode>;

/** Non-negative integer amount in the currency's minor units (e.g. cents). */
export const minorUnits = z
  .number()
  .int("amounts are in integer minor units")
  .nonnegative("amounts cannot be negative");
export type MinorUnits = z.infer<typeof minorUnits>;

/** Generic Money value object: {currency, amountMinorUnits}. */
export const money = z
  .object({
    currency: currencyCode,
    amountMinorUnits: minorUnits,
  })
  .strict();
export type Money = z.infer<typeof money>;

/** A spend cap, as carried by WorkOrder.resources.budget and permit grants. */
export const budget = z
  .object({
    currency: currencyCode,
    capMinorUnits: minorUnits,
  })
  .strict();
export type Budget = z.infer<typeof budget>;
