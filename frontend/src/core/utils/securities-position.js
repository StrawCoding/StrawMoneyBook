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

export function resolveSecurityPriceMinor(security = {}, _options = {}) {
  const source = String(security?.price_source ?? 'manual').trim().toLowerCase() || 'manual'
  // Phase 2+: branch on source === 'api'
  void source
  return Math.max(0, Math.round(Number(security?.manual_price_minor ?? 0)))
}

export function buildSecurityPosition(security, transactions = [], options = {}) {
  const unrealizedMode = normalizeUnrealizedMode(options.unrealizedMode ?? UNREALIZED_MODE.market)
  const summary = summarizeSecurityTransactions(transactions)
  const priceMinor = resolveSecurityPriceMinor(security)
  const quantity = summary.quantity
  const investedMinor = summary.investedMinor
  const marketValueMinor = quantity > 0 ? quantity * priceMinor : 0
  const displayValueMinor = unrealizedMode === UNREALIZED_MODE.cost
    ? investedMinor
    : (quantity > 0 ? marketValueMinor : investedMinor)
  const deltaMinor = unrealizedMode === UNREALIZED_MODE.cost
    ? 0
    : marketValueMinor - investedMinor

  return {
    securityId: security?.id ?? null,
    settlementAccountId: security?.settlement_account_id ?? null,
    quantity,
    investedMinor,
    priceMinor,
    marketValueMinor,
    displayValueMinor,
    deltaMinor,
    unrealizedMode,
    includeInAssets: Number(security?.include_in_assets ?? 1) === 1,
  }
}

export function sumIncludedSecuritiesMarketValue(positions = [], options = {}) {
  const unrealizedMode = normalizeUnrealizedMode(options.unrealizedMode ?? UNREALIZED_MODE.market)
  return (positions ?? []).reduce((total, position) => {
    if (!position?.includeInAssets) return total
    if (unrealizedMode === UNREALIZED_MODE.cost) {
      return total + Math.max(0, Number(position.investedMinor ?? position.displayValueMinor ?? 0))
    }
    return total + Math.max(0, Number(position.marketValueMinor ?? position.displayValueMinor ?? 0))
  }, 0)
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
