/**
 * Pure securities position / value helpers (no DB).
 * MVP: whole shares, manual price, net invested vs market value (no cost-basis method).
 */

export function normalizeSecurityTxType(value) {
  return String(value ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
}

export function summarizeSecurityTransactions(transactions = []) {
  let quantity = 0
  let investedMinor = 0
  const rows = Array.isArray(transactions) ? transactions : []

  for (const tx of rows) {
    if (tx?.deleted_at) continue
    const qty = Math.trunc(Number(tx?.quantity ?? 0))
    if (!Number.isFinite(qty) || qty <= 0) continue
    const priceMinor = Math.round(Number(tx?.price_minor ?? 0))
    const feeMinor = Math.max(0, Math.round(Number(tx?.fee_minor ?? 0)))
    if (!Number.isFinite(priceMinor) || priceMinor < 0) continue

    const notional = qty * priceMinor
    const type = normalizeSecurityTxType(tx?.type)
    if (type === 'buy') {
      quantity += qty
      investedMinor += notional + feeMinor
    } else {
      quantity -= qty
      investedMinor -= Math.max(0, notional - feeMinor)
    }
  }

  return {
    quantity,
    investedMinor,
  }
}

export function resolveSecurityPriceMinor(security = {}, _options = {}) {
  const source = String(security?.price_source ?? 'manual').trim().toLowerCase() || 'manual'
  // Phase 2: branch on source === 'api'
  void source
  return Math.max(0, Math.round(Number(security?.manual_price_minor ?? 0)))
}

export function buildSecurityPosition(security, transactions = []) {
  const summary = summarizeSecurityTransactions(transactions)
  const priceMinor = resolveSecurityPriceMinor(security)
  const quantity = summary.quantity
  const marketValueMinor = quantity > 0 ? quantity * priceMinor : 0
  const investedMinor = summary.investedMinor
  return {
    securityId: security?.id ?? null,
    quantity,
    investedMinor,
    priceMinor,
    marketValueMinor,
    deltaMinor: marketValueMinor - investedMinor,
    includeInAssets: Number(security?.include_in_assets ?? 1) === 1,
  }
}

export function sumIncludedSecuritiesMarketValue(positions = []) {
  return (positions ?? []).reduce((total, position) => {
    if (!position?.includeInAssets) return total
    return total + Math.max(0, Number(position.marketValueMinor ?? 0))
  }, 0)
}

export function assertSellQuantityAllowed(currentQuantity, sellQuantity) {
  const current = Math.trunc(Number(currentQuantity ?? 0))
  const sell = Math.trunc(Number(sellQuantity ?? 0))
  if (!Number.isFinite(sell) || sell <= 0) {
    throw new Error('賣出股數需大於 0')
  }
  if (!Number.isFinite(current) || sell > current) {
    throw new Error('賣出股數不可超過目前持倉')
  }
}
