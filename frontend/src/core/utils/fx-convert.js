/**
 * Single source of truth for cross-currency minor-unit conversion.
 * Used by exchange-rate.service (transaction input), account-group-summary,
 * and asset totals. Lives in core/ so domain math never imports ui/.
 */

export function normalizeFxCurrencyCode(value, fallback = 'TWD') {
  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === 'NTD') return 'TWD'
  if (raw === 'RMB') return 'CNY'
  if (/^[A-Z]{3}$/.test(raw)) return raw
  return fallback
}

export function resolveCrossExchangeRate(rates, fromCurrency, toCurrency) {
  const from = normalizeFxCurrencyCode(fromCurrency, 'TWD')
  const to = normalizeFxCurrencyCode(toCurrency, 'TWD')
  if (from === to) return 1

  const fromPerUsd = Number(rates?.[from])
  const toPerUsd = Number(rates?.[to])
  if (!Number.isFinite(fromPerUsd) || fromPerUsd <= 0) return null
  if (!Number.isFinite(toPerUsd) || toPerUsd <= 0) return null
  return toPerUsd / fromPerUsd
}

export function convertAmountMinorByRate(amountMinor, rate) {
  const amount = Math.abs(Math.round(Number(amountMinor) || 0))
  const numericRate = Number(rate)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(numericRate) || numericRate <= 0) return 0
  return Math.round(amount * numericRate)
}

export function convertBalanceToTargetCurrency(balanceMinor, account, targetCurrencyCode, rates) {
  const amountMinor = Math.round(Number(balanceMinor) || 0)
  const accountCurrencyCode = normalizeFxCurrencyCode(account?.currency_code, targetCurrencyCode)
  const normalizedTargetCurrencyCode = normalizeFxCurrencyCode(targetCurrencyCode, accountCurrencyCode)
  if (accountCurrencyCode === normalizedTargetCurrencyCode) return amountMinor

  const rate = resolveCrossExchangeRate(rates, accountCurrencyCode, normalizedTargetCurrencyCode)
  if (!rate) return amountMinor
  const convertedMagnitude = convertAmountMinorByRate(amountMinor, rate)
  return amountMinor < 0 ? convertedMagnitude * -1 : convertedMagnitude
}
