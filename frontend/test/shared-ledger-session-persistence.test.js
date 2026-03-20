import test from 'node:test'
import assert from 'node:assert/strict'

import {
  readPersistedSharedLedgerSession,
  SHARED_LEDGER_SESSION_STORAGE_KEY,
} from '../src/services/shared-ledger/session-persistence.js'

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('prefers an existing localStorage shared-ledger session', () => {
  const localStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'local-token',
      user: { id: 'user_local' },
    }),
  })
  const sessionStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'legacy-token',
      user: { id: 'user_legacy' },
    }),
  })

  const session = readPersistedSharedLedgerSession({
    localStorageRef,
    sessionStorageRef,
  })

  assert.deepEqual(session, {
    token: 'local-token',
    user: { id: 'user_local' },
  })
  assert.equal(sessionStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY) !== null, true)
})

test('migrates a legacy sessionStorage session into localStorage', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'legacy-token',
      refreshToken: 'legacy-refresh',
      user: { id: 'user_legacy' },
    }),
  })

  const session = readPersistedSharedLedgerSession({
    localStorageRef,
    sessionStorageRef,
  })

  assert.deepEqual(session, {
    token: 'legacy-token',
    refreshToken: 'legacy-refresh',
    user: { id: 'user_legacy' },
  })
  assert.deepEqual(
    JSON.parse(localStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY)),
    session,
  )
  assert.equal(sessionStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY), null)
})
