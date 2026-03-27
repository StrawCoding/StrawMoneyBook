import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  getEinvoiceCarrierDebugTraceSnapshot,
  resetEinvoiceCarrierDebugTraceForTest,
} from '../src/core/services/einvoice-carrier-debug.service.js'
import {
  connectInvoiceCarrier,
  disconnectInvoiceCarrier,
  getInvoiceCarrierState,
  importSelectedInvoiceCarrierInvoices,
  resetEinvoiceCarrierServiceDependenciesForTest,
  setEinvoiceCarrierServiceDependenciesForTest,
  syncInvoiceCarrierNow,
} from '../src/ui/services/einvoice-carrier.service.js'

function createBaseDependencies(overrides = {}) {
  return {
    listEinvoiceCarrierProviders: () => [{ id: 'tw_einvoice_mobile_barcode', name: '電子發票', authMode: 'mobile_barcode' }],
    listInvoiceCarrierConnections: async () => [],
    listInvoiceCarrierInvoices: async () => [],
    logClientError: async () => ({ ok: true }),
    ...overrides,
  }
}

afterEach(() => {
  resetEinvoiceCarrierServiceDependenciesForTest()
  resetEinvoiceCarrierDebugTraceForTest()
})

test('connectInvoiceCarrier stores encrypted credential and session state then syncs immediately', async () => {
  const encryptedWrites = []
  const syncCalls = []

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    exchangeEinvoiceAuth: async () => ({
      provider_connection_id: '0912345678',
      connection_id: 'conn-1',
      connection_name: '手機條碼 ****5678',
      session_token: 'session-token-1',
      access_token_ref: 'session-token-1',
      carrier_options: [{ value: 'all', label: '全部載具' }],
    }),
    upsertInvoiceCarrierConnection: async (_ledgerId, input) => ({
      id: 'conn-1',
      provider: input.provider,
      auth_mode: input.authMode,
      provider_connection_id: input.providerConnectionId,
      user_label: input.userLabel,
      status: input.status,
      sync_filter: input.syncFilter,
      carrier_options: input.carrierOptions,
    }),
    setEncryptedSetting: async (_ledgerId, key, value) => {
      encryptedWrites.push({ key, value })
    },
    findInvoiceCarrierConnectionById: async () => ({
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      sync_filter: { dateFrom: '2026-03-01', dateTo: '2026-03-20', carrier: 'all', status: 'all', buyerBan: '', productName: '' },
      carrier_options: [{ value: 'all', label: '全部載具' }],
    }),
    getEncryptedSetting: async (_ledgerId, key) => {
      if (key === 'einvoice.session.conn-1') {
        return {
          provider: 'tw_einvoice_mobile_barcode',
          authMode: 'mobile_barcode',
          sessionToken: 'session-token-1',
        }
      }
      return null
    },
    syncEinvoiceInvoices: async (payload) => {
      syncCalls.push(payload)
      return {
        sync_time: '2026-03-20T08:00:00.000Z',
        session_token: 'session-token-2',
        carrier_options: [{ value: 'all', label: '全部載具' }],
        invoices: [],
      }
    },
    upsertInvoiceCarrierInvoices: async () => ({ upsertedCount: 0 }),
    updateInvoiceCarrierConnection: async () => ({}),
    listInvoiceCarrierInvoices: async () => [],
  }))

  const connection = await connectInvoiceCarrier('ledger-1', {
    provider: 'tw_einvoice_mobile_barcode',
    mobilePhone: '0912345678',
    password: 'pass1234',
  })

  assert.equal(connection.id, 'conn-1')
  assert.equal(syncCalls.length, 1)
  assert.equal(encryptedWrites.length, 3)
  assert.equal(encryptedWrites[0].key, 'einvoice.credentials.conn-1')
  assert.equal(encryptedWrites[1].key, 'einvoice.session.conn-1')
  assert.equal(encryptedWrites[2].key, 'einvoice.session.conn-1')
})

test('connectInvoiceCarrier uploads a debug log when native login fails', async () => {
  const uploads = []
  const loginError = new Error('登入失敗')
  loginError.code = 'einvoice_login_failed'
  loginError.debugHint = 'check captcha'
  loginError.debugLastStep = 'submit_login'
  loginError.debugTrace = {
    action: 'connect_einvoice_carrier',
    debugHint: 'check captcha',
    debugLastStep: 'submit_login',
    steps: [
      { step: 'load_login_page', status: 'ok', message: 'loaded', at: Date.now() },
      { step: 'submit_login', status: 'error', message: 'failed', at: Date.now() },
    ],
  }

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    exchangeEinvoiceAuth: async () => {
      throw loginError
    },
    logClientError: async (error, context) => {
      uploads.push({ error, context })
      return { ok: true }
    },
  }))

  await assert.rejects(
    () => connectInvoiceCarrier('ledger-1', {
      provider: 'tw_einvoice_mobile_barcode',
      mobilePhone: '0912345678',
      password: 'pass1234',
    }),
    /登入失敗/,
  )

  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].context.source, 'einvoice_carrier')
  assert.equal(uploads[0].context.debug.operation, 'connect_invoice_carrier')
  assert.equal(uploads[0].context.debug.mobilePhoneMasked, '******5678')
  assert.equal(uploads[0].context.debug.debugLastStep, 'submit_login')
  assert.equal(uploads[0].context.debug.trace.steps[1].status, 'error')

  const traces = getEinvoiceCarrierDebugTraceSnapshot()
  assert.equal(traces.length, 1)
  assert.equal(traces[0].operation, 'connect_invoice_carrier')
  assert.equal(traces[0].mobilePhoneMasked, '******5678')
  assert.equal(traces[0].debugLastStep, 'submit_login')
  assert.equal(traces[0].status, 'error')
})

test('disconnectInvoiceCarrier sends the stored native session ref before local cleanup', async () => {
  const disconnectCalls = []
  const deletedKeys = []

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    findInvoiceCarrierConnectionById: async () => ({
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      sync_filter: {},
      carrier_options: [],
    }),
    getEncryptedSetting: async (_ledgerId, key) => {
      if (key === 'einvoice.session.conn-1') {
        return {
          provider: 'tw_einvoice_mobile_barcode',
          authMode: 'mobile_barcode',
          sessionToken: 'einv_session_abc123',
          accessTokenRef: 'einv_session_abc123',
        }
      }
      return null
    },
    disconnectEinvoiceAuth: async (payload) => {
      disconnectCalls.push(payload)
      return { ok: true }
    },
    deleteEncryptedSetting: async (_ledgerId, key) => {
      deletedKeys.push(key)
    },
    clearInvoiceCarrierMirrorDataByConnection: async () => ({ cleared: true }),
    updateInvoiceCarrierConnection: async () => ({}),
  }))

  const result = await disconnectInvoiceCarrier('ledger-1', 'conn-1')

  assert.equal(result.ok, true)
  assert.deepEqual(disconnectCalls, [{
    provider: 'tw_einvoice_mobile_barcode',
    auth_mode: 'mobile_barcode',
    provider_connection_id: '0912345678',
    session_token: 'einv_session_abc123',
    access_token_ref: 'einv_session_abc123',
  }])
  assert.deepEqual(deletedKeys, [
    'einvoice.credentials.conn-1',
    'einvoice.session.conn-1',
  ])
})

test('syncInvoiceCarrierNow marks session expiry as reauth required', async () => {
  const updates = []
  const expiredError = new Error('電子發票登入 Session 已失效，請重新驗證')
  expiredError.code = 'einvoice_session_expired'

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    findInvoiceCarrierConnectionById: async () => ({
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      sync_filter: { dateFrom: '2026-03-01', dateTo: '2026-03-20', carrier: 'all', status: 'all', buyerBan: '', productName: '' },
      carrier_options: [],
    }),
    getEncryptedSetting: async () => ({
      provider: 'tw_einvoice_mobile_barcode',
      authMode: 'mobile_barcode',
      sessionToken: 'expired-token',
    }),
    syncEinvoiceInvoices: async () => {
      throw expiredError
    },
    updateInvoiceCarrierConnection: async (_ledgerId, _connectionId, patch) => {
      updates.push(patch)
    },
  }))

  await assert.rejects(
    () => syncInvoiceCarrierNow('ledger-1', 'conn-1'),
    /重新驗證/,
  )

  assert.deepEqual(updates, [{
    status: 'reauth_required',
    lastSyncStatus: 'error',
    lastError: 'einvoice_session_expired: 電子發票登入 Session 已失效，請重新驗證',
    syncFilter: {
      dateFrom: '2026-03-01',
      dateTo: '2026-03-20',
      carrier: 'all',
      status: 'all',
      buyerBan: '',
      productName: '',
    },
  }])
})

test('syncInvoiceCarrierNow uploads a debug log when native sync fails', async () => {
  const uploads = []
  const syncError = new Error('查詢失敗')
  syncError.code = 'einvoice_query_failed'
  syncError.debugHint = 'check query form'
  syncError.debugLastStep = 'submit_query'
  syncError.debugTrace = {
    action: 'sync_einvoice_carrier',
    debugHint: 'check query form',
    debugLastStep: 'submit_query',
    steps: [
      { step: 'restore_cookies', status: 'ok', message: 'restored', at: Date.now() },
      { step: 'submit_query', status: 'error', message: 'button missing', at: Date.now() },
    ],
  }

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    findInvoiceCarrierConnectionById: async () => ({
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      sync_filter: { dateFrom: '2026-03-01', dateTo: '2026-03-20', carrier: 'all', status: 'all', buyerBan: '', productName: '' },
      carrier_options: [],
    }),
    getEncryptedSetting: async () => ({
      provider: 'tw_einvoice_mobile_barcode',
      authMode: 'mobile_barcode',
      sessionToken: 'session-token',
    }),
    syncEinvoiceInvoices: async () => {
      throw syncError
    },
    updateInvoiceCarrierConnection: async () => ({}),
    logClientError: async (error, context) => {
      uploads.push({ error, context })
      return { ok: true }
    },
  }))

  await assert.rejects(
    () => syncInvoiceCarrierNow('ledger-1', 'conn-1'),
    /查詢失敗/,
  )

  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].context.debug.operation, 'sync_invoice_carrier')
  assert.equal(uploads[0].context.debug.connectionId, 'conn-1')
  assert.equal(uploads[0].context.debug.debugHint, 'check query form')
  assert.equal(uploads[0].context.debug.trace.steps[0].step, 'restore_cookies')

  const traces = getEinvoiceCarrierDebugTraceSnapshot()
  assert.equal(traces.length, 1)
  assert.equal(traces[0].operation, 'sync_invoice_carrier')
  assert.equal(traces[0].connectionId, 'conn-1')
  assert.equal(traces[0].debugHint, 'check query form')
  assert.equal(traces[0].steps[0].step, 'restore_cookies')
})

test('getInvoiceCarrierState summarizes local invoice counts', async () => {
  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    listInvoiceCarrierConnections: async () => [{
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      sync_filter: {},
      carrier_options: [],
    }],
    listInvoiceCarrierInvoices: async () => [
      { id: 'inv-1', is_viewed: 0 },
      { id: 'inv-2', is_viewed: 1 },
    ],
  }))

  const state = await getInvoiceCarrierState('ledger-1')
  assert.equal(state[0].totalInvoiceCount, 2)
  assert.equal(state[0].unviewedInvoiceCount, 1)
})

test('importSelectedInvoiceCarrierInvoices creates expense transactions and marks imported rows', async () => {
  const createdTransactions = []
  const importedMappings = []
  const connectionPatches = []

  setEinvoiceCarrierServiceDependenciesForTest(createBaseDependencies({
    findInvoiceCarrierConnectionById: async () => ({
      id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      auth_mode: 'mobile_barcode',
      provider_connection_id: '0912345678',
      status: 'active',
      mapped_account_id: '',
      sync_filter: {},
      carrier_options: [],
    }),
    listInvoiceCarrierInvoicesByIds: async () => [{
      id: 'inv-1',
      connection_id: 'conn-1',
      provider: 'tw_einvoice_mobile_barcode',
      provider_connection_id: '0912345678',
      provider_invoice_key: 'AB12345678|2026-03-20|27000|測試商店|手機條碼',
      invoice_number: 'AB12345678',
      invoice_date: '2026-03-20',
      amount_minor: 27000,
      seller_name: '測試商店',
      carrier_label: '手機條碼',
      imported: 0,
      imported_txn_id: null,
    }],
    updateInvoiceCarrierConnection: async (_ledgerId, _connectionId, patch) => {
      connectionPatches.push(patch)
      return {}
    },
    findImportedLedgerTransactionBySourceRef: async () => null,
    addTransaction: async (_ledgerId, input) => {
      createdTransactions.push(input)
      return 'tx-1'
    },
    markInvoiceCarrierInvoicesImported: async (_ledgerId, mappings) => {
      importedMappings.push(...mappings)
      return { updatedCount: mappings.length }
    },
  }))

  const result = await importSelectedInvoiceCarrierInvoices('ledger-1', 'conn-1', ['inv-1'], {
    accountId: 'account-1',
  })

  assert.equal(result.importedCount, 1)
  assert.equal(result.skippedCount, 0)
  assert.equal(createdTransactions.length, 1)
  assert.equal(createdTransactions[0].type, 'expense')
  assert.equal(createdTransactions[0].accountId, 'account-1')
  assert.equal(createdTransactions[0].amountMinor, -27000)
  assert.match(createdTransactions[0].externalRefId, /^einvoice:tw_einvoice_mobile_barcode:0912345678:/)
  assert.equal(importedMappings.length, 1)
  assert.deepEqual(importedMappings[0], {
    invoiceId: 'inv-1',
    importedTxnId: 'tx-1',
    sourceRef: createdTransactions[0].externalRefId,
  })
  assert.deepEqual(connectionPatches, [{
    mappedAccountId: 'account-1',
  }])
})
