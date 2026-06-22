export const emptyItem = () => ({ id: crypto.randomUUID(), description: '', amount: '' })
export const peso      = n  => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

export function sumItems(items) {
  return items.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0)
}

/**
 * Resolve a manual discount percentage to a peso amount off `base`.
 * Percent is clamped to 0–100. Returns a value rounded to 2 decimals.
 */
export function discountAmount(base, percent) {
  const pct = Math.min(100, Math.max(0, parseFloat(percent) || 0))
  return Math.round(base * (pct / 100) * 100) / 100
}

/**
 * Quotation total = (labor + parts) minus a manual discount percentage.
 * `discountPercent` is a percent (e.g. 10 = 10% off), not a peso amount.
 */
export function computeQuotation(laborItems, partsItems, discountPercent) {
  const base = sumItems(laborItems) + sumItems(partsItems)
  return Math.max(0, base - discountAmount(base, discountPercent))
}
