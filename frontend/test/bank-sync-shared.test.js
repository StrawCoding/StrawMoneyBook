import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImportedNote,
  createFirstBankProviderConnectionId,
  formatBankErrorForStorage,
  isBankCredentialAuthError,
  selectSyncableBankAccounts,
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
