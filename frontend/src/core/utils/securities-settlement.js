/**
 * Pure securities settlement helpers (T+2 trading calendar, cash-leg math).
 * Trading days skip Sat/Sun only; national holidays deferred to later phase.
 */

export const SETTLEMENT_STATUS = Object.freeze({
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
})

export const RECORD_MODE = Object.freeze({
  position: 'position',
  funds: 'funds',
})

export const FEE_MODE = Object.freeze({
  intoCost: 'into_cost',
  fromProceeds: 'from_proceeds',
})

export const UNREALIZED_MODE = Object.freeze({
  market: 'market',
  cost: 'cost',
})

export function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function startOfLocalDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addTradingDays(fromDate, tradingDays, { hour = 10, minute = 0, second = 0 } = {}) {
  const days = Math.trunc(Number(tradingDays))
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('tradingDays 需為非負整數')
  }
  const cursor = startOfLocalDay(fromDate instanceof Date ? fromDate : new Date(fromDate))
  if (Number.isNaN(cursor.getTime())) {
    throw new Error('無效成交日')
  }
  let remaining = days
  // T+0 means same calendar day if it is a trading day; else next trading day then add 0.
  if (remaining === 0) {
    while (isWeekend(cursor)) cursor.setDate(cursor.getDate() + 1)
  } else {
    while (remaining > 0) {
      cursor.setDate(cursor.getDate() + 1)
      if (!isWeekend(cursor)) remaining -= 1
    }
  }
  cursor.setHours(hour, minute, second, 0)
  return cursor
}

/** Default settle_at = trade date + 2 trading days at 10:00 local. */
export function defaultSettleAt(occurredAt, options = {}) {
  const occurred = occurredAt instanceof Date ? occurredAt : new Date(occurredAt)
  if (Number.isNaN(occurred.getTime())) throw new Error('缺少成交時間')
  return addTradingDays(occurred, 2, {
    hour: options.hour ?? 10,
    minute: options.minute ?? 0,
    second: options.second ?? 0,
  })
}

export function toSettleAtIso(value) {
  if (value instanceof Date) return value.toISOString()
  const text = String(value ?? '').trim()
  if (!text) return ''
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) throw new Error('settle_at 無效')
  return parsed.toISOString()
}

export function normalizeSettlementStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === SETTLEMENT_STATUS.confirmed) return SETTLEMENT_STATUS.confirmed
  if (raw === SETTLEMENT_STATUS.cancelled) return SETTLEMENT_STATUS.cancelled
  return SETTLEMENT_STATUS.scheduled
}

export function normalizeRecordMode(value) {
  return String(value ?? '').trim().toLowerCase() === RECORD_MODE.funds
    ? RECORD_MODE.funds
    : RECORD_MODE.position
}

export function normalizeFeeMode(value) {
  return String(value ?? '').trim().toLowerCase() === FEE_MODE.fromProceeds
    ? FEE_MODE.fromProceeds
    : FEE_MODE.intoCost
}

export function normalizeUnrealizedMode(value) {
  return String(value ?? '').trim().toLowerCase() === UNREALIZED_MODE.cost
    ? UNREALIZED_MODE.cost
    : UNREALIZED_MODE.market
}

/**
 * Derive principal / proceeds for a security event.
 * Buy: cash leaves settlement = principal (不計收支).
 * Sell: cash enters = proceeds; split into principal return (不計) + PnL (計收支).
 */
export function deriveSettlementCashLegs({
  type,
  recordMode,
  quantity = 0,
  priceMinor = 0,
  feeMinor = 0,
  feeMode = FEE_MODE.intoCost,
  principalMinor = null,
  proceedsMinor = null,
} = {}) {
  const txType = String(type ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
  const mode = normalizeRecordMode(recordMode)
  const fee = Math.max(0, Math.round(Number(feeMinor) || 0))
  const feeKind = normalizeFeeMode(feeMode)
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0))
  const price = Math.max(0, Math.round(Number(priceMinor) || 0))
  const notional = qty * price

  if (txType === 'buy') {
    let principal = principalMinor != null && principalMinor !== ''
      ? Math.max(0, Math.round(Number(principalMinor)))
      : null
    if (principal == null) {
      if (mode === RECORD_MODE.funds) {
        throw new Error('精簡資金模式買入需填本金')
      }
      if (qty <= 0) throw new Error('完整持倉買入需填股數')
      principal = feeKind === FEE_MODE.intoCost ? notional + fee : notional
    }
    if (principal <= 0) throw new Error('本金需大於 0')
    return {
      type: 'buy',
      recordMode: mode,
      principalMinor: principal,
      proceedsMinor: 0,
      feeMinor: fee,
      feeMode: feeKind,
      cashOutMinor: principal,
      cashInMinor: 0,
      pnlMinor: 0,
    }
  }

  let proceeds = proceedsMinor != null && proceedsMinor !== ''
    ? Math.max(0, Math.round(Number(proceedsMinor)))
    : null
  if (proceeds == null) {
    if (mode === RECORD_MODE.funds) {
      throw new Error('精簡資金模式賣出／回收需填回收金額')
    }
    if (qty <= 0) throw new Error('完整持倉賣出需填股數')
    proceeds = feeKind === FEE_MODE.fromProceeds ? Math.max(0, notional - fee) : notional
  }

  let principal = principalMinor != null && principalMinor !== ''
    ? Math.max(0, Math.round(Number(principalMinor)))
    : null
  if (principal == null) {
    if (mode === RECORD_MODE.funds) {
      throw new Error('精簡資金模式賣出／回收需填本金')
    }
    // Position mode without explicit cost: treat fee-into-cost buy-equivalent as cost proxy
    principal = feeKind === FEE_MODE.intoCost ? notional + fee : notional
  }

  const pnlMinor = proceeds - principal
  return {
    type: 'sell',
    recordMode: mode,
    principalMinor: principal,
    proceedsMinor: proceeds,
    feeMinor: fee,
    feeMode: feeKind,
    cashOutMinor: 0,
    cashInMinor: proceeds,
    pnlMinor,
  }
}

/** Authority examples: 300→320 profit +20; 300→280 loss -20. */
export function describeSettlementPosting(legs) {
  if (!legs) return null
  if (legs.type === 'buy') {
    return {
      principalAdjustmentMinor: -Math.abs(legs.principalMinor),
      pnlType: null,
      pnlAmountMinor: 0,
    }
  }
  const pnl = Number(legs.pnlMinor) || 0
  return {
    // Capital return (不計收支) + PnL income/expense; net cash = proceeds
    principalAdjustmentMinor: Math.abs(legs.principalMinor),
    pnlType: pnl > 0 ? 'income' : pnl < 0 ? 'expense' : null,
    pnlAmountMinor: Math.abs(pnl),
    netCashInMinor: Math.abs(legs.proceedsMinor),
  }
}

export function isSettlementDue(settleAt, now = new Date()) {
  if (!settleAt) return false
  const due = settleAt instanceof Date ? settleAt : new Date(settleAt)
  const current = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) return false
  return due.getTime() <= current.getTime()
}
