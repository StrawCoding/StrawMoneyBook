import { Capacitor } from '@capacitor/core'
import { addTransaction } from '@/core/repositories/transaction.repo'
import {
  clearBankMirrorDataByConnection,
  findBankConnectionById,
  findImportedLedgerTransactionBySourceRef,
  getBankSyncRule,
  listBankAccountsByConnection,
  listBankConnections,
  listBankTransactionsByIds,
  listBankTransactionsForReview,
  listEnabledBankAccountsByConnection,
  markBankTransactionsImported,
  markBankTransactionsSeen,
  updateBankAccount,
  updateBankConnection,
  upsertBankAccounts,
  upsertBankConnection,
  upsertBankSyncRule,
  upsertBankTransactions,
} from '@/core/repositories/bank-sync.repo'
import {
  createBankLinkSession,
  disconnectBankAuth,
  exchangeBankAuth,
  listBankProviders,
  markImportedBankTransactions,
  syncBankTransactions,
} from '@/services/bank-sync/backend'

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeDirection(direction) {
  const value = normalizeText(direction).toLowerCase()
  if (value === 'income' || value === 'expense') return value
  return 'all'
}

function normalizeRuleInput(rule = {}) {
  const source = rule && typeof rule === 'object' ? rule : {}
  return {
    direction: normalizeDirection(source.direction),
    excludeKeywords: Array.isArray(source.excludeKeywords)
      ? source.excludeKeywords.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    minAmountMinor: Math.max(0, Math.round(Number(source.minAmountMinor ?? 0) || 0)),
    includePending: Boolean(source.includePending),
    lookbackDays: Math.min(30, Math.max(0, Math.round(Number(source.lookbackDays ?? 3) || 3))),
  }
}

function parseExcludeKeywordsFromText(text) {
  return String(text ?? '')
    .split(/[,\n，]/g)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function toExcludeKeywordText(keywords = []) {
  if (!Array.isArray(keywords) || !keywords.length) return ''
  return keywords.map((item) => normalizeText(item)).filter(Boolean).join(', ')
}

function buildSourceRef(provider, providerAccountId, providerTransactionId) {
  return `bank:${normalizeText(provider)}:${normalizeText(providerAccountId)}:${normalizeText(providerTransactionId)}`
}

function buildImportedNote(row) {
  const merchant = normalizeText(row?.merchant)
  const description = normalizeText(row?.description)
  if (merchant && description) return `${merchant}｜${description}`
  return merchant || description || null
}

function isUniqueConstraintError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return message.includes('unique constraint') || message.includes('constraint failed')
}

function applyRuleToBankTransaction(row, rule) {
  const direction = normalizeDirection(rule?.direction)
  const amountMinor = Math.round(Number(row?.amount_minor ?? 0) || 0)
  const isIncome = amountMinor > 0
  const isExpense = amountMinor < 0
  if (direction === 'income' && !isIncome) return false
  if (direction === 'expense' && !isExpense) return false

  const status = normalizeText(row?.status).toLowerCase()
  if (!rule?.includePending && status === 'pending') return false

  const minAmountMinor = Math.max(0, Math.round(Number(rule?.minAmountMinor ?? 0) || 0))
  if (Math.abs(amountMinor) < minAmountMinor) return false

  const text = `${normalizeText(row?.description)} ${normalizeText(row?.merchant)}`.toLowerCase()
  for (const keyword of Array.isArray(rule?.excludeKeywords) ? rule.excludeKeywords : []) {
    const token = normalizeText(keyword).toLowerCase()
    if (!token) continue
    if (text.includes(token)) return false
  }
  return true
}

function normalizeProviderAccountMap(accounts = []) {
  const map = new Map()
  for (const item of accounts) {
    const providerAccountId = normalizeText(item?.provider_account_id)
    if (!providerAccountId) continue
    map.set(providerAccountId, item)
  }
  return map
}

function normalizeBackendSyncRows(payloadRows = []) {
  if (!Array.isArray(payloadRows)) return []
  return payloadRows
    .map((item) => {
      const providerAccountId = normalizeText(item?.providerAccountId ?? item?.accountId ?? item?.provider_account_id)
      const providerTransactionId = normalizeText(item?.providerTransactionId ?? item?.id ?? item?.transactionId)
      const amountMinor = Math.round(Number(item?.amountMinor ?? item?.amount_minor ?? 0) || 0)
      if (!providerAccountId || !providerTransactionId || !amountMinor) return null
      return {
        providerAccountId,
        providerTransactionId,
        postedAt: normalizeText(item?.postedAt ?? item?.bookedAt ?? item?.posted_at) || new Date().toISOString(),
        amountMinor,
        currency: normalizeText(item?.currency ?? 'TWD').toUpperCase() || 'TWD',
        description: normalizeText(item?.description ?? item?.memo ?? item?.narration),
        merchant: normalizeText(item?.merchant ?? item?.counterparty ?? item?.merchantName),
        status: normalizeText(item?.status || 'posted').toLowerCase(),
        rawJson: JSON.stringify(item ?? {}),
      }
    })
    .filter(Boolean)
}

async function getConnectionBundle(ledgerId, connection) {
  const [accounts, rule] = await Promise.all([
    listBankAccountsByConnection(ledgerId, connection.id),
    getBankSyncRule(ledgerId, connection.id),
  ])
  return {
    ...connection,
    accounts,
    rule: {
      ...rule,
      excludeKeywordText: toExcludeKeywordText(rule.excludeKeywords),
    },
  }
}

export function getBankProviderOptions() {
  return listBankProviders()
}

export async function getBankSyncState(ledgerId) {
  assertLedgerId(ledgerId)
  const connections = await listBankConnections(ledgerId)
  const bundles = []
  for (const connection of connections) {
    bundles.push(await getConnectionBundle(ledgerId, connection))
  }
  return bundles
}

export async function connectBankProvider(ledgerId, provider, options = {}) {
  assertLedgerId(ledgerId)
  const normalizedProvider = normalizeText(provider)
  if (!normalizedProvider) throw new Error('缺少 provider')

  const platform = Capacitor.getPlatform()
  const callbackScheme = normalizeText(options.callbackScheme) || 'strawmoneybook'
  const deviceInfo = {
    platform,
    appVersion: normalizeText(options.appVersion) || 'unknown',
  }

  const linkSession = await createBankLinkSession({
    provider: normalizedProvider,
    callback_scheme: callbackScheme,
    device_info: deviceInfo,
  })

  const exchanged = await exchangeBankAuth({
    provider: normalizedProvider,
    session_id: normalizeText(linkSession?.session_id),
    code: normalizeText(options.code || linkSession?.mock_code || 'mock_approved'),
    public_token: normalizeText(options.publicToken),
  })

  const providerConnectionId = normalizeText(
    exchanged?.connection_id || exchanged?.provider_connection_id || exchanged?.item_id,
  )
  if (!providerConnectionId) {
    throw new Error('銀行授權成功但缺少 connection_id')
  }

  const connection = await upsertBankConnection(ledgerId, {
    provider: normalizedProvider,
    providerConnectionId,
    status: 'active',
    userLabel: normalizeText(exchanged?.connection_name || exchanged?.institution_name || normalizedProvider),
    lastSyncStatus: 'idle',
    lastError: '',
  })

  const rawAccounts = Array.isArray(exchanged?.accounts) ? exchanged.accounts : []
  await upsertBankAccounts(
    ledgerId,
    connection.id,
    rawAccounts.map((item) => ({
      providerAccountId: normalizeText(item?.account_id || item?.id),
      accountMask: normalizeText(item?.mask || item?.account_mask),
      accountName: normalizeText(item?.name || item?.account_name || item?.official_name || 'Bank Account'),
      accountType: normalizeText(item?.type || item?.subtype),
      currency: normalizeText(item?.currency || item?.iso_currency_code || 'TWD'),
    })),
  )

  return getConnectionBundle(ledgerId, connection)
}

export async function saveBankAccountSettings(ledgerId, bankAccountId, patch = {}) {
  assertLedgerId(ledgerId)
  return updateBankAccount(ledgerId, bankAccountId, patch)
}

export async function saveBankSyncRuleSettings(ledgerId, connectionId, patch = {}) {
  assertLedgerId(ledgerId)
  const merged = normalizeRuleInput({
    ...patch,
    excludeKeywords: Array.isArray(patch.excludeKeywords)
      ? patch.excludeKeywords
      : parseExcludeKeywordsFromText(patch.excludeKeywordText),
  })
  const saved = await upsertBankSyncRule(ledgerId, connectionId, merged)
  return {
    ...saved,
    excludeKeywordText: toExcludeKeywordText(saved.excludeKeywords),
  }
}

export async function syncBankConnectionNow(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  const connection = await findBankConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到銀行連結')
  if (String(connection.status ?? '').toLowerCase() === 'revoked') {
    throw new Error('此銀行連結已停用，請重新連結')
  }

  const [enabledAccounts, rule] = await Promise.all([
    listEnabledBankAccountsByConnection(ledgerId, connectionId),
    getBankSyncRule(ledgerId, connectionId),
  ])
  if (!enabledAccounts.length) {
    throw new Error('請先啟用至少一個銀行帳戶同步')
  }

  try {
    const syncRes = await syncBankTransactions({
      provider: connection.provider,
      connection_id: connection.provider_connection_id,
      mode: 'delta',
      cursor: normalizeText(connection.sync_cursor) || null,
      last_sync_at: normalizeText(connection.last_sync_at) || null,
      lookback_days: rule.lookbackDays,
      account_ids: enabledAccounts.map((item) => item.provider_account_id),
    })

    const normalizedRows = normalizeBackendSyncRows([
      ...(Array.isArray(syncRes?.added) ? syncRes.added : []),
      ...(Array.isArray(syncRes?.modified) ? syncRes.modified : []),
    ])
    const providerAccountMap = normalizeProviderAccountMap(enabledAccounts)
    const rowsToUpsert = normalizedRows
      .map((item) => {
        const account = providerAccountMap.get(item.providerAccountId)
        if (!account) return null
        return {
          bankAccountId: account.id,
          providerTransactionId: item.providerTransactionId,
          postedAt: item.postedAt,
          amountMinor: item.amountMinor,
          currency: item.currency || account.currency || 'TWD',
          description: item.description,
          merchant: item.merchant,
          status: item.status,
          rawJson: item.rawJson,
        }
      })
      .filter(Boolean)

    const upsertRes = await upsertBankTransactions(ledgerId, connectionId, rowsToUpsert)
    const touchedIds = Array.from(new Set([...upsertRes.addedIds, ...upsertRes.modifiedIds]))
    const touchedRows = touchedIds.length ? await listBankTransactionsByIds(ledgerId, touchedIds) : []

    const ruleForSelection = normalizeRuleInput(rule)
    const added = touchedRows
      .filter((item) => upsertRes.addedIds.includes(item.id))
      .map((item) => ({
        ...item,
        defaultSelected: !item.imported && applyRuleToBankTransaction(item, ruleForSelection),
      }))
    const modified = touchedRows
      .filter((item) => upsertRes.modifiedIds.includes(item.id))
      .map((item) => ({
        ...item,
        defaultSelected: false,
      }))

    const syncTime = normalizeText(syncRes?.sync_time) || new Date().toISOString()
    const nextCursor = normalizeText(syncRes?.next_cursor || syncRes?.nextCursor || syncRes?.cursor)

    await updateBankConnection(ledgerId, connectionId, {
      status: 'active',
      lastSyncAt: syncTime,
      syncCursor: nextCursor || connection.sync_cursor || null,
      lastSyncStatus: 'ok',
      lastError: '',
    })

    return {
      added,
      modified,
      nextCursor: nextCursor || null,
      syncTime,
      raw: syncRes,
    }
  } catch (error) {
    await updateBankConnection(ledgerId, connectionId, {
      status: 'error',
      lastSyncStatus: 'error',
      lastError: String(error?.message ?? error ?? '同步失敗'),
    })
    throw error
  }
}

export async function listBankReviewTransactions(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const rows = await listBankTransactionsForReview(ledgerId, options)
  if (!options.connectionId) return rows
  const rule = await getBankSyncRule(ledgerId, options.connectionId)
  const normalizedRule = normalizeRuleInput(rule)
  return rows.map((item) => ({
    ...item,
    defaultSelected: !item.imported && applyRuleToBankTransaction(item, normalizedRule),
  }))
}

export async function importSelectedBankTransactions(ledgerId, bankTransactionIds = []) {
  assertLedgerId(ledgerId)
  const rows = await listBankTransactionsByIds(ledgerId, bankTransactionIds)
  if (!rows.length) {
    return {
      importedCount: 0,
      skippedCount: 0,
      skipped: [],
      importedMappings: [],
    }
  }

  const importedMappings = []
  const skipped = []

  for (const row of rows) {
    const bankTransactionId = row.id
    if (Number(row.imported ?? 0) === 1 && normalizeText(row.imported_txn_id)) {
      skipped.push({ bankTransactionId, reason: 'already_imported' })
      continue
    }

    const mappedAccountId = normalizeText(row.mapped_account_id)
    if (!mappedAccountId) {
      skipped.push({ bankTransactionId, reason: 'missing_mapped_account' })
      continue
    }

    const sourceRef = buildSourceRef(row.provider, row.bank_account_id, row.provider_transaction_id)
    let existing = await findImportedLedgerTransactionBySourceRef(ledgerId, sourceRef)

    if (!existing) {
      try {
        const createdTxId = await addTransaction(ledgerId, {
          type: Number(row.amount_minor ?? 0) >= 0 ? 'income' : 'expense',
          accountId: mappedAccountId,
          peerAccountId: null,
          categoryId: null,
          amountMinor: Math.round(Number(row.amount_minor ?? 0)),
          occurredAt: normalizeText(row.posted_at) || new Date().toISOString(),
          note: buildImportedNote(row),
          location: null,
          tagsJson: null,
          originType: 'import',
          externalRefId: sourceRef,
          idempotencyKey: sourceRef,
          includeInBudget: true,
          includeInAnalysis: true,
        })
        existing = { id: createdTxId }
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          skipped.push({
            bankTransactionId,
            reason: 'create_failed',
            message: String(error?.message ?? error ?? 'create failed'),
          })
          continue
        }
        existing = await findImportedLedgerTransactionBySourceRef(ledgerId, sourceRef)
      }
    }

    if (!existing?.id) {
      skipped.push({ bankTransactionId, reason: 'idempotency_failed' })
      continue
    }
    importedMappings.push({
      bankTransactionId,
      importedTxnId: existing.id,
      sourceRef,
    })
  }

  if (importedMappings.length) {
    await markBankTransactionsImported(ledgerId, importedMappings)
    try {
      await markImportedBankTransactions({
        transactions: importedMappings.map((item) => ({
          source_ref: item.sourceRef,
          imported_txn_id: item.importedTxnId,
        })),
      })
    } catch {
      // Keep backend analytics callback as best effort only.
    }
  }

  return {
    importedCount: importedMappings.length,
    skippedCount: skipped.length,
    skipped,
    importedMappings,
  }
}

export async function markBankReviewTransactionsSeen(ledgerId, ids = []) {
  assertLedgerId(ledgerId)
  await markBankTransactionsSeen(ledgerId, ids)
}

export async function disconnectBankConnection(ledgerId, connectionId, options = {}) {
  assertLedgerId(ledgerId)
  const connection = await findBankConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到銀行連結')

  try {
    await disconnectBankAuth({
      provider: connection.provider,
      connection_id: connection.provider_connection_id,
    })
  } catch {
    // Keep disconnection resilient; local revoke still applies.
  }

  await updateBankConnection(ledgerId, connectionId, {
    status: 'revoked',
    lastSyncStatus: 'idle',
    lastError: '',
    deletedAt: options.softDelete === true ? new Date().toISOString() : null,
  })

  if (options.clearMirrorData) {
    await clearBankMirrorDataByConnection(ledgerId, connectionId)
  }

  return true
}
