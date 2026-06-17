import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const storageSource = readFileSync(join(root, 'src/services/shared-ledger/auth-session-storage.js'), 'utf8')

test('SMB-233: shared-ledger backend uses cookie auth storage instead of persisting tokens in localStorage', () => {
  assert.match(backendSource, /getAuthStorageHeaders\(/)
  assert.match(backendSource, /shouldAttachCookieAuthToRequest\(/)
  assert.match(backendSource, /credentials: attachCookieAuth \? 'include' : 'same-origin'/)
  assert.doesNotMatch(backendSource, /localStorage\.setItem\(SESSION_STORAGE_KEY/)
  assert.doesNotMatch(backendSource, /localStorage\.setItem\(SHARED_LEDGER_SESSION_STORAGE_KEY/)
})

test('SMB-233: auth session storage keeps refresh token out of web storage', () => {
  assert.match(storageSource, /usesCookieAuthStorage\(\)/)
  assert.match(storageSource, /setStoredRefreshToken\(''\)/)
  assert.match(storageSource, /SHARED_LEDGER_USER_STORAGE_KEY/)
})

test('SMB-239: native user profile persists in localStorage after app restart', () => {
  assert.match(storageSource, /shouldPersistUserProfileInLocalStorage\(/)
  assert.match(storageSource, /localStorageRef\?\.setItem\(SHARED_LEDGER_USER_STORAGE_KEY/)
})
