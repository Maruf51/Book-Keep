/**
 * Format a money amount stored as an integer in the smallest currency unit
 * (cents / paisa) into a locale-aware currency string.
 *
 * @param amount  integer (e.g. 1500 = 15.00 BDT)
 * @param currency ISO 4217 currency code (default BDT)
 */
export function formatMoney(amount: number, currency = "BDT"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount / 100);
}