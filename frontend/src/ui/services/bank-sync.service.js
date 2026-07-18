import { Capacitor } from '@capacitor/core'
import {
  createBankLinkSession,
  disconnectBankAuth,
  exchangeBankAuth,
  listBankProviders,
  markImportedBankTransactions,
  syncBankTransactions,
} from '../../services/bank-sync/backend.js'
import {
  buildImportedNote as buildImportedNoteFromMetadata,
  createFirstBankProviderConnectionId,
  formatBankErrorForStorage,
  isFirstBankProviderId as isFirstBankProviderIdShared,
  isMockProviderId as isMockProviderIdShared,
  selectSyncableBankAccounts,
  shouldRequireReconnectAfterBankSyncError,
  shouldRequireReconnectForStoredBankConnection,
} from '../../services/bank-sync/shared.js'
import { traceBankSyncOperation } from '../../core/services/bank-sync-debug.service.js'
import { yieldToMainThread } from '../../core/utils/cooperative-yield.js'
import { buildBankImportPlan } from '../../services/bank-sync/import-auto-rule.js'

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
}

async function defaultAssertCanUseBankSync() {
  const mod = await import('../../core/services/membership.service.js')
  return mod.assertCanUseBankSync()
}

async function defaultHasBankSyncMembershipAccess() {
  const mod = await import('../../core/services/membership.service.js')
  return mod.hasBankSyncMembershipAccess()
}

async function defaultAddTransaction(...args) {
  const mod = await import('../../core/repositories/transaction.repo.js')
  return mod.addTransaction(...args)
}

async function defaultAddTransfer(...args) {
  const mod = await import('../../core/repositories/transaction.repo.js')
  return mod.addTransfer(...args)
}

async function defaultClearBankMirrorDataByConnection(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.clearBankMirrorDataByConnection(...args)
}

async function defaultDeleteEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.deleteEncryptedSetting(...args)
}

async function defaultFindBankConnectionById(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.findBankConnectionById(...args)
}

async function defaultFindImportedLedgerTransactionBySourceRef(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.findImportedLedgerTransactionBySourceRef(...args)
}

async function defaultGetAutoFillRules(...args) {
  const mod = await import('./auto-fill-rule.service.js')
  return mod.getAutoFillRules(...args)
}

async function defaultGetBankSyncRule(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.getBankSyncRule(...args)
}

async function defaultGetEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.getEncryptedSetting(...args)
}

async function defaultListBankAccountsByConnection(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.listBankAccountsByConnection(...args)
}

async function defaultListBankConnections(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.listBankConnections(...args)
}

async function defaultListBankTransactionsByIds(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.listBankTransactionsByIds(...args)
}

async function defaultListBankTransactionsForReview(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.listBankTransactionsForReview(...args)
}

async function defaultCountBankTransactionsForReview(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.countBankTransactionsForReview(...args)
}

async function defaultListEnabledBankAccountsByConnection(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.listEnabledBankAccountsByConnection(...args)
}

async function defaultMarkBankTransactionsImported(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.markBankTransactionsImported(...args)
}

async function defaultMarkBankTransactionsSeen(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.markBankTransactionsSeen(...args)
}

async function defaultSetEncryptedSetting(...args) {
  const mod = await import('./secure-setting.service.js')
  return mod.setEncryptedSetting(...args)
}

async function defaultUpdateBankAccount(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.updateBankAccount(...args)
}

async function defaultUpdateBankConnection(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.updateBankConnection(...args)
}

async function defaultUpsertBankAccounts(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.upsertBankAccounts(...args)
}

async function defaultUpsertBankConnection(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.upsertBankConnection(...args)
}

async function defaultUpsertBankSyncRule(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.upsertBankSyncRule(...args)
}

async function defaultUpsertBankTransactions(...args) {
  const mod = await import('../../core/repositories/bank-sync.repo.js')
  return mod.upsertBankTransactions(...args)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProviderId(value) {
  return normalizeText(value).toLowerCase()
}

function isMockProviderId(provider) {
  return isMockProviderIdShared(provider)
}

function isFirstBankProviderId(provider) {
  return isFirstBankProviderIdShared(provider)
}

function normalizeDateInput(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[1]}-${match[2]}-${match[3]}`
}

function buildBankCredentialSettingKey(connectionId) {
  return `bank_sync.credentials.${normalizeText(connectionId)}`
}

function sanitizeBankCredentialState(value) {
  if (!value || typeof value !== 'object') return null
  return {
    provider: normalizeText(value.provider),
    sessionToken: normalizeText(value.sessionToken || value.accessTokenRef),
    accessTokenRef: normalizeText(value.accessTokenRef || value.sessionToken),
    updatedAt: normalizeText(value.updatedAt) || new Date().toISOString(),
  }
}

function shouldRewriteBankCredentialState(value) {
  if (!value || typeof value !== 'object') return false
  const allowedKeys = new Set(['provider', 'sessionToken', 'accessTokenRef', 'updatedAt'])
  return Object.keys(value).some((key) => !allowedKeys.has(key))
}

function buildDeviceInfo(options = {}) {
  const platform = Capacitor.getPlatform()
  const callbackScheme = normalizeText(options.callbackScheme) || 'strawmoneybook'
  const deviceInfo = {
    platform,
    appVersion: normalizeText(options.appVersion) || 'unknown',
  }
  return {
    callbackScheme,
    deviceInfo,
  }
}

function buildBankCredentialPayload(options = {}) {
  const loginCustIdFake = normalizeText(options.nationalId)
  const loginCustIdRptSeq = normalizeText(options.repeatSeq || '0')
  const usrIdInput = normalizeText(options.code)
  const pwd = String(options.password ?? '')
  const vrfyCode = normalizeText(options.captchaCode)
  const hitX = normalizeText(options.loginHitX)
  const hitY = normalizeText(options.loginHitY)

  if (!loginCustIdFake && !usrIdInput && !pwd && !vrfyCode && !hitX && !hitY) {
    return null
  }

  return {
    loginCustIdFake,
    loginCustIdRptSeq,
    usrIdInput,
    pwd,
    vrfyCode,
    hitX,
    hitY,
  }
}

function buildBankAutomationPayload() {
  return {
    fields: {
      loginCustIdFake: 'loginCustIdFake',
      loginCustIdRptSeq: 'loginCustIdRptSeq',
      usrIdInput: 'usrIdInput',
      pwd: 'pwd',
      vrfyCode: 'vrfyCode',
    },
    captchaImageId: 'code_verify',
    refreshCaptchaAction: 'javascript:chgImg();',
  }
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
        balanceMinor: item?.balanceMinor ?? item?.balance_minor ?? null,
        currency: normalizeText(item?.currency ?? 'TWD').toUpperCase() || 'TWD',
        transactionType: normalizeText(item?.transactionType ?? item?.transaction_type),
        note: normalizeText(item?.note),
        summary: normalizeText(item?.summary),
        description: normalizeText(item?.description ?? item?.memo ?? item?.narration),
        merchant: normalizeText(item?.merchant ?? item?.counterparty ?? item?.merchantName),
        status: normalizeText(item?.status || 'posted').toLowerCase(),
        rawJson: JSON.stringify(item ?? {}),
      }
    })
    .filter(Boolean)
}

const defaultDependencies = {
  addTransaction: defaultAddTransaction,
  addTransfer: defaultAddTransfer,
  assertCanUseBankSync: defaultAssertCanUseBankSync,
  hasBankSyncMembershipAccess: defaultHasBankSyncMembershipAccess,
  clearBankMirrorDataByConnection: defaultClearBankMirrorDataByConnection,
  createBankLinkSession,
  deleteEncryptedSetting: defaultDeleteEncryptedSetting,
  disconnectBankAuth,
  exchangeBankAuth,
  findBankConnectionById: defaultFindBankConnectionById,
  findImportedLedgerTransactionBySourceRef: defaultFindImportedLedgerTransactionBySourceRef,
  getAutoFillRules: defaultGetAutoFillRules,
  getBankSyncRule: defaultGetBankSyncRule,
  getEncryptedSetting: defaultGetEncryptedSetting,
  listBankAccountsByConnection: defaultListBankAccountsByConnection,
  listBankConnections: defaultListBankConnections,
  listBankProviders,
  listBankTransactionsByIds: defaultListBankTransactionsByIds,
  listBankTransactionsForReview: defaultListBankTransactionsForReview,
  countBankTransactionsForReview: defaultCountBankTransactionsForReview,
  listEnabledBankAccountsByConnection: defaultListEnabledBankAccountsByConnection,
  markBankTransactionsImported: defaultMarkBankTransactionsImported,
  markBankTransactionsSeen: defaultMarkBankTransactionsSeen,
  markImportedBankTransactions,
  setEncryptedSetting: defaultSetEncryptedSetting,
  syncBankTransactions,
  traceBankSyncOperation,
  updateBankAccount: defaultUpdateBankAccount,
  updateBankConnection: defaultUpdateBankConnection,
  upsertBankAccounts: defaultUpsertBankAccounts,
  upsertBankConnection: defaultUpsertBankConnection,
  upsertBankSyncRule: defaultUpsertBankSyncRule,
  upsertBankTransactions: defaultUpsertBankTransactions,
  yieldToMainThread,
}
const dependencies = { ...defaultDependencies }

export function setBankSyncServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetBankSyncServiceDependenciesForTest() {
  for (const key of Object.keys(dependencies)) {
    if (!(key in defaultDependencies)) {
      delete dependencies[key]
    }
  }
  Object.assign(dependencies, defaultDependencies)
}

async function getConnectionBundle(ledgerId, connection) {
  const [accounts, rule] = await Promise.all([
    dependencies.listBankAccountsByConnection(ledgerId, connection.id),
    dependencies.getBankSyncRule(ledgerId, connection.id),
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
  return dependencies.listBankProviders()
}

export async function prepareBankProviderLink(ledgerId, provider, options = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const normalizedProvider = normalizeText(provider)
  if (!normalizedProvider) throw new Error('缺少 provider')
  if (isFirstBankProviderId(normalizedProvider)) {
    return {
      provider: normalizedProvider,
      session_id: null,
      native_automation: true,
    }
  }

  const { callbackScheme, deviceInfo } = buildDeviceInfo(options)
  return dependencies.createBankLinkSession({
    provider: normalizedProvider,
    session_id: normalizeText(options.sessionId) || null,
    refresh_captcha: Boolean(options.refreshCaptcha),
    callback_scheme: callbackScheme,
    device_info: deviceInfo,
    credentials: buildBankCredentialPayload(options),
    automation: buildBankAutomationPayload(),
  })
}

export async function getBankSyncState(ledgerId) {
  assertLedgerId(ledgerId)
  // Read path: free users stay on settings with availability panel; do not assert/navigate away.
  if (!(await dependencies.hasBankSyncMembershipAccess())) return []
  const connections = await dependencies.listBankConnections(ledgerId)
  const bundles = []
  for (const connection of connections) {
    bundles.push(await getConnectionBundle(ledgerId, connection))
  }
  return bundles
}

export async function getBankSyncConnectionDetail(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  if (!(await dependencies.hasBankSyncMembershipAccess())) return null
  const connection = await dependencies.findBankConnectionById(ledgerId, connectionId)
  if (!connection) return null
  return getConnectionBundle(ledgerId, connection)
}

export async function connectBankProvider(ledgerId, provider, options = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const normalizedProvider = normalizeText(provider)
  if (!normalizedProvider) throw new Error('缺少 provider')
  const isNativeFirstBank = isFirstBankProviderId(normalizedProvider)

  if (isNativeFirstBank) {
    const providerConnectionId = createFirstBankProviderConnectionId({
      nationalId: options.nationalId,
      repeatSeq: options.repeatSeq,
      userCode: options.code,
    })
    if (!providerConnectionId) {
      throw new Error('第一銀行登入身分資料不完整')
    }
    return dependencies.traceBankSyncOperation('connect_first_bank', {
      ledgerId,
      provider: normalizedProvider,
      connectionId: providerConnectionId,
    }, async (traceContext) => {
      const exchanged = await dependencies.exchangeBankAuth({
        provider: normalizedProvider,
        connectionId: providerConnectionId,
        nationalId: normalizeText(options.nationalId),
        repeatSeq: normalizeText(options.repeatSeq || '0'),
        userCode: normalizeText(options.code),
        password: String(options.password ?? ''),
        captchaCode: normalizeText(options.captchaCode),
        initialSyncStartDate: normalizeDateInput(options.initialSyncStartDate),
      })
      traceContext.attachDebugTrace(exchanged?.debugTrace)

      const connection = await dependencies.upsertBankConnection(ledgerId, {
        id: providerConnectionId,
        provider: normalizedProvider,
        providerConnectionId,
        status: 'active',
        userLabel: normalizeText(exchanged?.connection_name || exchanged?.institution_name || 'First Bank'),
        syncCursor: normalizeText(exchanged?.sync_cursor || exchanged?.next_cursor || exchanged?.cursor),
        lastSyncStatus: 'idle',
        lastError: '',
      })

      const rawAccounts = Array.isArray(exchanged?.accounts) ? exchanged.accounts : []
      await dependencies.upsertBankAccounts(
        ledgerId,
        connection.id,
        rawAccounts.map((item) => ({
          providerAccountId: normalizeText(item?.account_id || item?.id),
          accountMask: normalizeText(item?.mask || item?.account_mask),
          accountName: normalizeText(item?.name || item?.account_name || item?.official_name || 'First Bank Account'),
          accountType: normalizeText(item?.type || item?.subtype),
          currency: normalizeText(item?.currency || item?.iso_currency_code || 'TWD'),
          enabled: true,
        })),
      )

      await dependencies.deleteEncryptedSetting(ledgerId, buildBankCredentialSettingKey(connection.id))
      return getConnectionBundle(ledgerId, connection)
    })
  }

  throw new Error('目前僅支援第一銀行 Android 本地同步')
}

export async function saveBankAccountSettings(ledgerId, bankAccountId, patch = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  return dependencies.updateBankAccount(ledgerId, bankAccountId, patch)
}

export async function saveBankAccountsSettings(ledgerId, accountPatches = []) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const results = []
  for (const [index, item] of accountPatches.entries()) {
    if (index > 0 && index % 10 === 0) {
      await dependencies.yieldToMainThread()
    }
    const bankAccountId = normalizeText(item?.bankAccountId || item?.id)
    if (!bankAccountId) continue
    results.push(await dependencies.updateBankAccount(ledgerId, bankAccountId, {
      enabled: item.enabled,
      mappedAccountId: item.mappedAccountId,
      userLabel: item.userLabel,
    }))
  }
  return results
}

export async function countBankReviewTransactionsByConnection(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const normalizedConnectionId = normalizeText(connectionId)
  if (!normalizedConnectionId) return 0
  return dependencies.countBankTransactionsForReview(ledgerId, {
    connectionId: normalizedConnectionId,
    includeImported: false,
  })
}

export async function saveBankSyncRuleSettings(ledgerId, connectionId, patch = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const merged = normalizeRuleInput({
    ...patch,
    excludeKeywords: Array.isArray(patch.excludeKeywords)
      ? patch.excludeKeywords
      : parseExcludeKeywordsFromText(patch.excludeKeywordText),
  })
  const saved = await dependencies.upsertBankSyncRule(ledgerId, connectionId, merged)
  return {
    ...saved,
    excludeKeywordText: toExcludeKeywordText(saved.excludeKeywords),
  }
}

export async function syncBankConnectionNow(ledgerId, connectionId) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const connection = await dependencies.findBankConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到銀行連結')
  const normalizedStatus = String(connection.status ?? '').toLowerCase()
  if (normalizedStatus === 'revoked') {
    throw new Error('此銀行連結已停用，請重新連結')
  }
  if (shouldRequireReconnectForStoredBankConnection(connection.provider, connection.status, connection.last_error)) {
    throw new Error('第一銀行連線已進入錯誤狀態，請先中斷連線並重新新增')
  }

  const [enabledAccounts, rule] = await Promise.all([
    dependencies.listEnabledBankAccountsByConnection(ledgerId, connectionId),
    dependencies.getBankSyncRule(ledgerId, connectionId),
  ])
  const syncableAccounts = selectSyncableBankAccounts(enabledAccounts)
  if (!syncableAccounts.length) {
    throw new Error('請先啟用並對應至少一個銀行帳戶後再同步')
  }

  return dependencies.traceBankSyncOperation('sync_bank_connection', {
    ledgerId,
    provider: connection.provider,
    connectionId,
  }, async (traceContext) => {
    try {
      const secureSettingKey = buildBankCredentialSettingKey(connectionId)
      const isNativeFirstBank = isFirstBankProviderId(connection.provider)
      let savedCredentialState = null
      let sanitizedCredentialState = null
      let sessionToken = ''

      if (!isNativeFirstBank) {
        savedCredentialState = await dependencies.getEncryptedSetting(ledgerId, secureSettingKey)
        sanitizedCredentialState = sanitizeBankCredentialState(savedCredentialState)
        if (shouldRewriteBankCredentialState(savedCredentialState)) {
          if (sanitizedCredentialState) {
            await dependencies.setEncryptedSetting(ledgerId, secureSettingKey, sanitizedCredentialState)
          }
        }
        const effectiveCredentialState = sanitizedCredentialState ?? savedCredentialState
        sessionToken = normalizeText(effectiveCredentialState?.sessionToken || effectiveCredentialState?.accessTokenRef)
        if (isFirstBankProviderId(connection.provider) && !sessionToken) {
          throw new Error('第一銀行同步 Session 已失效，請重新連線並重新登入一次')
        }
      }

      const syncRes = await dependencies.syncBankTransactions({
        provider: connection.provider,
        connectionId: connection.id,
        connection_id: connection.provider_connection_id,
        mode: 'delta',
        cursor: normalizeText(connection.sync_cursor) || null,
        last_sync_at: normalizeText(connection.last_sync_at) || null,
        lookback_days: rule.lookbackDays,
        account_ids: syncableAccounts.map((item) => item.provider_account_id),
        accountIds: syncableAccounts.map((item) => item.provider_account_id),
        session_token: isNativeFirstBank ? null : (sessionToken || null),
        access_token_ref: isNativeFirstBank ? null : (sessionToken || null),
      })
      traceContext.attachDebugTrace(syncRes?.debugTrace)

      const normalizedRows = normalizeBackendSyncRows([
        ...(Array.isArray(syncRes?.added) ? syncRes.added : []),
        ...(Array.isArray(syncRes?.modified) ? syncRes.modified : []),
      ])
      const providerAccountMap = normalizeProviderAccountMap(syncableAccounts)
      const rowsToUpsert = normalizedRows
        .map((item) => {
          const account = providerAccountMap.get(item.providerAccountId)
          if (!account) return null
          return {
            bankAccountId: account.id,
            providerTransactionId: item.providerTransactionId,
            postedAt: item.postedAt,
            amountMinor: item.amountMinor,
            balanceMinor: item.balanceMinor,
            currency: item.currency || account.currency || 'TWD',
            transactionType: item.transactionType,
            note: item.note,
            summary: item.summary,
            description: item.description,
            merchant: item.merchant,
            status: item.status,
            rawJson: item.rawJson,
          }
        })
        .filter(Boolean)

      const upsertRes = await dependencies.upsertBankTransactions(ledgerId, connectionId, rowsToUpsert)
      const touchedIds = Array.from(new Set([...upsertRes.addedIds, ...upsertRes.modifiedIds]))
      const touchedRows = touchedIds.length ? await dependencies.listBankTransactionsByIds(ledgerId, touchedIds) : []

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
      const nextSessionToken = normalizeText(syncRes?.session_token || syncRes?.access_token_ref)

      if (nextSessionToken && !isMockProviderId(connection.provider) && !isNativeFirstBank) {
        await dependencies.setEncryptedSetting(ledgerId, secureSettingKey, {
          ...(savedCredentialState && typeof savedCredentialState === 'object' ? savedCredentialState : {}),
          sessionToken: nextSessionToken,
          accessTokenRef: nextSessionToken,
          updatedAt: new Date().toISOString(),
        })
      }

      await dependencies.updateBankConnection(ledgerId, connectionId, {
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
      const requiresReconnect = shouldRequireReconnectAfterBankSyncError(connection.provider, error)
      await dependencies.updateBankConnection(ledgerId, connectionId, {
        status: requiresReconnect ? 'error' : 'active',
        lastSyncStatus: 'error',
        lastError: formatBankErrorForStorage(error),
      })
      throw error
    }
  })
}

function normalizeBankReviewPage(value) {
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1
}

export async function listBankReviewTransactions(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const { BANK_REVIEW_PAGE_SIZE } = await import('../../core/repositories/bank-sync.repo.js')
  const page = normalizeBankReviewPage(options.page)
  const pageSize = BANK_REVIEW_PAGE_SIZE
  const result = await dependencies.listBankTransactionsForReview(ledgerId, {
    ...options,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = Number(result.total ?? 0)
  const items = Array.isArray(result.items) ? result.items : []
  if (!options.connectionId) {
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }
  const rule = await dependencies.getBankSyncRule(ledgerId, options.connectionId)
  const normalizedRule = normalizeRuleInput(rule)
  return {
    items: items.map((item) => ({
      ...item,
      defaultSelected: !item.imported && applyRuleToBankTransaction(item, normalizedRule),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function importBankStatementCsv(ledgerId, connectionId, bankAccountId, csvText) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const connection = await dependencies.findBankConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到銀行連結')

  const accounts = await dependencies.listBankAccountsByConnection(ledgerId, connectionId)
  const account = accounts.find((item) => normalizeText(item.id) === normalizeText(bankAccountId))
  if (!account) throw new Error('找不到銀行帳戶')

  const { parseBankStatementCsv } = await import('../../services/bank-sync/bank-statement-csv.js')
  const parsedRows = parseBankStatementCsv(csvText, {
    provider: connection.provider,
    providerAccountId: account.provider_account_id,
  })
  if (!parsedRows.length) {
    return { addedCount: 0, skippedCount: 0, touchedIds: [] }
  }

  const rowsToUpsert = parsedRows.map((item) => ({
    bankAccountId: account.id,
    providerTransactionId: item.providerTransactionId,
    postedAt: item.postedAt,
    amountMinor: item.amountMinor,
    balanceMinor: item.balanceMinor,
    currency: item.currency,
    transactionType: item.transactionType,
    note: item.note,
    summary: item.summary,
    description: item.description,
    merchant: item.merchant,
    status: item.status,
    rawJson: item.rawJson,
  }))

  const upsertRes = await dependencies.upsertBankTransactions(ledgerId, connectionId, rowsToUpsert)
  return {
    addedCount: upsertRes.addedIds.length,
    skippedCount: Math.max(0, parsedRows.length - upsertRes.touchedIds.length),
    touchedIds: upsertRes.touchedIds,
    addedIds: upsertRes.addedIds,
    modifiedIds: upsertRes.modifiedIds,
  }
}

export async function importSelectedBankTransactions(ledgerId, bankTransactionIds = []) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const [rows, autoFillRules] = await Promise.all([
    dependencies.listBankTransactionsByIds(ledgerId, bankTransactionIds),
    dependencies.getAutoFillRules(ledgerId).catch(() => []),
  ])
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

  for (const [index, row] of rows.entries()) {
    if (index > 0 && index % 10 === 0) {
      await dependencies.yieldToMainThread()
    }

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

    const providerAccountId = normalizeText(row.provider_account_id || row.bank_account_id)
    const sourceRef = buildSourceRef(row.provider, providerAccountId, row.provider_transaction_id)
    let existing = await dependencies.findImportedLedgerTransactionBySourceRef(ledgerId, sourceRef)
    const importPlan = buildBankImportPlan(row, autoFillRules)

    if (!existing) {
      try {
        if (importPlan.mode === 'transfer') {
          const transfer = await dependencies.addTransfer(ledgerId, {
            fromAccountId: importPlan.fromAccountId,
            toAccountId: importPlan.toAccountId,
            amountMinor: Math.abs(Math.round(Number(row.amount_minor ?? 0))),
            occurredAt: normalizeText(row.posted_at) || new Date().toISOString(),
            note: importPlan.note,
            originType: 'import',
            externalRefId: sourceRef,
            idempotencyKey: sourceRef,
          })
          existing = { id: importPlan.importedTxnSide === 'in' ? transfer.inTxId : transfer.outTxId }
        } else {
          const createdTxId = await dependencies.addTransaction(ledgerId, {
            type: importPlan.type,
            accountId: importPlan.accountId || mappedAccountId,
            peerAccountId: null,
            categoryId: importPlan.categoryId || null,
            amountMinor: Math.round(Number(row.amount_minor ?? 0)),
            occurredAt: normalizeText(row.posted_at) || new Date().toISOString(),
            note: importPlan.note || buildImportedNoteFromMetadata(row),
            location: null,
            tagsJson: null,
            originType: 'import',
            externalRefId: sourceRef,
            idempotencyKey: sourceRef,
            isReimbursable: importPlan.isReimbursable,
            includeInBudget: true,
            includeInAnalysis: true,
          })
          existing = { id: createdTxId }
        }
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          skipped.push({
            bankTransactionId,
            reason: 'create_failed',
            message: String(error?.message ?? error ?? 'create failed'),
          })
          continue
        }
        existing = await dependencies.findImportedLedgerTransactionBySourceRef(ledgerId, sourceRef)
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
    await dependencies.markBankTransactionsImported(ledgerId, importedMappings)
    try {
      await dependencies.markImportedBankTransactions({
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
  await dependencies.assertCanUseBankSync()
  await dependencies.markBankTransactionsSeen(ledgerId, ids)
}

export async function disconnectBankConnection(ledgerId, connectionId, options = {}) {
  assertLedgerId(ledgerId)
  await dependencies.assertCanUseBankSync()
  const connection = await dependencies.findBankConnectionById(ledgerId, connectionId)
  if (!connection) throw new Error('找不到銀行連結')

  return dependencies.traceBankSyncOperation('disconnect_bank_connection', {
    ledgerId,
    provider: connection.provider,
    connectionId,
  }, async () => {
    try {
      if (isFirstBankProviderId(connection.provider)) {
        await dependencies.disconnectBankAuth({
          provider: connection.provider,
          connectionId: connection.id,
          connection_id: connection.provider_connection_id,
        })
      } else {
        await dependencies.disconnectBankAuth({
          provider: connection.provider,
          connection_id: connection.provider_connection_id,
        })
      }
    } catch {
      // Keep disconnection resilient; local revoke still applies.
    }

    await dependencies.updateBankConnection(ledgerId, connectionId, {
      status: 'revoked',
      lastSyncStatus: 'idle',
      lastError: '',
      deletedAt: options.softDelete === true ? new Date().toISOString() : null,
    })

    if (options.clearMirrorData) {
      await dependencies.clearBankMirrorDataByConnection(ledgerId, connectionId)
    }

    await dependencies.deleteEncryptedSetting(ledgerId, buildBankCredentialSettingKey(connectionId))

    return true
  })
}
