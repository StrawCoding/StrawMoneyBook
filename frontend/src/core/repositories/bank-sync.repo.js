import { query, run } from '@/core/db/sqlite'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'
import { createId, nowIso } from '@/core/utils/id'
import { yieldToMainThread } from '@/core/utils/cooperative-yield'

function normalizeConnectionStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'revoked' || value === 'error') return value
  return 'active'
}

function normalizeSyncStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'ok' || value === 'error') return value
  return 'idle'
}

function normalizeRuleDirection(direction) {
  const value = String(direction ?? '').trim().toLowerCase()
  if (value === 'income' || value === 'expense') return value
  return 'all'
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeRuleRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    direction: normalizeRuleDirection(source.direction),
    excludeKeywords: parseJsonArray(source.exclude_keywords_json)
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
    minAmountMinor: Math.max(0, Math.round(Number(source.min_amount_minor ?? 0) || 0)),
    includePending: Boolean(Number(source.include_pending ?? 0)),
    lookbackDays: Math.min(30, Math.max(0, Math.round(Number(source.lookback_days ?? 3) || 3))),
    updatedAt: String(source.updated_at ?? ''),
  }
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeCurrency(value, fallback = 'TWD') {
  const text = String(value ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(text)) return text
  return fallback
}

function normalizeBankTxnStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'pending' || value === 'reversed') return value
  return 'posted'
}

function normalizeBankTxnAmountMinor(amountMinor) {
  const amount = Math.round(Number(amountMinor) || 0)
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('bank transaction amount_minor is invalid')
  }
  return amount
}

function normalizeBankTxnBalanceMinor(balanceMinor) {
  if (balanceMinor === null || balanceMinor === undefined || balanceMinor === '') return null
  const amount = Math.round(Number(balanceMinor) || 0)
  return Number.isFinite(amount) ? amount : null
}

function summarizeBankTxnForDiff(row) {
  if (!row || typeof row !== 'object') return ''
  return JSON.stringify({
    posted_at: String(row.posted_at ?? row.postedAt ?? ''),
    amount_minor: Number(row.amount_minor ?? row.amountMinor ?? 0),
    currency: String(row.currency ?? ''),
    description: String(row.description ?? ''),
    merchant: String(row.merchant ?? ''),
    status: String(row.status ?? ''),
    transaction_type: String(row.transaction_type ?? row.transactionType ?? ''),
    note: String(row.note ?? ''),
    summary: String(row.summary ?? ''),
    balance_minor: row.balance_minor === null || row.balanceMinor === null ? null : Number(row.balance_minor ?? row.balanceMinor ?? 0),
  })
}

function toSqlInPlaceholders(values) {
  if (!Array.isArray(values) || !values.length) return ''
  return values.map(() => '?').join(', ')
}

export async function listBankConnections(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, provider, provider_connection_id, status, user_label,
            last_sync_at, sync_cursor, last_sync_status, last_error, created_at, updated_at, deleted_at
     FROM bank_connections
     WHERE ledger_id = ?
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC;`,
    [ledgerId],
  )
  return rowsOf(result)
}

export async function findBankConnectionById(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!connectionId) return null
  const result = await query(
    `SELECT ledger_id, id, provider, provider_connection_id, status, user_label,
            last_sync_at, sync_cursor, last_sync_status, last_error, created_at, updated_at, deleted_at
     FROM bank_connections
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, connectionId],
  )
  return firstRow(result)
}

export async function findBankConnectionByProviderRef(ledgerId, provider, providerConnectionId) {
  assertLedgerId(ledgerId)
  const normalizedProvider = normalizeText(provider)
  const normalizedRef = normalizeText(providerConnectionId)
  if (!normalizedProvider || !normalizedRef) return null
  const result = await query(
    `SELECT ledger_id, id, provider, provider_connection_id, status, user_label,
            last_sync_at, sync_cursor, last_sync_status, last_error, created_at, updated_at, deleted_at
     FROM bank_connections
     WHERE ledger_id = ?
       AND provider = ?
       AND provider_connection_id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, normalizedProvider, normalizedRef],
  )
  return firstRow(result)
}

export async function upsertBankConnection(ledgerId, input) {
  assertLedgerId(ledgerId)
  const provider = normalizeText(input?.provider)
  const providerConnectionId = normalizeText(input?.providerConnectionId)
  if (!provider || !providerConnectionId) {
    throw new Error('provider and providerConnectionId are required')
  }

  const now = nowIso()
  const existing = await findBankConnectionByProviderRef(ledgerId, provider, providerConnectionId)
  const id = normalizeText(input?.id || existing?.id) || createId('bconn')
  const status = normalizeConnectionStatus(input?.status ?? existing?.status)
  const userLabel = normalizeText(input?.userLabel ?? existing?.user_label)
  const lastSyncAt = normalizeText(input?.lastSyncAt ?? existing?.last_sync_at)
  const syncCursor = normalizeText(input?.syncCursor ?? existing?.sync_cursor)
  const lastSyncStatus = normalizeSyncStatus(input?.lastSyncStatus ?? existing?.last_sync_status)
  const lastError = normalizeText(input?.lastError ?? existing?.last_error)

  await run(
    `INSERT INTO bank_connections (
      ledger_id, id, provider, provider_connection_id, status, user_label,
      last_sync_at, sync_cursor, last_sync_status, last_error, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(ledger_id, id)
    DO UPDATE SET
      provider = excluded.provider,
      provider_connection_id = excluded.provider_connection_id,
      status = excluded.status,
      user_label = excluded.user_label,
      last_sync_at = excluded.last_sync_at,
      sync_cursor = excluded.sync_cursor,
      last_sync_status = excluded.last_sync_status,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at,
      deleted_at = NULL;`,
    [
      ledgerId,
      id,
      provider,
      providerConnectionId,
      status,
      userLabel || null,
      lastSyncAt || null,
      syncCursor || null,
      lastSyncStatus,
      lastError || null,
      existing?.created_at || now,
      now,
    ],
  )

  return findBankConnectionById(ledgerId, id)
}

export async function updateBankConnection(ledgerId, connectionId, patch = {}) {
  assertLedgerId(ledgerId)
  const existing = await findBankConnectionById(ledgerId, connectionId)
  if (!existing) throw new Error('找不到銀行連結')

  const next = {
    status: normalizeConnectionStatus(patch.status ?? existing.status),
    userLabel: normalizeText(patch.userLabel ?? existing.user_label) || null,
    lastSyncAt: normalizeText(patch.lastSyncAt ?? existing.last_sync_at) || null,
    syncCursor: normalizeText(patch.syncCursor ?? existing.sync_cursor) || null,
    lastSyncStatus: normalizeSyncStatus(patch.lastSyncStatus ?? existing.last_sync_status),
    lastError: normalizeText(patch.lastError ?? existing.last_error) || null,
    deletedAt: patch.deletedAt === undefined ? existing.deleted_at : (normalizeText(patch.deletedAt) || null),
  }

  await run(
    `UPDATE bank_connections
     SET status = ?,
         user_label = ?,
         last_sync_at = ?,
         sync_cursor = ?,
         last_sync_status = ?,
         last_error = ?,
         updated_at = ?,
         deleted_at = ?
     WHERE ledger_id = ? AND id = ?;`,
    [
      next.status,
      next.userLabel,
      next.lastSyncAt,
      next.syncCursor,
      next.lastSyncStatus,
      next.lastError,
      nowIso(),
      next.deletedAt,
      ledgerId,
      connectionId,
    ],
  )

  return findBankConnectionById(ledgerId, connectionId)
}

export async function listBankAccountsByConnection(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!connectionId) return []
  const result = await query(
    `SELECT ba.ledger_id, ba.id, ba.connection_id, ba.provider_account_id, ba.account_mask,
            ba.account_name, ba.account_type, ba.currency, ba.enabled, ba.user_label, ba.mapped_account_id,
            ba.created_at, ba.updated_at, ba.deleted_at, a.name AS mapped_account_name
     FROM bank_accounts ba
     LEFT JOIN accounts a
       ON a.ledger_id = ba.ledger_id
      AND a.id = ba.mapped_account_id
      AND a.deleted_at IS NULL
     WHERE ba.ledger_id = ?
       AND ba.connection_id = ?
       AND ba.deleted_at IS NULL
     ORDER BY ba.updated_at DESC, ba.created_at DESC;`,
    [ledgerId, connectionId],
  )
  return rowsOf(result)
}

export async function listEnabledBankAccountsByConnection(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!connectionId) return []
  const result = await query(
    `SELECT ledger_id, id, connection_id, provider_account_id, account_mask,
            account_name, account_type, currency, enabled, user_label, mapped_account_id,
            created_at, updated_at, deleted_at
     FROM bank_accounts
     WHERE ledger_id = ?
       AND connection_id = ?
       AND enabled = 1
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC;`,
    [ledgerId, connectionId],
  )
  return rowsOf(result)
}

export async function findBankAccountById(ledgerId, bankAccountId) {
  assertLedgerId(ledgerId)
  if (!bankAccountId) return null
  const result = await query(
    `SELECT ledger_id, id, connection_id, provider_account_id, account_mask,
            account_name, account_type, currency, enabled, user_label, mapped_account_id,
            created_at, updated_at, deleted_at
     FROM bank_accounts
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, bankAccountId],
  )
  return firstRow(result)
}

export async function upsertBankAccounts(ledgerId, connectionId, accounts = []) {
  assertLedgerId(ledgerId)
  if (!connectionId) throw new Error('connectionId is required')
  if (!Array.isArray(accounts) || !accounts.length) return []

  const now = nowIso()
  const touchedIds = []
  for (const item of accounts) {
    const providerAccountId = normalizeText(item?.providerAccountId || item?.id)
    if (!providerAccountId) continue

    const existing = await query(
      `SELECT id, enabled, user_label, mapped_account_id, created_at
       FROM bank_accounts
       WHERE ledger_id = ?
         AND connection_id = ?
         AND provider_account_id = ?
       LIMIT 1;`,
      [ledgerId, connectionId, providerAccountId],
    )
    const current = firstRow(existing)
    const id = normalizeText(item?.localId || current?.id) || createId('bacc')
    touchedIds.push(id)

    await run(
      `INSERT INTO bank_accounts (
        ledger_id, id, connection_id, provider_account_id, account_mask, account_name, account_type,
        currency, enabled, user_label, mapped_account_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(ledger_id, id)
      DO UPDATE SET
        connection_id = excluded.connection_id,
        provider_account_id = excluded.provider_account_id,
        account_mask = excluded.account_mask,
        account_name = excluded.account_name,
        account_type = excluded.account_type,
        currency = excluded.currency,
        enabled = COALESCE(bank_accounts.enabled, excluded.enabled),
        user_label = COALESCE(bank_accounts.user_label, excluded.user_label),
        mapped_account_id = COALESCE(bank_accounts.mapped_account_id, excluded.mapped_account_id),
        updated_at = excluded.updated_at,
        deleted_at = NULL;`,
      [
        ledgerId,
        id,
        connectionId,
        providerAccountId,
        normalizeText(item?.accountMask) || null,
        normalizeText(item?.accountName, providerAccountId),
        normalizeText(item?.accountType) || null,
        normalizeCurrency(item?.currency, 'TWD'),
        current ? Number(current.enabled ?? 1) : (item?.enabled ? 1 : 0),
        (current?.user_label ?? null),
        (current?.mapped_account_id ?? null),
        current?.created_at || now,
        now,
      ],
    )
  }

  return listBankAccountsByConnection(ledgerId, connectionId).then((rows) => rows.filter((item) => touchedIds.includes(item.id)))
}

export async function updateBankAccount(ledgerId, bankAccountId, patch = {}) {
  assertLedgerId(ledgerId)
  const existing = await findBankAccountById(ledgerId, bankAccountId)
  if (!existing) throw new Error('找不到銀行帳戶')

  const nextEnabled = patch.enabled === undefined ? Number(existing.enabled ?? 1) : (patch.enabled ? 1 : 0)
  const nextUserLabel = patch.userLabel === undefined ? existing.user_label : (normalizeText(patch.userLabel) || null)
  const nextMappedAccountId = patch.mappedAccountId === undefined
    ? existing.mapped_account_id
    : (normalizeText(patch.mappedAccountId) || null)

  await run(
    `UPDATE bank_accounts
     SET enabled = ?,
         user_label = ?,
         mapped_account_id = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ?;`,
    [nextEnabled, nextUserLabel, nextMappedAccountId, nowIso(), ledgerId, bankAccountId],
  )

  return findBankAccountById(ledgerId, bankAccountId)
}

export async function getBankSyncRule(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!connectionId) throw new Error('connectionId is required')
  const result = await query(
    `SELECT ledger_id, connection_id, direction, exclude_keywords_json, min_amount_minor,
            include_pending, lookback_days, updated_at
     FROM bank_sync_rules
     WHERE ledger_id = ? AND connection_id = ?
     LIMIT 1;`,
    [ledgerId, connectionId],
  )
  const row = firstRow(result)
  if (!row) {
    return {
      direction: 'all',
      excludeKeywords: [],
      minAmountMinor: 0,
      includePending: false,
      lookbackDays: 3,
      updatedAt: '',
    }
  }
  return normalizeRuleRow(row)
}

export async function upsertBankSyncRule(ledgerId, connectionId, rule = {}) {
  assertLedgerId(ledgerId)
  if (!connectionId) throw new Error('connectionId is required')
  const current = await getBankSyncRule(ledgerId, connectionId)
  const merged = {
    direction: normalizeRuleDirection(rule.direction ?? current.direction),
    excludeKeywords: Array.isArray(rule.excludeKeywords)
      ? rule.excludeKeywords.map((item) => normalizeText(item)).filter(Boolean)
      : current.excludeKeywords,
    minAmountMinor: Math.max(0, Math.round(Number(rule.minAmountMinor ?? current.minAmountMinor) || 0)),
    includePending: rule.includePending === undefined ? current.includePending : Boolean(rule.includePending),
    lookbackDays: Math.min(30, Math.max(0, Math.round(Number(rule.lookbackDays ?? current.lookbackDays) || 3))),
  }

  await run(
    `INSERT INTO bank_sync_rules (
      ledger_id, connection_id, direction, exclude_keywords_json, min_amount_minor,
      include_pending, lookback_days, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, connection_id)
    DO UPDATE SET
      direction = excluded.direction,
      exclude_keywords_json = excluded.exclude_keywords_json,
      min_amount_minor = excluded.min_amount_minor,
      include_pending = excluded.include_pending,
      lookback_days = excluded.lookback_days,
      updated_at = excluded.updated_at;`,
    [
      ledgerId,
      connectionId,
      merged.direction,
      JSON.stringify(merged.excludeKeywords),
      merged.minAmountMinor,
      merged.includePending ? 1 : 0,
      merged.lookbackDays,
      nowIso(),
    ],
  )

  return getBankSyncRule(ledgerId, connectionId)
}

async function findBankTransactionByProviderId(ledgerId, bankAccountId, providerTransactionId) {
  const result = await query(
    `SELECT ledger_id, id, connection_id, bank_account_id, provider_transaction_id,
            posted_at, amount_minor, currency, description, merchant, status, transaction_type,
            note, summary, balance_minor, seen_in_app, imported, imported_txn_id, raw_json,
            first_seen_at, last_seen_at, created_at, updated_at
     FROM bank_transactions
     WHERE ledger_id = ?
       AND bank_account_id = ?
       AND provider_transaction_id = ?
     LIMIT 1;`,
    [ledgerId, bankAccountId, providerTransactionId],
  )
  return firstRow(result)
}

export async function upsertBankTransactions(ledgerId, connectionId, transactions = []) {
  assertLedgerId(ledgerId)
  if (!connectionId) throw new Error('connectionId is required')
  if (!Array.isArray(transactions) || !transactions.length) {
    return { addedIds: [], modifiedIds: [], touchedIds: [] }
  }

  const now = nowIso()
  const addedIds = []
  const modifiedIds = []
  const touchedIds = []
  let processedCount = 0

  for (const tx of transactions) {
    processedCount += 1
    if (processedCount % 20 === 0) {
      await yieldToMainThread()
    }

    const bankAccountId = normalizeText(tx?.bankAccountId)
    const providerTransactionId = normalizeText(tx?.providerTransactionId || tx?.id)
    if (!bankAccountId || !providerTransactionId) continue

    const nextRow = {
      posted_at: normalizeText(tx?.postedAt || tx?.posted_at, now),
      amount_minor: normalizeBankTxnAmountMinor(tx?.amountMinor ?? tx?.amount_minor),
      currency: normalizeCurrency(tx?.currency, 'TWD'),
      description: normalizeText(tx?.description) || null,
      merchant: normalizeText(tx?.merchant) || null,
      status: normalizeBankTxnStatus(tx?.status),
      transaction_type: normalizeText(tx?.transactionType ?? tx?.transaction_type) || null,
      note: normalizeText(tx?.note) || null,
      summary: normalizeText(tx?.summary) || null,
      balance_minor: normalizeBankTxnBalanceMinor(tx?.balanceMinor ?? tx?.balance_minor),
      raw_json: tx?.rawJson ? String(tx.rawJson) : JSON.stringify(tx ?? {}),
    }
    const existing = await findBankTransactionByProviderId(ledgerId, bankAccountId, providerTransactionId)
    if (!existing) {
      const id = createId('btx')
      await run(
        `INSERT INTO bank_transactions (
          ledger_id, id, connection_id, bank_account_id, provider_transaction_id,
          posted_at, amount_minor, currency, description, merchant, status, transaction_type,
          note, summary, balance_minor, seen_in_app, imported, imported_txn_id, raw_json,
          first_seen_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?, ?, ?);`,
        [
          ledgerId,
          id,
          connectionId,
          bankAccountId,
          providerTransactionId,
          nextRow.posted_at,
          nextRow.amount_minor,
          nextRow.currency,
          nextRow.description,
          nextRow.merchant,
          nextRow.status,
          nextRow.transaction_type,
          nextRow.note,
          nextRow.summary,
          nextRow.balance_minor,
          nextRow.raw_json,
          now,
          now,
          now,
          now,
        ],
      )
      addedIds.push(id)
      touchedIds.push(id)
      continue
    }

    const oldSummary = summarizeBankTxnForDiff(existing)
    const nextSummary = summarizeBankTxnForDiff(nextRow)
    const changed = oldSummary !== nextSummary
    if (changed) {
      await run(
        `UPDATE bank_transactions
         SET posted_at = ?,
             amount_minor = ?,
             currency = ?,
             description = ?,
             merchant = ?,
             status = ?,
             transaction_type = ?,
             note = ?,
             summary = ?,
             balance_minor = ?,
             raw_json = ?,
             last_seen_at = ?,
             updated_at = ?
         WHERE ledger_id = ? AND id = ?;`,
        [
          nextRow.posted_at,
          nextRow.amount_minor,
          nextRow.currency,
          nextRow.description,
          nextRow.merchant,
          nextRow.status,
          nextRow.transaction_type,
          nextRow.note,
          nextRow.summary,
          nextRow.balance_minor,
          nextRow.raw_json,
          now,
          now,
          ledgerId,
          existing.id,
        ],
      )
      modifiedIds.push(existing.id)
      touchedIds.push(existing.id)
    } else {
      await run(
        `UPDATE bank_transactions
         SET last_seen_at = ?,
             updated_at = ?
         WHERE ledger_id = ? AND id = ?;`,
        [now, now, ledgerId, existing.id],
      )
      touchedIds.push(existing.id)
    }
  }

  return { addedIds, modifiedIds, touchedIds }
}

export async function listBankTransactionsForReview(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const includeImported = Boolean(options.includeImported)
  const connectionId = normalizeText(options.connectionId)
  const limit = Math.max(1, Math.min(500, Math.round(Number(options.limit ?? 200) || 200))
  )

  const values = [ledgerId, includeImported ? 1 : 0, limit]
  let connectionClause = ''
  if (connectionId) {
    connectionClause = ' AND bt.connection_id = ?'
    values.splice(2, 0, connectionId)
  }

  const result = await query(
    `SELECT bt.ledger_id, bt.id, bt.connection_id, bt.bank_account_id, bt.provider_transaction_id,
            bt.posted_at, bt.amount_minor, bt.currency, bt.description, bt.merchant, bt.status,
            bt.transaction_type, bt.note, bt.summary, bt.balance_minor, bt.seen_in_app,
            bt.imported, bt.imported_txn_id, bt.first_seen_at, bt.last_seen_at, bt.updated_at,
            ba.provider_account_id, ba.account_name AS bank_account_name, ba.user_label AS bank_account_user_label, ba.account_mask AS bank_account_mask,
            ba.mapped_account_id, a.name AS mapped_account_name,
            bc.provider, bc.user_label AS connection_user_label
     FROM bank_transactions bt
     INNER JOIN bank_accounts ba
       ON ba.ledger_id = bt.ledger_id
      AND ba.id = bt.bank_account_id
     INNER JOIN bank_connections bc
       ON bc.ledger_id = bt.ledger_id
      AND bc.id = bt.connection_id
     LEFT JOIN accounts a
       ON a.ledger_id = ba.ledger_id
      AND a.id = ba.mapped_account_id
      AND a.deleted_at IS NULL
     WHERE bt.ledger_id = ?
       AND (? = 1 OR bt.imported = 0)
       ${connectionClause}
     ORDER BY bt.posted_at DESC, bt.updated_at DESC
     LIMIT ?;`,
    values,
  )
  return rowsOf(result)
}

export async function listBankTransactionsByIds(ledgerId, ids = []) {
  assertLedgerId(ledgerId)
  const normalizedIds = Array.from(new Set(ids.map((item) => normalizeText(item)).filter(Boolean)))
  if (!normalizedIds.length) return []
  const placeholders = toSqlInPlaceholders(normalizedIds)
  const result = await query(
    `SELECT bt.ledger_id, bt.id, bt.connection_id, bt.bank_account_id, bt.provider_transaction_id,
            bt.posted_at, bt.amount_minor, bt.currency, bt.description, bt.merchant, bt.status,
            bt.transaction_type, bt.note, bt.summary, bt.balance_minor, bt.seen_in_app,
            bt.imported, bt.imported_txn_id, bt.first_seen_at, bt.last_seen_at, bt.updated_at,
            ba.provider_account_id, ba.account_name AS bank_account_name, ba.user_label AS bank_account_user_label, ba.account_mask AS bank_account_mask,
            ba.mapped_account_id,
            bc.provider
     FROM bank_transactions bt
     INNER JOIN bank_accounts ba
       ON ba.ledger_id = bt.ledger_id
      AND ba.id = bt.bank_account_id
     INNER JOIN bank_connections bc
       ON bc.ledger_id = bt.ledger_id
      AND bc.id = bt.connection_id
     WHERE bt.ledger_id = ?
       AND bt.id IN (${placeholders});`,
    [ledgerId, ...normalizedIds],
  )
  return rowsOf(result)
}

export async function markBankTransactionsSeen(ledgerId, ids = []) {
  assertLedgerId(ledgerId)
  const normalizedIds = Array.from(new Set(ids.map((item) => normalizeText(item)).filter(Boolean)))
  if (!normalizedIds.length) return
  const placeholders = toSqlInPlaceholders(normalizedIds)
  await run(
    `UPDATE bank_transactions
     SET seen_in_app = 1,
         updated_at = ?
     WHERE ledger_id = ?
       AND id IN (${placeholders});`,
    [nowIso(), ledgerId, ...normalizedIds],
  )
}

export async function markBankTransactionsImported(ledgerId, mappings = []) {
  assertLedgerId(ledgerId)
  if (!Array.isArray(mappings) || !mappings.length) return
  const now = nowIso()
  let processedCount = 0
  for (const mapping of mappings) {
    processedCount += 1
    if (processedCount % 20 === 0) {
      await yieldToMainThread()
    }

    const bankTransactionId = normalizeText(mapping?.bankTransactionId)
    const importedTxnId = normalizeText(mapping?.importedTxnId)
    if (!bankTransactionId || !importedTxnId) continue
    await run(
      `UPDATE bank_transactions
       SET imported = 1,
           imported_txn_id = ?,
           seen_in_app = 1,
           updated_at = ?
       WHERE ledger_id = ? AND id = ?;`,
      [importedTxnId, now, ledgerId, bankTransactionId],
    )
  }
}

export async function clearBankMirrorDataByConnection(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!connectionId) return
  await run('DELETE FROM bank_transactions WHERE ledger_id = ? AND connection_id = ?;', [ledgerId, connectionId])
}

export async function findImportedLedgerTransactionBySourceRef(ledgerId, sourceRef) {
  assertLedgerId(ledgerId)
  const normalizedSourceRef = normalizeText(sourceRef)
  if (!normalizedSourceRef) return null
  const result = await query(
    `SELECT id, type, account_id, amount_minor, occurred_at
     FROM transactions
     WHERE ledger_id = ?
       AND origin_type = 'import'
       AND external_ref_id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, normalizedSourceRef],
  )
  return firstRow(result)
}
