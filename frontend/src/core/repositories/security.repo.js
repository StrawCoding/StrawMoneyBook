import { query, run } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { assertLedgerId, firstRow, rowsOf } from './base.repo.js'

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

export async function listSecurities(ledgerId, { includeArchived = false } = {}) {
  assertLedgerId(ledgerId)
  return rowsOf(
    await query(
      `SELECT *
         FROM securities
        WHERE ledger_id = ?
          AND deleted_at IS NULL
          ${includeArchived ? '' : 'AND is_archived = 0'}
        ORDER BY sort_order ASC, updated_at DESC, name ASC;`,
      [ledgerId],
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

export async function createSecurity(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const symbol = normalizeSymbol(input.symbol)
  const name = normalizeName(input.name)
  if (!symbol) throw new Error('缺少證券代碼')
  if (!name) throw new Error('缺少證券名稱')

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
       sort_order, is_archived, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, 'TW', ?, ?, ?, ?, ?, 'manual', ?, 0, ?, ?, NULL);`,
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
        SET deleted_at = ?, updated_at = ?, is_archived = 1
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

export async function createSecurityTransaction(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const securityId = String(input.securityId ?? input.security_id ?? '').trim()
  if (!securityId) throw new Error('缺少證券 ID')
  const security = await findSecurityById(ledgerId, securityId)
  if (!security) throw new Error('找不到證券標的')

  const type = String(input.type ?? '').trim().toLowerCase() === 'sell' ? 'sell' : 'buy'
  const quantity = Math.trunc(Number(input.quantity ?? 0))
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('股數需大於 0')
  const priceMinor = Math.round(Number(input.priceMinor ?? input.price_minor ?? 0))
  if (!Number.isFinite(priceMinor) || priceMinor < 0) throw new Error('單價無效')
  const feeMinor = Math.max(0, Math.round(Number(input.feeMinor ?? input.fee_minor ?? 0)))
  const occurredAt = String(input.occurredAt ?? input.occurred_at ?? nowIso()).trim()
  if (!occurredAt) throw new Error('缺少成交時間')
  const cashAccountId = String(input.cashAccountId ?? input.cash_account_id ?? '').trim() || null
  const note = String(input.note ?? '').trim() || null
  const id = input.id ?? createId('stx')
  const now = nowIso()

  await run(
    `INSERT INTO security_transactions (
       ledger_id, id, security_id, type, occurred_at, quantity, price_minor, fee_minor,
       cash_account_id, note, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [ledgerId, id, securityId, type, occurredAt, quantity, priceMinor, feeMinor, cashAccountId, note, now, now],
  )

  return firstRow(
    await query(
      `SELECT * FROM security_transactions WHERE ledger_id = ? AND id = ? LIMIT 1;`,
      [ledgerId, id],
    ),
  )
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
