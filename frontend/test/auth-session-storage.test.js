import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTH_STORAGE_COOKIE_MODE,
  AUTH_STORAGE_HEADER,
  SHARED_LEDGER_SESSION_STORAGE_KEY,
  SHARED_LEDGER_USER_STORAGE_KEY,
  clearPersistedAuthSession,
  getAuthStorageHeaders,
  migrateLegacyPersistedSession,
  readPersistedAuthSession,
  shouldSendAuthCredentials,
  writePersistedAuthSession,
} from '../src/services/shared-ledger/auth-session-storage.js'

// Node test runner cannot resolve Vite @ alias from source modules.

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

test('cookie auth headers are always enabled for shared-ledger auth', () => {
  assert.equal(shouldSendAuthCredentials(), true)
  assert.deepEqual(getAuthStorageHeaders(), {
    [AUTH_STORAGE_HEADER]: AUTH_STORAGE_COOKIE_MODE,
  })
})

test('writePersistedAuthSession keeps tokens in memory and user in sessionStorage only', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()

  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    const session = writePersistedAuthSession({
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user_1', email: 'user@example.com' },
    })

    assert.deepEqual(session, {
      token: 'access-token',
      refreshToken: '',
      user: { id: 'user_1', email: 'user@example.com' },
    })
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY), null)
    assert.equal(sessionStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY) !== null, true)
    assert.equal(
      JSON.parse(sessionStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY)).id,
      'user_1',
    )
    assert.equal(readPersistedAuthSession()?.token, 'access-token')
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('migrateLegacyPersistedSession removes tokens from legacy localStorage session', () => {
  const localStorageRef = createStorage({
    [SHARED_LEDGER_SESSION_STORAGE_KEY]: JSON.stringify({
      token: 'legacy-access',
      refreshToken: 'legacy-refresh',
      user: { id: 'user_legacy', email: 'legacy@example.com' },
    }),
  })
  const sessionStorageRef = createStorage()

  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    const migrated = migrateLegacyPersistedSession({
      localStorageRef,
      sessionStorageRef,
    })

    assert.equal(migrated?.token, 'legacy-access')
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_SESSION_STORAGE_KEY), null)
    assert.equal(readPersistedAuthSession()?.token, 'legacy-access')
    assert.equal(readPersistedAuthSession()?.refreshToken, '')
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})
