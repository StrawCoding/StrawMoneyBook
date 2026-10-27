import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTH_STORAGE_COOKIE_MODE,
  AUTH_STORAGE_HEADER,
  NATIVE_CLIENT_HEADER,
  NATIVE_REFRESH_TOKEN_STORAGE_KEY,
  SHARED_LEDGER_SESSION_STORAGE_KEY,
  SHARED_LEDGER_USER_STORAGE_KEY,
  clearPersistedAuthSession,
  getAuthStorageHeaders,
  migrateLegacyPersistedSession,
  readPersistedAuthSession,
  resolveRefreshTokenFromAuthResponse,
  setStoredRefreshToken,
  shouldPersistNativeRefreshToken,
  shouldSendAuthCredentials,
  shouldPersistUserProfileInLocalStorage,
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

test('SMB-239: native platforms persist user profile in localStorage, web keeps sessionStorage', () => {
  assert.equal(shouldPersistUserProfileInLocalStorage('android'), true)
  assert.equal(shouldPersistUserProfileInLocalStorage('ios'), true)
  assert.equal(shouldPersistUserProfileInLocalStorage('web'), false)
})

test('SMB-242: native platforms persist refresh token backup in localStorage', () => {
  assert.equal(shouldPersistNativeRefreshToken('android'), true)
  assert.equal(shouldPersistNativeRefreshToken('web'), false)
})

test('cookie-mode refresh response without body token must not retain stale native backup', () => {
  const localStorageRef = createStorage({
    [NATIVE_REFRESH_TOKEN_STORAGE_KEY]: 'rotated-away-refresh',
  })
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = localStorageRef

  try {
    setStoredRefreshToken('rotated-away-refresh')
    const resolved = resolveRefreshTokenFromAuthResponse(
      { access_token: 'new-access', user: { id: 'u1' } },
      { previousSession: { refreshToken: 'rotated-away-refresh' } },
    )
    assert.equal(resolved, '')
    assert.equal(
      resolveRefreshTokenFromAuthResponse(
        { access_token: 'new-access', refresh_token: 'native-backup-refresh', user: { id: 'u1' } },
        { previousSession: { refreshToken: 'rotated-away-refresh' } },
      ),
      'native-backup-refresh',
    )
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
  }
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

test('SMB-238: readPersistedAuthSession keeps stored user after memory token is cleared in cookie mode', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()

  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writePersistedAuthSession({
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user_1', email: 'user@example.com' },
    })
    clearPersistedAuthSession()
    sessionStorageRef.setItem(
      SHARED_LEDGER_USER_STORAGE_KEY,
      JSON.stringify({ id: 'user_1', email: 'user@example.com' }),
    )

    const session = readPersistedAuthSession()
    assert.equal(session?.token, '')
    assert.equal(session?.refreshToken, '')
    assert.equal(session?.user?.id, 'user_1')
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
