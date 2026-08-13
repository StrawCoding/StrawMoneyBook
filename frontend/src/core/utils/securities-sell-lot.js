/**
 * Specific-lot sell matching: one sell against one buy.
 * Remaining qty/principal are derived; last partial sell eats leftover principal.
 */

import {
  normalizeFeeMode,
  normalizeRecordMode,
  normalizeSettlementStatus,
  FEE_MODE,
  RECORD_MODE,
  SETTLEMENT_STATUS,
} from './securities-settlement.js'
import { normalizeSecurityTxType } from './securities-position.js'

function asRows(transactions) {
  return Array.isArray(transactions) ? transactions : []
}

function isActiveRow(tx) {
  if (tx?.deleted_at) return false
  return normalizeSettlementStatus(tx?.settlement_status) !== SETTLEMENT_STATUS.cancelled
}

export function buyLotQuantity(buy) {
  return Math.max(0, Math.trunc(Number(buy?.quantity ?? 0)))
}

export function buyLotPrincipalMinor(buy) {
  const stored = Math.max(0, Math.round(Number(buy?.principal_minor ?? 0)))
  if (stored > 0) return stored
  const qty = buyLotQuantity(buy)
  const price = Math.max(0, Math.round(Number(buy?.price_minor ?? 0)))
  const fee = Math.max(0, Math.round(Number(buy?.fee_minor ?? 0)))
  return qty > 0 ? qty * price + fee : 0
}

export function soldQuantityAgainstBuy(transactions = [], buyId, { excludeSellId = '' } = {}) {
  const id = String(buyId ?? '').trim()
  if (!id) return 0
  const skip = String(excludeSellId ?? '').trim()
  let sold = 0
  for (const tx of asRows(transactions)) {
    if (!isActiveRow(tx)) continue
    if (normalizeSecurityTxType(tx?.type) !== 'sell') continue
    if (String(tx?.source_buy_tx_id ?? '').trim() !== id) continue
    if (skip && String(tx?.id ?? '') === skip) continue
    sold += Math.max(0, Math.trunc(Number(tx?.quantity ?? 0)))
  }
  return sold
}

export function soldPrincipalAgainstBuy(transactions = [], buyId, { excludeSellId = '' } = {}) {
  const id = String(buyId ?? '').trim()
  if (!id) return 0
  const skip = String(excludeSellId ?? '').trim()
  let sold = 0
  for (const tx of asRows(transactions)) {
    if (!isActiveRow(tx)) continue
    if (normalizeSecurityTxType(tx?.type) !== 'sell') continue
    if (String(tx?.source_buy_tx_id ?? '').trim() !== id) continue
    if (skip && String(tx?.id ?? '') === skip) continue
    sold += Math.max(0, Math.round(Number(tx?.principal_minor ?? 0)))
  }
  return sold
}

export function remainingBuyLot(buy, transactions = [], options = {}) {
  const quantity = buyLotQuantity(buy)
  const principal = buyLotPrincipalMinor(buy)
  const soldQty = soldQuantityAgainstBuy(transactions, buy?.id, options)
  const soldPrincipal = soldPrincipalAgainstBuy(transactions, buy?.id, options)
  const remainingQty = Math.max(0, quantity - soldQty)
  const remainingPrincipal = remainingQty <= 0
    ? 0
    : Math.max(0, principal - soldPrincipal)
  return {
    buyId: String(buy?.id ?? ''),
    quantity,
    principalMinor: principal,
    soldQty,
    remainingQty,
    remainingPrincipalMinor: remainingPrincipal,
  }
}

export function allocateSellPrincipalFromBuy({ remainingQty, remainingPrincipalMinor, sellQty }) {
  const remainQty = Math.trunc(Number(remainingQty ?? 0))
  const remainPrincipal = Math.max(0, Math.round(Number(remainingPrincipalMinor ?? 0)))
  const qty = Math.trunc(Number(sellQty ?? 0))
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('賣出股數需大於 0')
  }
  if (!Number.isFinite(remainQty) || qty > remainQty) {
    throw new Error('賣出股數不可超過該筆買入剩餘')
  }
  if (qty === remainQty) return remainPrincipal
  if (remainQty <= 0) return 0
  return Math.max(0, Math.round(remainPrincipal * qty / remainQty))
}

export function listOpenBuyLots(transactions = [], { excludeSellId = '', securityId = '' } = {}) {
  const sid = String(securityId ?? '').trim()
  const lots = []
  for (const tx of asRows(transactions)) {
    if (!isActiveRow(tx)) continue
    if (normalizeSecurityTxType(tx?.type) !== 'buy') continue
    if (normalizeRecordMode(tx?.record_mode) !== RECORD_MODE.position) continue
    if (sid && String(tx?.security_id ?? '') !== sid) continue
    if (buyLotQuantity(tx) <= 0) continue
    const remaining = remainingBuyLot(tx, transactions, { excludeSellId })
    if (remaining.remainingQty <= 0) continue
    lots.push({
      ...remaining,
      occurredAt: tx.occurred_at ?? '',
      buy: tx,
    })
  }
  lots.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
  return lots
}

export function findBuyLotOrThrow(transactions, buyId, { securityId = '' } = {}) {
  const id = String(buyId ?? '').trim()
  if (!id) throw new Error('請選擇要平倉的買入交易')
  const buy = asRows(transactions).find((tx) => String(tx?.id ?? '') === id)
  if (!buy || !isActiveRow(buy)) throw new Error('找不到可平倉的買入交易')
  if (normalizeSecurityTxType(buy.type) !== 'buy') throw new Error('只能對應買入交易')
  if (securityId && String(buy.security_id ?? '') !== String(securityId)) {
    throw new Error('買入交易必須屬於同一標的')
  }
  if (normalizeRecordMode(buy.record_mode) !== RECORD_MODE.position || buyLotQuantity(buy) <= 0) {
    throw new Error('只能對應完整持倉買入')
  }
  return buy
}

export function derivePositionSellFromBuyLot({
  buy,
  transactions = [],
  sellQty,
  proceedsGrossMinor,
  feeMinor = 0,
  feeMode = FEE_MODE.intoCost,
  excludeSellId = '',
} = {}) {
  const remaining = remainingBuyLot(buy, transactions, { excludeSellId })
  const qty = Math.trunc(Number(sellQty ?? 0))
  const gross = Math.max(0, Math.round(Number(proceedsGrossMinor ?? 0)))
  if (gross <= 0) throw new Error('成交金額需大於 0')
  const fee = Math.max(0, Math.round(Number(feeMinor ?? 0)))
  const feeKind = normalizeFeeMode(feeMode)
  const principal = allocateSellPrincipalFromBuy({
    remainingQty: remaining.remainingQty,
    remainingPrincipalMinor: remaining.remainingPrincipalMinor,
    sellQty: qty,
  })
  const proceeds = feeKind === FEE_MODE.fromProceeds ? Math.max(0, gross - fee) : gross
  const priceMinor = qty > 0 ? Math.max(0, Math.round(gross / qty)) : 0
  return {
    quantity: qty,
    priceMinor,
    principalMinor: principal,
    proceedsMinor: proceeds,
    proceedsGrossMinor: gross,
    feeMinor: fee,
    feeMode: feeKind,
    sourceBuyTxId: String(buy.id),
    pnlMinor: proceeds - principal,
  }
}

export function assertBuyCanBeMutated(buy, transactions = [], { nextQuantity = null } = {}) {
  const soldQty = soldQuantityAgainstBuy(transactions, buy?.id)
  if (soldQty <= 0) return
  if (nextQuantity == null) {
    throw new Error('已有對應賣出，請先處理賣出後再刪除買入')
  }
  const qty = Math.trunc(Number(nextQuantity))
  if (!Number.isFinite(qty) || qty < soldQty) {
    throw new Error('買入股數不可小於已賣出股數')
  }
}
