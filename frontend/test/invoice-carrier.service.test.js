import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  createInvoiceCarrierConnection,
  importInvoicesAsTransactions,
  resetInvoiceCarrierServiceDependenciesForTest,
  setInvoiceCarrierServiceDependenciesForTest,
  syncInvoiceCarrierConnection,
} from '../src/core/services/invoice-carrier.service.js'

function createConnection(overrides = {}) {
  return {
    id: 'invoice-conn-1',
    provider: 'einvoice_tw',
    provider_connection_id: 'provider-conn-1',
    settings_ledger_id: 'ledger-1',
    carrier_options: [],
    status: 'active',
    last_sync_status: 'idle',
    ...overrides,
  }
}

function createCredentialState(overrides = {}) {
  return {
    provider: 'einvoice_tw',
    mobilePhone: '0912345678',
    password: 'pw123456',
    storageState: {
      cookies: [],
      origins: [],
    },
    carrierOptions: [],
    updatedAt: '2026-04-17T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  resetInvoiceCarrierServiceDependenciesForTest()
})

test('syncInvoiceCarrierConnection marks missing local credentials as reauth_required', async () => {
  const updates = []

  setInvoiceCarrierServiceDependenciesForTest({
    findInvoiceCarrierConnectionById: async () => createConnection(),
    getEncryptedSetting: async () => null,
    updateInvoiceCarrierConnectionSyncStatus: async (_connectionId, patch) => {
      updates.push(patch)
      return { ...createConnection(), ...patch }
    },
  })

  await assert.rejects(
    () => syncInvoiceCarrierConnection('invoice-conn-1', 'ledger-1'),
    /重新驗證/,
  )

  assert.deepEqual(updates, [{
    status: 'reauth_required',
    last_sync_status: 'error',
    last_error: 'invoice_carrier_reauth_required: 載具憑證遺失，請重新驗證',
  }])
})

test('createInvoiceCarrierConnection reuses an inactive connection instead of inserting a duplicate provider ref', async () => {
  const updates = []

  setInvoiceCarrierServiceDependenciesForTest({
    findInvoiceCarrierConnectionByProviderRef: async () => createConnection({
      id: 'inactive-conn',
      status: 'inactive',
    }),
    updateInvoiceCarrierConnection: async (connectionId, patch) => {
      updates.push({ connectionId, patch })
      return { ...createConnection({ id: connectionId }), ...patch }
    },
    setEncryptedSetting: async () => {},
  })

  const result = await createInvoiceCarrierConnection(
    'ledger-1',
    {
      mobile_phone: '0912345678',
      provider_connection_id: 'provider-conn-1',
      user_label: '電子發票 0912345678',
    },
    createCredentialState(),
  )

  assert.equal(result.id, 'inactive-conn')
  assert.equal(updates.length, 1)
  assert.equal(updates[0].connectionId, 'inactive-conn')
  assert.equal(updates[0].patch.status, 'active')
  assert.equal(updates[0].patch.provider_connection_id, 'provider-conn-1')
})

test('syncInvoiceCarrierConnection persists refreshed storage state and carrier options', async () => {
  const savedSettings = []
  const updates = []

  setInvoiceCarrierServiceDependenciesForTest({
    findInvoiceCarrierConnectionById: async () => createConnection(),
    getEncryptedSetting: async () => createCredentialState({
      carrierOptions: [{ value: 'old', label: '舊載具' }],
    }),
    syncInvoiceCarrierData: async () => ({
      invoices: [{
        invoice_number: 'AB-12345678',
        invoice_date: '2026年4月16日',
        seller_name: '便利商店',
        amount: 199,
        carrier_label: '手機條碼',
      }],
      available_carriers: [{ value: '/ABC1234', label: '手機條碼' }],
      storage_state: {
        cookies: [{ name: 'sid', value: 'next' }],
        origins: [],
      },
      sync_time: '2026-04-17T08:00:00.000Z',
    }),
    upsertManyInvoiceCarrierInvoices: async () => ({
      addedCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
    }),
    setEncryptedSetting: async (ledgerId, key, value) => {
      savedSettings.push({ ledgerId, key, value })
    },
    updateInvoiceCarrierConnectionSyncStatus: async (_connectionId, patch) => {
      updates.push(patch)
      return { ...createConnection(), ...patch }
    },
    listInvoiceCarrierInvoices: async () => [{
      id: 'invoice-1',
      invoice_number: 'AB-12345678',
      invoice_date: '2026-04-16',
      amount: 199,
    }],
  })

  const result = await syncInvoiceCarrierConnection('invoice-conn-1', 'ledger-1', {
    startDate: '2026-04-01',
    endDate: '2026-04-17',
    carrierCode: '/ABC1234',
  })

  assert.equal(result.addedCount, 1)
  assert.equal(result.updatedCount, 0)
  assert.equal(result.unchangedCount, 0)
  assert.equal(savedSettings.length, 1)
  assert.equal(savedSettings[0].ledgerId, 'ledger-1')
  assert.equal(savedSettings[0].key, 'invoice_carrier.credentials.invoice-conn-1')
  assert.deepEqual(savedSettings[0].value.storageState, {
    cookies: [{ name: 'sid', value: 'next' }],
    origins: [],
  })
  assert.deepEqual(savedSettings[0].value.carrierOptions, [{ value: '/ABC1234', label: '手機條碼' }])
  assert.deepEqual(updates, [{
    status: 'active',
    last_sync_at: '2026-04-17T08:00:00.000Z',
    last_sync_status: 'ok',
    last_error: '',
    carrier_options: [{ value: '/ABC1234', label: '手機條碼' }],
  }])
})

test('syncInvoiceCarrierConnection stores reauth_required when backend asks for manual verification again', async () => {
  const updates = []
  const reauthError = new Error('電子發票網站要求重新完成 Cloudflare 安全驗證')
  reauthError.code = 'invoice_carrier_cloudflare_verification_required'

  setInvoiceCarrierServiceDependenciesForTest({
    findInvoiceCarrierConnectionById: async () => createConnection(),
    getEncryptedSetting: async () => createCredentialState(),
    syncInvoiceCarrierData: async () => {
      throw reauthError
    },
    updateInvoiceCarrierConnectionSyncStatus: async (_connectionId, patch) => {
      updates.push(patch)
      return { ...createConnection(), ...patch }
    },
  })

  await assert.rejects(
    () => syncInvoiceCarrierConnection('invoice-conn-1', 'ledger-1'),
    /Cloudflare/,
  )

  assert.deepEqual(updates, [{
    status: 'reauth_required',
    last_sync_status: 'error',
    last_error: 'invoice_carrier_cloudflare_verification_required: 電子發票網站要求重新完成 Cloudflare 安全驗證',
  }])
})

test('importInvoicesAsTransactions keeps invoice imports idempotent and writes invoice metadata to the transaction note', async () => {
  const addedTransactions = []
  const importedMarks = []

  setInvoiceCarrierServiceDependenciesForTest({
    findInvoiceCarrierInvoiceById: async (invoiceId) => {
      if (invoiceId === 'invoice-1') {
        return {
          id: 'invoice-1',
          connection_id: 'invoice-conn-1',
          invoice_number: 'AB-12345678',
          invoice_date: '2026-04-16',
          seller_name: '便利商店',
          amount: 199,
          imported_transaction_id: '',
        }
      }
      if (invoiceId === 'invoice-2') {
        return {
          id: 'invoice-2',
          connection_id: 'invoice-conn-1',
          invoice_number: 'CD-87654321',
          invoice_date: '2026-04-15',
          seller_name: '咖啡店',
          amount: 120,
          imported_transaction_id: 'existing-tx',
        }
      }
      return null
    },
    addTransaction: async (_ledgerId, payload) => {
      addedTransactions.push(payload)
      return 'tx-new-1'
    },
    markInvoiceCarrierInvoiceImported: async (invoiceId, transactionId) => {
      importedMarks.push({ invoiceId, transactionId })
    },
  })

  const result = await importInvoicesAsTransactions(
    'invoice-conn-1',
    ['invoice-1', 'invoice-2'],
    'ledger-1',
    'asset-cash',
  )

  assert.deepEqual(result, [{
    invoiceId: 'invoice-1',
    transactionId: 'tx-new-1',
  }])
  assert.equal(addedTransactions.length, 1)
  assert.equal(addedTransactions[0].amountMinor, 199)
  assert.equal(addedTransactions[0].originType, 'invoice_import')
  assert.match(addedTransactions[0].note, /電子發票 AB-12345678 - 便利商店/)
  assert.deepEqual(importedMarks, [{
    invoiceId: 'invoice-1',
    transactionId: 'tx-new-1',
  }])
})
