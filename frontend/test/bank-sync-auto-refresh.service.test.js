import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  resetBankSyncAutoRefreshStateForTest,
  runBankSyncAutoRefreshIfDue,
  setBankSyncAutoRefreshDependenciesForTest,
} from '../src/ui/services/bank-sync-auto-refresh.service.js'

afterEach(() => {
  resetBankSyncAutoRefreshStateForTest()
})

test('runBankSyncAutoRefreshIfDue skips when security lock is still locked', async () => {
  setBankSyncAutoRefreshDependenciesForTest({
    isSecurityLockEnabled: () => true,
    isSecurityLockCurrentlyLocked: () => true,
  })

  const result = await runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_start' })
  assert.deepEqual(result, {
    ok: false,
    skipped: 'security_locked',
  })
})

test('runBankSyncAutoRefreshIfDue uses single-flight and cooldown per ledger', async () => {
  let getStateCalls = 0
  const syncedConnectionIds = []

  setBankSyncAutoRefreshDependenciesForTest({
    isSecurityLockEnabled: () => false,
    isSecurityLockCurrentlyLocked: () => false,
    getBankSyncState: async () => {
      getStateCalls += 1
      return [
        {
          id: 'conn-1',
          status: 'active',
          accounts: [
            { enabled: 1, mapped_account_id: 'ledger-account-1' },
          ],
        },
      ]
    },
    syncBankConnectionNow: async (_ledgerId, connectionId) => {
      syncedConnectionIds.push(connectionId)
      await new Promise((resolve) => setTimeout(resolve, 20))
      return {
        added: [{ id: 'row-1' }],
        modified: [],
      }
    },
  })

  const [first, second] = await Promise.all([
    runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_start' }),
    runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_resume' }),
  ])

  assert.equal(getStateCalls, 1)
  assert.deepEqual(syncedConnectionIds, ['conn-1'])
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)

  const third = await runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_resume' })
  assert.deepEqual(third, {
    ok: false,
    skipped: 'cooldown',
  })
})

test('runBankSyncAutoRefreshIfDue continues later connections after credential auth errors', async () => {
  const syncedConnectionIds = []

  setBankSyncAutoRefreshDependenciesForTest({
    isSecurityLockEnabled: () => false,
    isSecurityLockCurrentlyLocked: () => false,
    getBankSyncState: async () => [
      {
        id: 'conn-auth',
        status: 'active',
        accounts: [
          { enabled: 1, mapped_account_id: 'ledger-account-1' },
        ],
      },
      {
        id: 'conn-next',
        status: 'active',
        accounts: [
          { enabled: 1, mapped_account_id: 'ledger-account-2' },
        ],
      },
    ],
    syncBankConnectionNow: async (_ledgerId, connectionId) => {
      syncedConnectionIds.push(connectionId)
      if (connectionId === 'conn-auth') {
        const error = new Error('華南銀行登入失敗，請確認身分證字號、使用者代號與密碼')
        error.code = 'hua_nan_login_failed'
        throw error
      }
      return { added: [{ id: 'row-2' }], modified: [] }
    },
  })

  const result = await runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_resume' })

  assert.deepEqual(syncedConnectionIds, ['conn-auth', 'conn-next'])
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'app_resume')
  assert.deepEqual(result.syncedConnections, [
    { connectionId: 'conn-next', ok: true, added: 1, modified: 0 },
  ])
  assert.deepEqual(result.failedConnections, [
    {
      connectionId: 'conn-auth',
      ok: false,
      authError: true,
      errorCode: 'hua_nan_login_failed',
      message: '華南銀行登入失敗，請確認身分證字號、使用者代號與密碼',
    },
  ])
})

test('runBankSyncAutoRefreshIfDue skips when bank sync requires membership', async () => {
  setBankSyncAutoRefreshDependenciesForTest({
    isSecurityLockEnabled: () => false,
    isSecurityLockCurrentlyLocked: () => false,
    getBankSyncState: async () => {
      const error = new Error('銀行同步僅限會員使用')
      error.code = 'MEMBERSHIP_LIMIT_BANK_SYNC_ACCESS'
      throw error
    },
  })

  const result = await runBankSyncAutoRefreshIfDue('ledger-1', { reason: 'app_resume' })

  assert.deepEqual(result, {
    ok: false,
    skipped: 'membership_required',
  })
})
