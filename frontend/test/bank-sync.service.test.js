import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { resetBankSyncDebugTraceForTest } from '../src/core/services/bank-sync-debug.service.js'
import {
  importBankStatementCsv,
  importSelectedBankTransactions,
  resetBankSyncServiceDependenciesForTest,
  setBankSyncServiceDependenciesForTest,
  syncBankConnectionNow,
} from '../src/ui/services/bank-sync.service.js'

function createTraceStub() {
  return async (_operation, _meta, task) => task({
    attachDebugTrace() {},
  })
}

function createBaseDependencies(overrides = {}) {
  return {
    assertCanUseBankSync: async () => {},
    hasBankSyncMembershipAccess: async () => true,
    markBankTransactionsImported: async () => {},
    markImportedBankTransactions: async () => {},
    updateBankAccount: async () => ({}),
    traceBankSyncOperation: createTraceStub(),
    yieldToMainThread: async () => {},
    ...overrides,
  }
}

function createSyncableAccount(overrides = {}) {
  return {
    id: 'bank-account-1',
    provider_account_id: 'provider-account-1',
    enabled: 1,
    mapped_account_id: 'asset_bank',
    currency: 'TWD',
    ...overrides,
  }
}

function createBankConnection(overrides = {}) {
  return {
    id: 'conn-1',
    provider: 'hua_nan_bank_tw',
    provider_connection_id: 'provider-conn-1',
    status: 'active',
    sync_cursor: null,
    last_sync_at: null,
    last_error: '',
    ...overrides,
  }
}

afterEach(() => {
  resetBankSyncServiceDependenciesForTest()
  resetBankSyncDebugTraceForTest()
})

test('importSelectedBankTransactions marks outgoing transfer imports with outTxId', async () => {
  let savedMappings = null
  let backendPayload = null
  let transferPayload = null

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    listBankTransactionsByIds: async () => [
      {
        id: 'bank-tx-out',
        provider: 'mock_bank_tw',
        provider_account_id: 'provider-account-1',
        provider_transaction_id: 'provider-tx-out',
        mapped_account_id: 'asset_bank',
        amount_minor: -10000,
        posted_at: '2026-03-20T08:00:00.000Z',
        summary: '優遊付儲值100',
        transaction_type: '支出',
      },
    ],
    getAutoFillRules: async () => [
      {
        keyword: '優遊付',
        type: 'transfer',
        peerAccountId: 'asset_easy_wallet',
        note: '自動規則',
      },
    ],
    findImportedLedgerTransactionBySourceRef: async () => null,
    addTransfer: async (_ledgerId, payload) => {
      transferPayload = payload
      return {
        outTxId: 'transfer-out-1',
        inTxId: 'transfer-in-1',
      }
    },
    markBankTransactionsImported: async (_ledgerId, mappings) => {
      savedMappings = mappings
    },
    markImportedBankTransactions: async (payload) => {
      backendPayload = payload
    },
  }))

  const result = await importSelectedBankTransactions('ledger-1', ['bank-tx-out'])

  assert.equal(transferPayload?.fromAccountId, 'asset_bank')
  assert.equal(transferPayload?.toAccountId, 'asset_easy_wallet')
  assert.deepEqual(result.importedMappings, [{
    bankTransactionId: 'bank-tx-out',
    importedTxnId: 'transfer-out-1',
    sourceRef: 'bank:mock_bank_tw:provider-account-1:provider-tx-out',
  }])
  assert.deepEqual(savedMappings, result.importedMappings)
  assert.deepEqual(backendPayload, {
    transactions: [{
      source_ref: 'bank:mock_bank_tw:provider-account-1:provider-tx-out',
      imported_txn_id: 'transfer-out-1',
    }],
  })
})

test('importSelectedBankTransactions marks incoming transfer imports with inTxId', async () => {
  let savedMappings = null
  let transferPayload = null

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    listBankTransactionsByIds: async () => [
      {
        id: 'bank-tx-in',
        provider: 'mock_bank_tw',
        provider_account_id: 'provider-account-1',
        provider_transaction_id: 'provider-tx-in',
        mapped_account_id: 'asset_bank',
        amount_minor: 10000,
        posted_at: '2026-03-20T08:00:00.000Z',
        summary: '街口提領',
        transaction_type: '轉入',
      },
    ],
    getAutoFillRules: async () => [
      {
        keyword: '街口',
        type: 'transfer',
        peerAccountId: 'asset_jkopay',
        note: '銀行匯入',
      },
    ],
    findImportedLedgerTransactionBySourceRef: async () => null,
    addTransfer: async (_ledgerId, payload) => {
      transferPayload = payload
      return {
        outTxId: 'transfer-out-2',
        inTxId: 'transfer-in-2',
      }
    },
    markBankTransactionsImported: async (_ledgerId, mappings) => {
      savedMappings = mappings
    },
  }))

  const result = await importSelectedBankTransactions('ledger-1', ['bank-tx-in'])

  assert.equal(transferPayload?.fromAccountId, 'asset_jkopay')
  assert.equal(transferPayload?.toAccountId, 'asset_bank')
  assert.deepEqual(result.importedMappings, [{
    bankTransactionId: 'bank-tx-in',
    importedTxnId: 'transfer-in-2',
    sourceRef: 'bank:mock_bank_tw:provider-account-1:provider-tx-in',
  }])
  assert.deepEqual(savedMappings, result.importedMappings)
})

test('syncBankConnectionNow dual-writes lastSyncAt and lookbackDays for native contract', async () => {
  let syncPayload = null

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection({
      last_sync_at: '2026-08-16T04:00:00.000Z',
      sync_cursor: JSON.stringify({ initialStartDate: '2026-01-01' }),
    }),
    listEnabledBankAccountsByConnection: async () => [createSyncableAccount()],
    getBankSyncRule: async () => ({ lookbackDays: 3 }),
    syncBankTransactions: async (payload) => {
      syncPayload = payload
      return {
        added: [],
        modified: [],
        sync_time: '2026-08-16T05:00:00.000Z',
      }
    },
    upsertBankTransactions: async () => ({
      addedIds: [],
      modifiedIds: [],
    }),
    listBankTransactionsByIds: async () => [],
    updateBankConnection: async () => {},
  }))

  await syncBankConnectionNow('ledger-1', 'conn-1')

  assert.equal(syncPayload.lastSyncAt, '2026-08-16T04:00:00.000Z')
  assert.equal(syncPayload.last_sync_at, '2026-08-16T04:00:00.000Z')
  assert.equal(syncPayload.lookbackDays, 3)
  assert.equal(syncPayload.lookback_days, 3)
})

test('syncBankConnectionNow does not advance watermarks on partial accountResults', async () => {
  const connectionUpdates = []
  const accountUpdates = []

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection({
      last_sync_at: '2026-08-01T00:00:00.000Z',
    }),
    listEnabledBankAccountsByConnection: async () => [createSyncableAccount({
      last_success_sync_at: '2026-08-01',
    })],
    getBankSyncRule: async () => ({ lookbackDays: 3 }),
    syncBankTransactions: async () => ({
      added: [],
      modified: [],
      // Hostile top-level watermark must be ignored when accounts are partial.
      coveredThrough: '2026-08-28',
      sync_time: '2026-08-28',
      sync_status: 'partial_success',
      accountResults: [{
        accountId: 'provider-account-1',
        status: 'partial',
        code: 'hua_nan_transaction_query_partial',
        message: 'incomplete',
        rowCount: 0,
      }],
    }),
    upsertBankTransactions: async () => ({
      addedIds: [],
      modifiedIds: [],
    }),
    listBankTransactionsByIds: async () => [],
    updateBankAccount: async (_ledgerId, accountId, patch) => {
      accountUpdates.push({ accountId, ...patch })
    },
    updateBankConnection: async (_ledgerId, _connectionId, patch) => {
      connectionUpdates.push(patch)
    },
  }))

  const result = await syncBankConnectionNow('ledger-1', 'conn-1')

  assert.equal(result.syncStatus, 'partial_success')
  assert.equal(result.syncTime, null)
  assert.equal(accountUpdates.length, 1)
  assert.equal(accountUpdates[0].lastSyncStatus, 'partial_success')
  assert.equal(accountUpdates[0].lastSuccessSyncAt, undefined)
  assert.equal(connectionUpdates.length, 1)
  assert.equal(connectionUpdates[0].lastSyncStatus, 'partial_success')
  assert.equal(connectionUpdates[0].lastSyncAt, undefined)
  assert.equal(connectionUpdates[0].lastFullSuccessAt, undefined)
})

test('syncBankConnectionNow stores hua nan auth errors as reconnect-required error state', async () => {
  const updates = []
  const authError = new Error('華南登入失敗')
  authError.code = 'hua_nan_login_failed'

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection(),
    listEnabledBankAccountsByConnection: async () => [createSyncableAccount()],
    getBankSyncRule: async () => ({ lookbackDays: 3 }),
    syncBankTransactions: async () => {
      throw authError
    },
    updateBankConnection: async (_ledgerId, _connectionId, patch) => {
      updates.push(patch)
    },
  }))

  await assert.rejects(
    () => syncBankConnectionNow('ledger-1', 'conn-1'),
    /華南登入失敗/,
  )

  assert.equal(updates.length, 1)
  assert.equal(updates[0].status, 'error')
  assert.equal(updates[0].lastSyncStatus, 'error')
  assert.equal(updates[0].lastError, 'hua_nan_login_failed: 華南登入失敗')
  assert.ok(updates[0].lastAttemptAt)
})

test('syncBankConnectionNow keeps transient errors retryable', async () => {
  const updates = []
  const transientError = new Error('華南服務暫時無法使用')
  transientError.code = 'bank_upstream_temporarily_unavailable'

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection(),
    listEnabledBankAccountsByConnection: async () => [createSyncableAccount()],
    getBankSyncRule: async () => ({ lookbackDays: 3 }),
    syncBankTransactions: async () => {
      throw transientError
    },
    updateBankConnection: async (_ledgerId, _connectionId, patch) => {
      updates.push(patch)
    },
  }))

  await assert.rejects(
    () => syncBankConnectionNow('ledger-1', 'conn-1'),
    /暫時無法使用/,
  )

  assert.equal(updates.length, 1)
  assert.equal(updates[0].status, 'active')
  assert.equal(updates[0].lastSyncStatus, 'error')
  assert.equal(updates[0].lastError, 'bank_upstream_temporarily_unavailable: 華南服務暫時無法使用')
  assert.ok(updates[0].lastAttemptAt)
})

test('syncBankConnectionNow blocks stored reconnect-required errors before syncing', async () => {
  let syncCalls = 0

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection({
      status: 'error',
      last_error: 'hua_nan_login_failed: 登入失敗',
    }),
    syncBankTransactions: async () => {
      syncCalls += 1
      return {}
    },
  }))

  await assert.rejects(
    () => syncBankConnectionNow('ledger-1', 'conn-1'),
    /錯誤狀態/,
  )

  assert.equal(syncCalls, 0)
})

test('syncBankConnectionNow allows retry for stored transient errors and clears the error state on success', async () => {
  const updates = []
  let syncCalls = 0

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection({
      status: 'error',
      last_error: 'bank_upstream_temporarily_unavailable: 服務暫時無法使用',
    }),
    listEnabledBankAccountsByConnection: async () => [createSyncableAccount()],
    getBankSyncRule: async () => ({ lookbackDays: 3 }),
    syncBankTransactions: async () => {
      syncCalls += 1
      return {
        added: [],
        modified: [],
        sync_time: '2026-03-20T10:00:00.000Z',
      }
    },
    upsertBankTransactions: async () => ({
      addedIds: [],
      modifiedIds: [],
    }),
    listBankTransactionsByIds: async () => [],
    updateBankConnection: async (_ledgerId, _connectionId, patch) => {
      updates.push(patch)
    },
  }))

  const result = await syncBankConnectionNow('ledger-1', 'conn-1')

  assert.equal(syncCalls, 1)
  assert.deepEqual(result.added, [])
  assert.deepEqual(result.modified, [])
  assert.equal(updates.length, 1)
  assert.equal(updates[0].status, 'active')
  assert.equal(updates[0].lastSyncAt, '2026-03-20T10:00:00.000Z')
  assert.equal(updates[0].syncCursor, null)
  assert.equal(updates[0].lastSyncStatus, 'ok')
  assert.equal(updates[0].lastError, '')
  assert.equal(updates[0].lastFullSuccessAt, '2026-03-20T10:00:00.000Z')
  assert.ok(updates[0].lastAttemptAt)
})

test('importBankStatementCsv upserts parsed rows into bank mirror tables', async () => {
  let upsertPayload = null

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection(),
    listBankAccountsByConnection: async () => [createSyncableAccount({
      id: 'bank-account-1',
      provider_account_id: '29168214193',
      account_name: 'First Bank',
    })],
    upsertBankTransactions: async (_ledgerId, _connectionId, rows) => {
      upsertPayload = rows
      return {
        addedIds: ['btx-1'],
        modifiedIds: [],
        touchedIds: ['btx-1'],
      }
    },
  }))

  const csv = `交易日期,摘要,支出,存入,餘額
2026/03/07,薪資入帳,,50000,80000`

  const result = await importBankStatementCsv('ledger-1', 'conn-1', 'bank-account-1', csv)

  assert.equal(result.addedCount, 1)
  assert.equal(upsertPayload.length, 1)
  assert.equal(upsertPayload[0].bankAccountId, 'bank-account-1')
  assert.equal(upsertPayload[0].amountMinor, 5000000)
  assert.match(upsertPayload[0].providerTransactionId, /^fbcsv_/)
})

test('importSelectedBankTransactions skips rows marked possible_duplicate_of', async () => {
  let markCalled = false
  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    listBankTransactionsByIds: async () => [
      {
        id: 'bank-tx-dup',
        provider: 'mock_bank_tw',
        provider_account_id: 'provider-account-1',
        provider_transaction_id: 'provider-tx-dup',
        mapped_account_id: 'asset_bank',
        amount_minor: -10000,
        posted_at: '2026-03-20T08:00:00.000Z',
        summary: '可能重複',
        raw_json: JSON.stringify({ possible_duplicate_of: 'btx_other' }),
      },
    ],
    getAutoFillRules: async () => [],
    markBankTransactionsImported: async () => {
      markCalled = true
    },
  }))

  const result = await importSelectedBankTransactions('ledger-1', ['bank-tx-dup'])
  assert.equal(markCalled, false)
  assert.deepEqual(result.importedMappings, [])
  assert.equal(result.skipped[0].reason, 'possible_duplicate')
})
