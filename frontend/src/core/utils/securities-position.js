/**
 * Pure securities position / value helpers (no DB).
 * v2: supports funds-only rows, settlement-status filtering, unrealized market|cost modes.
 */

import {
  normalizeRecordMode,
  normalizeSettlementStatus,
  normalizeUnrealizedMode,
  RECORD_MODE,
  SETTLEMENT_STATUS,
  UNREALIZED_MODE,
} from './securities-settlement.js'

export function normalizeSecurityTxType(value) {
  return String(value ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
}

export function summarizeSecurityTransactions(transactions = [], { includeScheduled = false } = {}) {
  let quantity = 0
  let investedMinor = 0
  const rows = Array.isArray(transactions) ? transactions : []

  for (const tx of rows) {
    if (tx?.deleted_at) continue
    const status = normalizeSettlementStatus(tx?.settlement_status ?? SETTLEMENT_STATUS.confirmed)
    if (status === SETTLEMENT_STATUS.cancelled) continue
    if (status === SETTLEMENT_STATUS.scheduled && !includeScheduled) continue
    if (status !== SETTLEMENT_STATUS.confirmed && status !== SETTLEMENT_STATUS.scheduled) continue

    const mode = normalizeRecordMode(tx?.record_mode)
    const type = normalizeSecurityTxType(tx?.type)
    const qty = Math.max(0, Math.trunc(Number(tx?.quantity ?? 0)))
    const principal = Math.max(0, Math.round(Number(tx?.principal_minor ?? 0)))
    const priceMinor = Math.max(0, Math.round(Number(tx?.price_minor ?? 0)))
    const feeMinor = Math.max(0, Math.round(Number(tx?.fee_minor ?? 0)))

    if (type === 'buy') {
      if (mode === RECORD_MODE.position && qty > 0) quantity += qty
      const buyPrincipal = principal > 0
        ? principal
        : (qty > 0 ? qty * priceMinor + feeMinor : 0)
      investedMinor += buyPrincipal
    } else {
      if (mode === RECORD_MODE.position && qty > 0) quantity -= qty
      const sellPrincipal = principal > 0
        ? principal
        : (qty > 0 ? Math.max(0, qty * priceMinor - feeMinor) : 0)
      investedMinor -= sellPrincipal
    }
  }

  return {
    quantity: Math.max(0, quantity),
    investedMinor: Math.max(0, investedMinor),
  }
}

export function averageCostMinor(investedMinor, quantity) {
  const qty = Math.trunc(Number(quantity ?? 0))
  const invested = Math.max(0, Math.round(Number(investedMinor ?? 0)))
  if (qty <= 0) return 0
  return Math.round(invested / qty)
}

export function resolveSecurityPriceMinor(security = {}, options = {}) {
  const source = String(security?.price_source ?? 'manual').trim().toLowerCase() || 'manual'
  // Phase 2+: branch on source === 'api'
  void source
  const manual = Math.max(0, Math.round(Number(security?.manual_price_minor ?? 0)))
  if (manual > 0) return manual
  return Math.max(0, Math.round(Number(options.fallbackPriceMinor ?? 0)))
}

function valueForMode({ quantity, investedMinor, marketValueMinor, unrealizedMode }) {
  if (unrealizedMode === UNREALIZED_MODE.cost) return Math.max(0, investedMinor)
  if (quantity > 0) return Math.max(0, marketValueMinor > 0 ? marketValueMinor : investedMinor)
  return Math.max(0, investedMinor)
}

export function buildSecurityPosition(security, transactions = [], options = {}) {
  const unrealizedMode = normalizeUnrealizedMode(options.unrealizedMode ?? UNREALIZED_MODE.market)
  // Visible holdings include scheduled (T+2) so the UI does not show $0 / 0股
  // right after a buy. Confirmed-only values feed total assets to avoid
  // double-counting cash that has not left the settlement account yet.
  const visible = summarizeSecurityTransactions(transactions, { includeScheduled: true })
  const confirmed = summarizeSecurityTransactions(transactions, { includeScheduled: false })
  const priceMinor = resolveSecurityPriceMinor(security, {
    fallbackPriceMinor: averageCostMinor(visible.investedMinor, visible.quantity),
  })
  const confirmedPriceMinor = resolveSecurityPriceMinor(security, {
    fallbackPriceMinor: averageCostMinor(confirmed.investedMinor, confirmed.quantity),
  })
  const quantity = visible.quantity
  const investedMinor = visible.investedMinor
  const marketValueMinor = quantity > 0 ? quantity * priceMinor : 0
  const confirmedMarketValueMinor = confirmed.quantity > 0
    ? confirmed.quantity * confirmedPriceMinor
    : 0
  const displayValueMinor = valueForMode({
    quantity,
    investedMinor,
    marketValueMinor,
    unrealizedMode,
  })
  const includedValueMinor = valueForMode({
    quantity: confirmed.quantity,
    investedMinor: confirmed.investedMinor,
    marketValueMinor: confirmedMarketValueMinor,
    unrealizedMode,
  })
  const deltaMinor = unrealizedMode === UNREALIZED_MODE.cost
    ? 0
    : marketValueMinor - investedMinor

  return {
    securityId: security?.id ?? null,
    settlementAccountId: security?.settlement_account_id ?? null,
    quantity,
    investedMinor,
    confirmedQuantity: confirmed.quantity,
    confirmedInvestedMinor: confirmed.investedMinor,
    priceMinor,
    marketValueMinor,
    displayValueMinor,
    includedValueMinor,
    deltaMinor,
    unrealizedMode,
    includeInAssets: Number(security?.include_in_assets ?? 1) === 1,
  }
}

export function includedSecurityValueMinor(position = {}, options = {}) {
  if (!position?.includeInAssets) return 0
  const unrealizedMode = normalizeUnrealizedMode(
    options.unrealizedMode ?? position.unrealizedMode ?? UNREALIZED_MODE.market,
  )
  if (position.includedValueMinor != null && Number.isFinite(Number(position.includedValueMinor))) {
    return Math.max(0, Number(position.includedValueMinor))
  }
  const invested = Math.max(0, Number(position.investedMinor ?? position.displayValueMinor ?? 0))
  if (unrealizedMode === UNREALIZED_MODE.cost) return invested
  const market = Math.max(0, Number(position.marketValueMinor ?? 0))
  return market > 0 ? market : invested
}

export function sumIncludedSecuritiesMarketValue(positions = [], options = {}) {
  return (positions ?? []).reduce(
    (total, position) => total + includedSecurityValueMinor(position, options),
    0,
  )
}

export function assertSellQuantityAllowed(currentQuantity, sellQuantity, { recordMode = RECORD_MODE.position } = {}) {
  if (normalizeRecordMode(recordMode) === RECORD_MODE.funds) return
  const current = Math.trunc(Number(currentQuantity ?? 0))
  const sell = Math.trunc(Number(sellQuantity ?? 0))
  if (!Number.isFinite(sell) || sell <= 0) {
    throw new Error('賣出股數需大於 0')
  }
  if (!Number.isFinite(current) || sell > current) {
    throw new Error('賣出股數不可超過目前持倉')
  }
}

/** Average cost principal for selling `sellQty` from current confirmed holdings. */
export function estimateSellPrincipalMinor(transactions = [], sellQuantity) {
  const sellQty = Math.trunc(Number(sellQuantity ?? 0))
  const summary = summarizeSecurityTransactions(transactions)
  if (sellQty <= 0 || summary.quantity <= 0) return 0
  const ratio = Math.min(1, sellQty / summary.quantity)
  return Math.max(0, Math.round(summary.investedMinor * ratio))
}
