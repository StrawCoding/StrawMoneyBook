import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SHARED_LEDGER_SESSION_STORAGE_KEY,
  SHARED_LEDGER_USER_STORAGE_KEY,
  clearPersistedAuthSession,
  migrateLegacyPersistedSession,
  readPersistedAuthSession,
} from '../src/services/shared-ledger/auth-session-storage.js'

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

test('readPersistedSharedLedgerSession migrates legacy localStorage tokens out of storage', () => {
  const localStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'local-token',
      refreshToken: 'local-refresh',
      user: { id: 'user_local' },
    }),
  })
  const sessionStorageRef = createStorage()

  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    const session = readPersistedAuthSession()

    assert.deepEqual(session, {
      token: 'local-token',
      refreshToken: '',
      user: { id: 'user_local' },
    })
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY), null)
    assert.equal(
      JSON.parse(sessionStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY)).id,
      'user_local',
    )
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('migrateLegacyPersistedSession moves legacy sessionStorage session into memory and user storage', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'legacy-token',
      refreshToken: 'legacy-refresh',
      user: { id: 'user_legacy' },
    }),
  })

  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    const session = migrateLegacyPersistedSession({
      localStorageRef,
      sessionStorageRef,
    })

    assert.deepEqual(session, {
      token: 'legacy-token',
      refreshToken: 'legacy-refresh',
      user: { id: 'user_legacy' },
    })
    assert.equal(sessionStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY), null)
    assert.equal(
      JSON.parse(sessionStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY)).id,
      'user_legacy',
    )
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})
