export function sumNumericValues(source) {
  if (!source || typeof source !== 'object') return 0
  return Object.values(source).reduce((total, value) => total + Number(value ?? 0), 0)
}

export function resolveInitialActiveLedgerId(ledgers = [], {
  cachedLedgerId = '',
  membershipTier = '',
} = {}) {
  const normalizedCachedLedgerId = String(cachedLedgerId ?? '').trim()
  if (membershipTier === 'free' && ledgers.length > 0) {
    return String(ledgers[0]?.id ?? '')
  }
  if (normalizedCachedLedgerId && ledgers.some((item) => String(item?.id ?? '') === normalizedCachedLedgerId)) {
    return normalizedCachedLedgerId
  }
  return String(ledgers[0]?.id ?? '')
}
