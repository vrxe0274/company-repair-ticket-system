export const emptyItem = () => ({ id: crypto.randomUUID(), description: '', amount: '' })
export const peso      = n  => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

export function sumItems(items) {
  return items.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0)
}

export function computeQuotation(laborItems, partsItems, discount) {
  return Math.max(0, sumItems(laborItems) + sumItems(partsItems) - (parseFloat(discount) || 0))
}
