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
    provider: 'first_bank_tw',
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

test('syncBankConnectionNow stores first bank auth errors as reconnect-required error state', async () => {
  const updates = []
  const authError = new Error('第一銀行登入失敗')
  authError.code = 'first_bank_login_failed'

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
    /第一銀行登入失敗/,
  )

  assert.deepEqual(updates, [{
    status: 'error',
    lastSyncStatus: 'error',
    lastError: 'first_bank_login_failed: 第一銀行登入失敗',
  }])
})

test('syncBankConnectionNow keeps transient errors retryable', async () => {
  const updates = []
  const transientError = new Error('第一銀行服務暫時無法使用')
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

  assert.deepEqual(updates, [{
    status: 'active',
    lastSyncStatus: 'error',
    lastError: 'bank_upstream_temporarily_unavailable: 第一銀行服務暫時無法使用',
  }])
})

test('syncBankConnectionNow blocks stored reconnect-required errors before syncing', async () => {
  let syncCalls = 0

  setBankSyncServiceDependenciesForTest(createBaseDependencies({
    findBankConnectionById: async () => createBankConnection({
      status: 'error',
      last_error: 'first_bank_login_failed: 登入失敗',
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
  assert.deepEqual(updates, [{
    status: 'active',
    lastSyncAt: '2026-03-20T10:00:00.000Z',
    syncCursor: null,
    lastSyncStatus: 'ok',
    lastError: '',
  }])
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
