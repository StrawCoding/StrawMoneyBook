import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImportedNote,
  classifyFirstBankSyncFailure,
  createFirstBankProviderConnectionId,
  extractBankErrorCode,
  formatBankErrorForStorage,
  isBankCredentialAuthError,
  selectSyncableBankAccounts,
  shouldRequireReconnectAfterBankSyncError,
  shouldRequireReconnectForStoredBankConnection,
} from '../src/services/bank-sync/shared.js'

test('createFirstBankProviderConnectionId normalizes nationalId whitespace but keeps userCode case', () => {
  const first = createFirstBankProviderConnectionId({
    nationalId: ' a123456789 ',
    repeatSeq: '01',
    userCode: ' Abcd1234 ',
  })
  const second = createFirstBankProviderConnectionId({
    nationalId: 'A123456789',
    repeatSeq: '01',
    userCode: 'Abcd1234',
  })
  const third = createFirstBankProviderConnectionId({
    nationalId: 'A123456789',
    repeatSeq: '01',
    userCode: 'ABCD1234',
  })

  assert.equal(first, second)
  assert.notEqual(second, third)
  assert.match(first, /^first_bank_identity_/)
})

test('buildImportedNote keeps transaction metadata order', () => {
  assert.equal(buildImportedNote({
    transaction_type: '轉帳',
    summary: '薪資入帳',
    note: '公司代發',
  }), '轉帳｜薪資入帳｜公司代發')

  assert.equal(buildImportedNote({
    transaction_type: '',
    summary: '摘要',
    note: '',
  }), '摘要')
})

test('selectSyncableBankAccounts keeps only enabled and mapped accounts', () => {
  assert.deepEqual(selectSyncableBankAccounts([
    { id: 'a', enabled: 1, mapped_account_id: 'ledger-a' },
    { id: 'b', enabled: 1, mapped_account_id: '' },
    { id: 'c', enabled: 0, mapped_account_id: 'ledger-c' },
    { id: 'd', enabled: true, mapped_account_id: 'ledger-d' },
  ]).map((item) => item.id), ['a', 'd'])
})

test('formatBankErrorForStorage prefers code and message when both exist', () => {
  const error = new Error('登入失敗')
  error.code = 'first_bank_login_failed'
  assert.equal(formatBankErrorForStorage(error), 'first_bank_login_failed: 登入失敗')
})

test('isBankCredentialAuthError detects credential and login failures', () => {
  const authError = new Error('第一銀行登入失敗')
  authError.code = 'first_bank_login_failed'
  assert.equal(isBankCredentialAuthError(authError), true)

  const expiredError = new Error('第一銀行登入階段已逾時')
  expiredError.code = 'first_bank_session_expired'
  assert.equal(isBankCredentialAuthError(expiredError), true)

  const genericError = new Error('network unavailable')
  genericError.code = 'bank_network_failed'
  assert.equal(isBankCredentialAuthError(genericError), false)
})

test('shouldRequireReconnectAfterBankSyncError locks native bank auth failures', () => {
  const authError = new Error('第一銀行登入失敗')
  authError.code = 'first_bank_login_failed'
  assert.equal(shouldRequireReconnectAfterBankSyncError('first_bank_tw', authError), true)

  const huaNanAuthError = new Error('華南登入失敗')
  huaNanAuthError.code = 'hua_nan_login_failed'
  assert.equal(shouldRequireReconnectAfterBankSyncError('hua_nan_bank_tw', huaNanAuthError), true)

  const transientError = new Error('temporary upstream failure')
  transientError.code = 'bank_upstream_temporarily_unavailable'
  assert.equal(shouldRequireReconnectAfterBankSyncError('first_bank_tw', transientError), false)
  assert.equal(shouldRequireReconnectAfterBankSyncError('mock_bank_tw', authError), false)
})

test('createHuaNanProviderConnectionId is stable for identity fields', async () => {
  const { createHuaNanProviderConnectionId, createBankProviderConnectionId } = await import('../src/services/bank-sync/shared.js')
  const first = createHuaNanProviderConnectionId({
    nationalId: ' a123456789 ',
    userCode: ' user01 ',
  })
  const second = createBankProviderConnectionId('hua_nan_bank_tw', {
    nationalId: 'A123456789',
    userCode: 'user01',
  })
  assert.equal(first, second)
  assert.match(first, /^hua_nan_identity_/)
})

test('SMB-266 classifyFirstBankSyncFailure separates portal_changed, reconnect, and retry', () => {
  const portalChangedError = new Error('First Bank portal contract anchors are missing')
  portalChangedError.code = 'first_bank_portal_contract_failed'
  assert.equal(classifyFirstBankSyncFailure(portalChangedError), 'portal_changed')

  const reconnectError = new Error('First Bank login failed')
  reconnectError.code = 'first_bank_login_failed'
  assert.equal(classifyFirstBankSyncFailure(reconnectError), 'reconnect')

  const retryError = new Error('First Bank page load timed out')
  retryError.code = 'first_bank_navigation_timeout'
  assert.equal(classifyFirstBankSyncFailure(retryError), 'retry')
})

test('Hua Nan H1/H2 query failures are portal_changed and do not force reconnect', () => {
  const queryError = new Error('Hua Nan transaction inquiry was not found for account ****9012')
  queryError.code = 'hua_nan_transaction_query_failed'
  assert.equal(classifyFirstBankSyncFailure(queryError), 'portal_changed')
  assert.equal(isBankCredentialAuthError(queryError), false)
  assert.equal(shouldRequireReconnectAfterBankSyncError('hua_nan_bank_tw', queryError), false)

  const timeoutError = new Error('Hua Nan transaction page 逾時')
  timeoutError.code = 'hua_nan_transaction_page_timeout'
  assert.equal(classifyFirstBankSyncFailure(timeoutError), 'portal_changed')
  assert.equal(shouldRequireReconnectAfterBankSyncError('hua_nan_bank_tw', timeoutError), false)

  const accountListError = new Error('Hua Nan account list was not found after login')
  accountListError.code = 'hua_nan_account_list_not_found'
  assert.equal(classifyFirstBankSyncFailure(accountListError), 'portal_changed')
  assert.equal(shouldRequireReconnectAfterBankSyncError('hua_nan_bank_tw', accountListError), false)

  assert.equal(shouldRequireReconnectForStoredBankConnection(
    'hua_nan_bank_tw',
    'error',
    'hua_nan_transaction_query_failed: Hua Nan transaction query did not finish in time',
  ), false)

  const firstBankPortal = new Error('First Bank portal contract anchors are missing')
  firstBankPortal.code = 'first_bank_portal_contract_failed'
  assert.equal(classifyFirstBankSyncFailure(firstBankPortal), 'portal_changed')
  assert.equal(shouldRequireReconnectAfterBankSyncError('first_bank_tw', firstBankPortal), true)
})

test('shouldRequireReconnectForStoredBankConnection only locks stored auth errors', () => {
  assert.equal(extractBankErrorCode('first_bank_login_failed: 登入失敗'), 'first_bank_login_failed')
  assert.equal(shouldRequireReconnectForStoredBankConnection(
    'first_bank_tw',
    'error',
    'first_bank_login_failed: 登入失敗',
  ), true)
  assert.equal(shouldRequireReconnectForStoredBankConnection(
    'first_bank_tw',
    'error',
    'bank_upstream_temporarily_unavailable: 服務暫時無法使用',
  ), false)
  assert.equal(shouldRequireReconnectForStoredBankConnection(
    'first_bank_tw',
    'active',
    'first_bank_login_failed: 登入失敗',
  ), false)
})
