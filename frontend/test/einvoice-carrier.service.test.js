import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  connectInvoiceCarrier,
  getInvoiceCarrierState,
  resetEinvoiceCarrierServiceDependenciesForTest,
  setEinvoiceCarrierServiceDependenciesForTest,
  syncInvoiceCarrierNow,
} from '../src/ui/services/einvoice-carrier.service.js'

function createBaseDependencies(overrides = {}) {
  return {
    listEinvoiceCarrierProviders: () => [{ id: 'tw_einvoice_mobile_barcode', name: '電子發票', authMode: 'mobile_barcode' }],
    listInvoiceCarrierConnections: async () => [],
    listInvoiceCarrierInvoices: async () => [],
    ...overrides,
  }
}

afterEach(() => {
  resetEinvoiceCarrierServiceDependenciesForTest()
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
    captchaCode: '2468',
  })

  assert.equal(connection.id, 'conn-1')
  assert.equal(syncCalls.length, 1)
  assert.equal(encryptedWrites.length, 3)
  assert.equal(encryptedWrites[0].key, 'einvoice.credentials.conn-1')
  assert.equal(encryptedWrites[1].key, 'einvoice.session.conn-1')
  assert.equal(encryptedWrites[2].key, 'einvoice.session.conn-1')
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
