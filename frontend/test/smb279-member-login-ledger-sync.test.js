import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SHARED_LEDGER_NEEDS_REAUTH_KEY,
  clearPersistedAuthSession,
  readPersistedNeedsReauthFlag,
  writePersistedNeedsReauthFlag,
  writePersistedAuthSession,
  writeStoredUser,
  clearStoredTokens,
  getStoredAccessToken,
} from '../src/services/shared-ledger/auth-session-storage.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const syncSource = readFileSync(join(root, 'src/ui/services/shared-ledger.service.js'), 'utf8')
const runtimeSource = readFileSync(join(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const accountPage = readFileSync(join(root, 'src/ui/views/settings/SettingsAccountPage.vue'), 'utf8')
const sharedPage = readFileSync(join(root, 'src/ui/views/settings/SettingsSharedLedgerPage.vue'), 'utf8')
const authCookies = readFileSync(join(dirname(root), 'backend/src/collab/auth-cookies.js'), 'utf8')
const httpSource = readFileSync(join(dirname(root), 'backend/src/collab/http.js'), 'utf8')

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

test('SMB-279: needs-reauth flag persists across process death / cold start', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writePersistedNeedsReauthFlag(true)
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_NEEDS_REAUTH_KEY), '1')
    assert.equal(readPersistedNeedsReauthFlag(), true)

    writePersistedNeedsReauthFlag(false)
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_NEEDS_REAUTH_KEY), null)
    assert.equal(readPersistedNeedsReauthFlag(), false)

    writePersistedNeedsReauthFlag(true)
    clearPersistedAuthSession()
    assert.equal(readPersistedNeedsReauthFlag(), false)
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('SMB-279: cookie-mode profile without access token is not treated as API-ready', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writeStoredUser({ id: 'u1', email: 'a@b.c', membership_active: true })
    clearStoredTokens()
    assert.equal(getStoredAccessToken(), '')

    // Source contract: canUseApi requires live access token, not cookie mode alone.
    assert.match(backendSource, /const canUseApi = Boolean\(user\) && !needsReauth && Boolean\(accessToken\)/)
    assert.match(backendSource, /export async function ensureSharedLedgerSessionReady/)
    assert.match(backendSource, /return getSharedLedgerAuthStatus\(\)\.canUseApi/)
    assert.doesNotMatch(
      backendSource,
      /canUseApi: Boolean\(user\) && !needsReauth && \(\s*Boolean\(session\?\.token[\s\S]*?\|\|\s*shouldSendAuthCredentials\(\)/,
    )
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('SMB-279: sync gates await session ready and record visible paused statuses', () => {
  assert.match(syncSource, /ensureSharedLedgerSessionReady/)
  assert.match(syncSource, /assertSharedLedgerSyncAllowed/)
  assert.match(syncSource, /paused_reauth/)
  assert.match(syncSource, /paused_membership/)
  assert.match(syncSource, /paused_offline/)
  assert.match(syncSource, /paused_session/)
  assert.match(syncSource, /需重新登入後才能同步共同帳本/)
  assert.doesNotMatch(
    syncSource,
    /if \(!isSharedLedgerAuthenticated\(\) \|\| !hasSharedLedgerMembershipAccess\(\) \|\| !isOnline\(\)\) return/,
  )
})

test('SMB-279: cold start restores session before first background sync; visibility resumes too', () => {
  assert.match(runtimeSource, /restoreSharedLedgerSessionInBackground\('app_start', \{ force: true \}\)\.finally/)
  assert.match(runtimeSource, /initSharedLedgerBackgroundSync\(pinia\)/)
  assert.match(runtimeSource, /visibility_visible/)
  assert.match(runtimeSource, /enqueueSharedLedgerBackgroundSync\(pinia, 'visibility_visible'\)/)
})

test('SMB-279: account/shared-ledger UI distinguishes valid / restoring / needs-relogin', () => {
  assert.match(accountPage, /data-testid="account-session-restoring-pill"/)
  assert.match(accountPage, /sessionValid/)
  assert.match(accountPage, /sessionRestoring/)
  assert.match(accountPage, /getSharedLedgerAuthStatus/)
  assert.match(sharedPage, /data-testid="shared-ledger-session-restoring-pill"/)
  assert.match(sharedPage, /paused_reauth|sync_status_paused_reauth/)
  assert.match(sharedPage, /sessionValid && hasMembershipAccess/)
})

test('SMB-279: Capacitor https://localhost cookie CORS / SameSite contracts remain intact', () => {
  assert.match(authCookies, /shouldUseCrossSiteCookie/)
  assert.match(authCookies, /SameSite=None/)
  assert.match(httpSource, /'https:\/\/localhost'/)
  assert.match(httpSource, /wantsCredentialedCors/)
  assert.match(httpSource, /X-Straw-Native-Client/)
  assert.match(backendSource, /writePersistedNeedsReauthFlag|setNeedsReauthFlag/)
})

test('SMB-279: writePersistedAuthSession with token clears needs-reauth storage contract in backend', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writePersistedNeedsReauthFlag(true)
    writePersistedAuthSession({
      token: 'access-1',
      refreshToken: '',
      user: { id: 'u1', email: 'a@b.c' },
    })
    // Storage helper itself does not clear the flag; backend writeSession does.
    // Contract: backend clears via setNeedsReauthFlag(false) when token is written.
    assert.match(backendSource, /if \(nextSession\?\.token\) \{\s*setNeedsReauthFlag\(false\)/)
    assert.equal(getStoredAccessToken(), 'access-1')
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})
