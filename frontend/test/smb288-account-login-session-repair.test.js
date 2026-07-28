import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SHARED_LEDGER_AUTH_HINT_KEY,
  SHARED_LEDGER_NEEDS_REAUTH_KEY,
  clearPersistedAuthSession,
  hasPersistedAuthRestoreCandidate,
  readPersistedAuthHint,
  writePersistedAuthHint,
  writePersistedAuthSession,
  writePersistedNeedsReauthFlag,
  writeStoredUser,
  clearStoredTokens,
  getStoredAccessToken,
} from '../src/services/shared-ledger/auth-session-storage.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const storageSource = readFileSync(join(root, 'src/services/shared-ledger/auth-session-storage.js'), 'utf8')
const syncSource = readFileSync(join(root, 'src/ui/services/shared-ledger.service.js'), 'utf8')
const runtimeSource = readFileSync(join(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const accountPage = readFileSync(join(root, 'src/ui/views/settings/SettingsAccountPage.vue'), 'utf8')
const sharedPage = readFileSync(join(root, 'src/ui/views/settings/SettingsSharedLedgerPage.vue'), 'utf8')
const settingsPage = readFileSync(join(root, 'src/ui/views/settings.vue'), 'utf8')
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

test('SMB-288: auth hint persists across Web tab close (sessionStorage cleared, localStorage kept)', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writePersistedAuthSession({
      token: 'access-1',
      refreshToken: '',
      user: { id: 'u1', email: 'a@b.c', membership_active: true },
    })
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_AUTH_HINT_KEY), '1')
    assert.equal(readPersistedAuthHint(), true)
    assert.equal(hasPersistedAuthRestoreCandidate(), true)

    // Simulate Web tab close / new session: sessionStorage wiped, localStorage kept.
    globalThis.sessionStorage = createStorage()
    clearStoredTokens()
    assert.equal(getStoredAccessToken(), '')
    assert.equal(readPersistedAuthHint(), true)
    assert.equal(hasPersistedAuthRestoreCandidate(), true)

    clearPersistedAuthSession()
    assert.equal(readPersistedAuthHint(), false)
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_NEEDS_REAUTH_KEY), null)
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('SMB-288: needs-reauth keeps profile + hint; never silently clears identity', () => {
  const localStorageRef = createStorage()
  const sessionStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = localStorageRef
  globalThis.sessionStorage = sessionStorageRef

  try {
    writeStoredUser({ id: 'u1', email: 'a@b.c' })
    writePersistedAuthHint(true)
    writePersistedNeedsReauthFlag(true)
    clearStoredTokens()
    assert.equal(readPersistedAuthHint(), true)
    assert.equal(localStorageRef.getItem(SHARED_LEDGER_NEEDS_REAUTH_KEY), '1')
    assert.match(backendSource, /writePersistedAuthHint\(true\)/)
    assert.match(backendSource, /clearAuthTokens\(\{ markNeedsReauth: true \}\)/)
    assert.match(backendSource, /sessionValid: canUseApi/)
    assert.match(backendSource, /const canUseApi = Boolean\(user\) && !needsReauth && Boolean\(accessToken\)/)
  } finally {
    clearPersistedAuthSession()
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  }
})

test('SMB-288: restore / ensure no longer treat cookie-mode alone as restore candidate', () => {
  assert.match(storageSource, /SHARED_LEDGER_AUTH_HINT_KEY/)
  assert.match(storageSource, /hasPersistedAuthRestoreCandidate/)
  assert.match(backendSource, /readPersistedAuthHint/)
  assert.match(backendSource, /anonymousCookieProbeDone/)
  assert.match(backendSource, /pendingCookieRestoreRetry/)
  assert.match(backendSource, /hasRestoreCandidate/)
  // Must not probe solely because shouldSendAuthCredentials() is always true.
  assert.doesNotMatch(
    backendSource,
    /if \(!hasPersistedAuthIdentity\(\) && !shouldSendAuthCredentials\(\)\) return null/,
  )
  assert.match(
    backendSource,
    /Do not probe \/api\/auth\/refresh for anonymous users with no hint\/profile/,
  )
})

test('SMB-288: sync schedule path writes paused_session / paused_offline (no silent no-op)', () => {
  assert.match(syncSource, /paused_reauth/)
  assert.match(syncSource, /paused_membership/)
  assert.match(syncSource, /paused_offline/)
  assert.match(syncSource, /paused_session/)
  assert.match(syncSource, /hasRestoreCandidate/)
  assert.match(syncSource, /scheduleActiveSharedLedgerAutoSync[\s\S]*paused_offline/)
  assert.match(syncSource, /scheduleActiveSharedLedgerAutoSync[\s\S]*paused_session/)
  assert.match(syncSource, /assertSharedLedgerSyncAllowed[\s\S]*if \(!isOnline\(\)\)/)
})

test('SMB-288: cold start / visibility still restore before background sync', () => {
  assert.match(runtimeSource, /restoreSharedLedgerSessionInBackground\('app_start', \{ force: true \}\)\.finally/)
  assert.match(runtimeSource, /initSharedLedgerBackgroundSync\(pinia\)/)
  assert.match(runtimeSource, /visibility_visible/)
  assert.match(runtimeSource, /app_resume/)
  assert.match(runtimeSource, /window_focus/)
})

test('SMB-288: account / shared-ledger / settings UI show restoring shell without flashing login', () => {
  assert.match(accountPage, /data-testid="account-session-restoring-panel"/)
  assert.match(accountPage, /sessionRestoring && !sessionUser/)
  assert.match(sharedPage, /data-testid="shared-ledger-session-restoring-panel"/)
  assert.match(sharedPage, /sessionRestoring && !sessionUser/)
  assert.match(sharedPage, /!sessionUser && !sessionRestoring/)
  assert.match(settingsPage, /getSharedLedgerAuthStatus/)
  assert.match(settingsPage, /session_restoring/)
  assert.match(settingsPage, /sessionNeedsReauth/)
})

test('SMB-288: Capacitor cookie CORS / SameSite / native client contracts remain intact', () => {
  assert.match(authCookies, /shouldUseCrossSiteCookie/)
  assert.match(authCookies, /SameSite=None/)
  assert.match(httpSource, /'https:\/\/localhost'/)
  assert.match(httpSource, /wantsCredentialedCors/)
  assert.match(httpSource, /X-Straw-Native-Client/)
  assert.match(backendSource, /useAuthStorage: true/)
})
