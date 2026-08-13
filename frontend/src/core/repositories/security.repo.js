import { query, run } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { assertLedgerId, firstRow, rowsOf } from './base.repo.js'
import {
  defaultSettleAt,
  deriveSettlementCashLegs,
  normalizeFeeMode,
  normalizeRecordMode,
  normalizeSettlementStatus,
  RECORD_MODE,
  SETTLEMENT_STATUS,
  toSettleAtIso,
} from '@/core/utils/securities-settlement'
import { estimateSellPrincipalMinor } from '@/core/utils/securities-position'
import {
  assertBuyCanBeMutated,
  derivePositionSellFromBuyLot,
  findBuyLotOrThrow,
} from '@/core/utils/securities-sell-lot'

function normalizeSymbol(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeName(value) {
  return String(value ?? '').trim()
}

function normalizeAssetClass(value) {
  return String(value ?? '').trim().toLowerCase() === 'etf' ? 'etf' : 'stock'
}

function normalizeCurrency(value) {
  const code = String(value ?? '').trim().toUpperCase()
  return code || 'TWD'
}

function normalizeSettlementAccountId(value) {
  const id = String(value ?? '').trim()
  return id || null
}

export async function listSecurities(ledgerId, { includeArchived = false, settlementAccountId = null } = {}) {
  assertLedgerId(ledgerId)
  const settlementId = normalizeSettlementAccountId(settlementAccountId)
  const params = [ledgerId]
  let settlementClause = ''
  if (settlementId) {
    settlementClause = 'AND settlement_account_id = ?'
    params.push(settlementId)
  }
  return rowsOf(
    await query(
      `SELECT *
         FROM securities
        WHERE ledger_id = ?
          AND deleted_at IS NULL
          ${includeArchived ? '' : 'AND is_archived = 0'}
          ${settlementClause}
        ORDER BY sort_order ASC, updated_at DESC, name ASC;`,
      params,
    ),
  )
}

export async function findSecurityById(ledgerId, securityId) {
  assertLedgerId(ledgerId)
  const id = String(securityId ?? '').trim()
  if (!id) return null
  return firstRow(
    await query(
      `SELECT *
         FROM securities
        WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL
        LIMIT 1;`,
      [ledgerId, id],
    ),
  )
}

export async function findSecurityTransactionById(ledgerId, transactionId) {
  assertLedgerId(ledgerId)
  const id = String(transactionId ?? '').trim()
  if (!id) return null
  return firstRow(
    await query(
      `SELECT * FROM security_transactions
        WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL
        LIMIT 1;`,
      [ledgerId, id],
    ),
  )
}

export async function createSecurity(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const symbol = normalizeSymbol(input.symbol)
  const name = normalizeName(input.name) || symbol
  if (!symbol && !name) throw new Error('缺少證券代碼或名稱')
  if (!symbol) throw new Error('缺少證券代碼')
  if (!name) throw new Error('缺少證券名稱')

  const settlementAccountId = normalizeSettlementAccountId(
    input.settlementAccountId ?? input.settlement_account_id,
  )
  if (!settlementAccountId) throw new Error('請選擇交割帳戶')

  const id = input.id ?? createId('sec')
  const now = nowIso()
  const assetClass = normalizeAssetClass(input.assetClass ?? input.asset_class)
  const currencyCode = normalizeCurrency(input.currencyCode ?? input.currency_code)
  const includeInAssets = Number(input.includeInAssets ?? input.include_in_assets ?? 1) ? 1 : 0
  const manualPriceMinor = Math.max(0, Math.round(Number(input.manualPriceMinor ?? input.manual_price_minor ?? 0)))
  const sortOrder = Math.trunc(Number(input.sortOrder ?? input.sort_order ?? 0)) || 0

  await run(
    `INSERT INTO securities (
       ledger_id, id, symbol, name, market, asset_class, currency_code,
       include_in_assets, manual_price_minor, manual_price_at, price_source,
       sort_order, is_archived, settlement_account_id, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, 'TW', ?, ?, ?, ?, ?, 'manual', ?, 0, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      symbol,
      name,
      assetClass,
      currencyCode,
      includeInAssets,
      manualPriceMinor,
      manualPriceMinor > 0 ? now : null,
      sortOrder,
      settlementAccountId,
      now,
      now,
    ],
  )
  return findSecurityById(ledgerId, id)
}

export async function updateSecurity(ledgerId, securityId, input = {}) {
  assertLedgerId(ledgerId)
  const existing = await findSecurityById(ledgerId, securityId)
  if (!existing) throw new Error('找不到證券標的')

  const symbol = input.symbol !== undefined ? normalizeSymbol(input.symbol) : existing.symbol
  const name = input.name !== undefined ? normalizeName(input.name) : existing.name
  if (!symbol) throw new Error('缺少證券代碼')
  if (!name) throw new Error('缺少證券名稱')

  const assetClass = input.assetClass !== undefined || input.asset_class !== undefined
    ? normalizeAssetClass(input.assetClass ?? input.asset_class)
    : existing.asset_class
  const currencyCode = input.currencyCode !== undefined || input.currency_code !== undefined
    ? normalizeCurrency(input.currencyCode ?? input.currency_code)
    : existing.currency_code
  const includeInAssets = input.includeInAssets !== undefined || input.include_in_assets !== undefined
    ? (Number(input.includeInAssets ?? input.include_in_assets) ? 1 : 0)
    : Number(existing.include_in_assets ?? 1)
  const settlementAccountId = input.settlementAccountId !== undefined || input.settlement_account_id !== undefined
    ? normalizeSettlementAccountId(input.settlementAccountId ?? input.settlement_account_id)
    : existing.settlement_account_id
  if (!settlementAccountId) throw new Error('請選擇交割帳戶')

  const now = nowIso()
  let manualPriceMinor = existing.manual_price_minor
  let manualPriceAt = existing.manual_price_at
  if (input.manualPriceMinor !== undefined || input.manual_price_minor !== undefined) {
    manualPriceMinor = Math.max(0, Math.round(Number(input.manualPriceMinor ?? input.manual_price_minor ?? 0)))
    manualPriceAt = now
  }

  await run(
    `UPDATE securities
        SET symbol = ?,
            name = ?,
            asset_class = ?,
            currency_code = ?,
            include_in_assets = ?,
            manual_price_minor = ?,
            manual_price_at = ?,
            settlement_account_id = ?,
            updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      symbol,
      name,
      assetClass,
      currencyCode,
      includeInAssets,
      manualPriceMinor,
      manualPriceAt,
      settlementAccountId,
      now,
      ledgerId,
      existing.id,
    ],
  )
  return findSecurityById(ledgerId, existing.id)
}

export async function softDeleteSecurity(ledgerId, securityId) {
  assertLedgerId(ledgerId)
  const id = String(securityId ?? '').trim()
  if (!id) throw new Error('缺少證券 ID')
  const now = nowIso()
  await run(
    `UPDATE securities
        SET deleted_at = ?, updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [now, now, ledgerId, id],
  )
  await run(
    `UPDATE security_transactions
        SET deleted_at = ?, updated_at = ?
      WHERE ledger_id = ? AND security_id = ? AND deleted_at IS NULL;`,
    [now, now, ledgerId, id],
  )
}

export async function listSecurityTransactions(ledgerId, securityId) {
  assertLedgerId(ledgerId)
  const id = String(securityId ?? '').trim()
  if (!id) return []
  return rowsOf(
    await query(
      `SELECT *
         FROM security_transactions
        WHERE ledger_id = ? AND security_id = ? AND deleted_at IS NULL
        ORDER BY occurred_at DESC, created_at DESC;`,
      [ledgerId, id],
    ),
  )
}

export async function listAllSecurityTransactions(ledgerId) {
  assertLedgerId(ledgerId)
  return rowsOf(
    await query(
      `SELECT *
         FROM security_transactions
        WHERE ledger_id = ? AND deleted_at IS NULL
        ORDER BY occurred_at DESC, created_at DESC;`,
      [ledgerId],
    ),
  )
}

export async function listDueSecurityTransactions(ledgerId, nowIsoValue = nowIso()) {
  assertLedgerId(ledgerId)
  return rowsOf(
    await query(
      `SELECT *
         FROM security_transactions
        WHERE ledger_id = ?
          AND deleted_at IS NULL
          AND settlement_status = ?
          AND settle_at IS NOT NULL
          AND settle_at <= ?
        ORDER BY settle_at ASC, created_at ASC;`,
      [ledgerId, SETTLEMENT_STATUS.scheduled, String(nowIsoValue)],
    ),
  )
}

function resolveSourceBuyTxId(input, fallback = null) {
  if (input.sourceBuyTxId !== undefined || input.source_buy_tx_id !== undefined) {
    return String(input.sourceBuyTxId ?? input.source_buy_tx_id ?? '').trim() || null
  }
  return fallback
}

function resolveCreateCashFields(input, existingTxs = [], { excludeSellId = '', securityId = '', existingSourceBuyTxId = null } = {}) {
  const type = String(input.type ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
  const recordMode = normalizeRecordMode(input.recordMode ?? input.record_mode)
  const feeMode = normalizeFeeMode(input.feeMode ?? input.fee_mode)
  let quantity = Math.max(0, Math.trunc(Number(input.quantity ?? 0)))
  let priceMinor = Math.max(0, Math.round(Number(input.priceMinor ?? input.price_minor ?? 0)))
  const feeMinor = Math.max(0, Math.round(Number(input.feeMinor ?? input.fee_minor ?? 0)))

  let principalMinor = input.principalMinor ?? input.principal_minor
  let proceedsMinor = input.proceedsMinor ?? input.proceeds_minor
  let sourceBuyTxId = type === 'sell' ? resolveSourceBuyTxId(input, existingSourceBuyTxId) : null

  if (type === 'sell' && recordMode === RECORD_MODE.position) {
    if (sourceBuyTxId) {
      const buy = findBuyLotOrThrow(existingTxs, sourceBuyTxId, { securityId })
      const derived = derivePositionSellFromBuyLot({
        buy,
        transactions: existingTxs,
        sellQty: quantity,
        proceedsGrossMinor: proceedsMinor ?? (quantity > 0 ? quantity * priceMinor : 0),
        feeMinor,
        feeMode,
        excludeSellId,
      })
      quantity = derived.quantity
      priceMinor = derived.priceMinor
      principalMinor = derived.principalMinor
      proceedsMinor = derived.proceedsMinor
      sourceBuyTxId = derived.sourceBuyTxId
    } else if (excludeSellId) {
      // Legacy position sell without a linked buy keeps average-cost principal.
      if (principalMinor == null || principalMinor === '') {
        principalMinor = estimateSellPrincipalMinor(
          existingTxs.filter((row) => String(row?.id ?? '') !== String(excludeSellId)),
          quantity,
        )
      }
    } else {
      throw new Error('請選擇要平倉的買入交易')
    }
  }

  const legs = deriveSettlementCashLegs({
    type,
    recordMode,
    quantity,
    priceMinor,
    feeMinor,
    feeMode,
    principalMinor,
    proceedsMinor,
  })

  return {
    type,
    recordMode,
    feeMode,
    quantity,
    priceMinor,
    feeMinor,
    principalMinor: legs.principalMinor,
    proceedsMinor: legs.proceedsMinor,
    sourceBuyTxId: type === 'sell' && recordMode === RECORD_MODE.position ? sourceBuyTxId : null,
    legs,
  }
}

export async function createSecurityTransaction(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const securityId = String(input.securityId ?? input.security_id ?? '').trim()
  if (!securityId) throw new Error('缺少證券 ID')
  const security = await findSecurityById(ledgerId, securityId)
  if (!security) throw new Error('找不到證券標的')

  const existingTxs = await listSecurityTransactions(ledgerId, securityId)
  const fields = resolveCreateCashFields(input, existingTxs, { securityId })

  if (fields.recordMode === 'position' && fields.type === 'buy' && fields.quantity <= 0) {
    // Allow position security without qty only when funds fields provided via funds mode
    throw new Error('完整持倉買入需填股數')
  }
  if (fields.recordMode === 'position' && fields.type === 'sell' && fields.quantity <= 0) {
    throw new Error('完整持倉賣出需填股數')
  }

  const occurredAt = String(input.occurredAt ?? input.occurred_at ?? nowIso()).trim()
  if (!occurredAt) throw new Error('缺少成交時間')

  let settleAt
  if (input.settleAt !== undefined || input.settle_at !== undefined) {
    settleAt = toSettleAtIso(input.settleAt ?? input.settle_at)
  } else {
    settleAt = defaultSettleAt(occurredAt).toISOString()
  }

  const settlementStatus = normalizeSettlementStatus(
    input.settlementStatus ?? input.settlement_status ?? SETTLEMENT_STATUS.scheduled,
  )
  const cashAccountId = String(
    input.cashAccountId
    ?? input.cash_account_id
    ?? security.settlement_account_id
    ?? '',
  ).trim() || null
  const note = String(input.note ?? '').trim() || null
  const id = input.id ?? createId('stx')
  const now = nowIso()
  const confirmedAt = settlementStatus === SETTLEMENT_STATUS.confirmed ? (input.confirmedAt ?? input.confirmed_at ?? now) : null

  await run(
    `INSERT INTO security_transactions (
       ledger_id, id, security_id, type, occurred_at, quantity, price_minor, fee_minor,
       fee_mode, record_mode, principal_minor, proceeds_minor, settle_at, settlement_status,
       confirmed_at, cash_account_id, cash_principal_tx_id, cash_pnl_tx_id, source_buy_tx_id, note,
       created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      securityId,
      fields.type,
      occurredAt,
      fields.quantity,
      fields.priceMinor,
      fields.feeMinor,
      fields.feeMode,
      fields.recordMode,
      fields.principalMinor,
      fields.proceedsMinor,
      settleAt,
      settlementStatus,
      confirmedAt,
      cashAccountId,
      fields.sourceBuyTxId,
      note,
      now,
      now,
    ],
  )

  return findSecurityTransactionById(ledgerId, id)
}

export async function updateSecurityTransaction(ledgerId, transactionId, input = {}) {
  assertLedgerId(ledgerId)
  const existing = await findSecurityTransactionById(ledgerId, transactionId)
  if (!existing) throw new Error('找不到證券流水')
  if (normalizeSettlementStatus(existing.settlement_status) === SETTLEMENT_STATUS.confirmed) {
    throw new Error('已確認交割的流水請先取消／回滾後再編輯')
  }

  const siblingTxs = (await listSecurityTransactions(ledgerId, existing.security_id))
    .filter((row) => row.id !== existing.id)
  const nextType = String(input.type ?? existing.type ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
  if (String(existing.type) === 'buy') {
    const nextQuantity = nextType === 'buy'
      ? (input.quantity ?? existing.quantity)
      : null
    assertBuyCanBeMutated(existing, siblingTxs.concat(existing), { nextQuantity: nextType === 'buy' ? nextQuantity : null })
  }
  const merged = {
    type: input.type ?? existing.type,
    recordMode: input.recordMode ?? input.record_mode ?? existing.record_mode,
    feeMode: input.feeMode ?? input.fee_mode ?? existing.fee_mode,
    quantity: input.quantity ?? existing.quantity,
    priceMinor: input.priceMinor ?? input.price_minor ?? existing.price_minor,
    feeMinor: input.feeMinor ?? input.fee_minor ?? existing.fee_minor,
    principalMinor: input.principalMinor ?? input.principal_minor ?? existing.principal_minor,
    proceedsMinor: input.proceedsMinor ?? input.proceeds_minor ?? existing.proceeds_minor,
    sourceBuyTxId: input.sourceBuyTxId ?? input.source_buy_tx_id ?? existing.source_buy_tx_id,
  }
  const fields = resolveCreateCashFields(merged, siblingTxs.concat(existing), {
    excludeSellId: existing.id,
    securityId: existing.security_id,
    existingSourceBuyTxId: existing.source_buy_tx_id,
  })
  const occurredAt = String(input.occurredAt ?? input.occurred_at ?? existing.occurred_at).trim()
  let settleAt = existing.settle_at
  if (input.settleAt !== undefined || input.settle_at !== undefined) {
    settleAt = toSettleAtIso(input.settleAt ?? input.settle_at)
  } else if (input.occurredAt !== undefined || input.occurred_at !== undefined) {
    settleAt = defaultSettleAt(occurredAt).toISOString()
  }
  const note = input.note !== undefined ? (String(input.note ?? '').trim() || null) : existing.note
  const cashAccountId = input.cashAccountId !== undefined || input.cash_account_id !== undefined
    ? (String(input.cashAccountId ?? input.cash_account_id ?? '').trim() || null)
    : existing.cash_account_id
  const now = nowIso()

  await run(
    `UPDATE security_transactions
        SET type = ?,
            occurred_at = ?,
            quantity = ?,
            price_minor = ?,
            fee_minor = ?,
            fee_mode = ?,
            record_mode = ?,
            principal_minor = ?,
            proceeds_minor = ?,
            source_buy_tx_id = ?,
            settle_at = ?,
            cash_account_id = ?,
            note = ?,
            updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      fields.type,
      occurredAt,
      fields.quantity,
      fields.priceMinor,
      fields.feeMinor,
      fields.feeMode,
      fields.recordMode,
      fields.principalMinor,
      fields.proceedsMinor,
      fields.sourceBuyTxId,
      settleAt,
      cashAccountId,
      note,
      now,
      ledgerId,
      existing.id,
    ],
  )
  return findSecurityTransactionById(ledgerId, existing.id)
}

export async function updateSecurityTransactionSettlement(ledgerId, transactionId, patch = {}) {
  assertLedgerId(ledgerId)
  const existing = await findSecurityTransactionById(ledgerId, transactionId)
  if (!existing) throw new Error('找不到證券流水')
  const now = nowIso()
  const settlementStatus = patch.settlementStatus !== undefined || patch.settlement_status !== undefined
    ? normalizeSettlementStatus(patch.settlementStatus ?? patch.settlement_status)
    : existing.settlement_status
  const settleAt = patch.settleAt !== undefined || patch.settle_at !== undefined
    ? toSettleAtIso(patch.settleAt ?? patch.settle_at)
    : existing.settle_at
  const confirmedAt = patch.confirmedAt !== undefined || patch.confirmed_at !== undefined
    ? (patch.confirmedAt ?? patch.confirmed_at)
    : existing.confirmed_at
  const cashPrincipalTxId = Object.prototype.hasOwnProperty.call(patch, 'cashPrincipalTxId')
    || Object.prototype.hasOwnProperty.call(patch, 'cash_principal_tx_id')
    ? (patch.cashPrincipalTxId ?? patch.cash_principal_tx_id ?? null)
    : existing.cash_principal_tx_id
  const cashPnlTxId = Object.prototype.hasOwnProperty.call(patch, 'cashPnlTxId')
    || Object.prototype.hasOwnProperty.call(patch, 'cash_pnl_tx_id')
    ? (patch.cashPnlTxId ?? patch.cash_pnl_tx_id ?? null)
    : existing.cash_pnl_tx_id

  await run(
    `UPDATE security_transactions
        SET settlement_status = ?,
            settle_at = ?,
            confirmed_at = ?,
            cash_principal_tx_id = ?,
            cash_pnl_tx_id = ?,
            updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      settlementStatus,
      settleAt,
      confirmedAt,
      cashPrincipalTxId,
      cashPnlTxId,
      now,
      ledgerId,
      existing.id,
    ],
  )
  return findSecurityTransactionById(ledgerId, existing.id)
}

export async function softDeleteSecurityTransaction(ledgerId, transactionId) {
  assertLedgerId(ledgerId)
  const id = String(transactionId ?? '').trim()
  if (!id) throw new Error('缺少流水 ID')
  const now = nowIso()
  await run(
    `UPDATE security_transactions
        SET deleted_at = ?, updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [now, now, ledgerId, id],
  )
}
