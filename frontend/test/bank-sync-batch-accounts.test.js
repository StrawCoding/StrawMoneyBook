import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetBankSyncServiceDependenciesForTest,
  saveBankAccountsSettings,
  setBankSyncServiceDependenciesForTest,
} from '../src/ui/services/bank-sync.service.js'

afterEach(() => {
  resetBankSyncServiceDependenciesForTest()
})

test('saveBankAccountsSettings updates each bank account patch', async () => {
  const updates = []

  setBankSyncServiceDependenciesForTest({
    assertCanUseBankSync: async () => {},
    hasBankSyncMembershipAccess: async () => true,
    yieldToMainThread: async () => {},
    updateBankAccount: async (_ledgerId, bankAccountId, patch) => {
      updates.push({ bankAccountId, patch })
      return { id: bankAccountId, ...patch }
    },
  })

  const results = await saveBankAccountsSettings('ledger-1', [
    {
      bankAccountId: 'bank-a',
      enabled: true,
      mappedAccountId: 'asset-a',
      userLabel: '活存',
    },
    {
      bankAccountId: 'bank-b',
      enabled: false,
      mappedAccountId: null,
      userLabel: '',
    },
  ])

  assert.equal(results.length, 2)
  assert.deepEqual(updates, [
    {
      bankAccountId: 'bank-a',
      patch: {
        enabled: true,
        mappedAccountId: 'asset-a',
        userLabel: '活存',
      },
    },
    {
      bankAccountId: 'bank-b',
      patch: {
        enabled: false,
        mappedAccountId: null,
        userLabel: '',
      },
    },
  ])
})
