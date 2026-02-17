export function assertLedgerId(ledgerId) {
  if (!ledgerId) {
    throw new Error('ledgerId is required')
  }
}

export function rowsOf(result) {
  return result?.values ?? []
}

export function firstRow(result) {
  return rowsOf(result)[0] ?? null
}
