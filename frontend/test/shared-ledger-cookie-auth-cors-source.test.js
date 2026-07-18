import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const httpSource = readFileSync(join(dirname(root), 'backend/src/collab/http.js'), 'utf8')

test('SMB-238: shared-ledger backend only attaches cookie auth to explicit useAuthStorage requests', () => {
  assert.match(backendSource, /function shouldAttachCookieAuthToRequest\(useAuthStorage = false\)/)
  assert.match(backendSource, /const attachCookieAuth = shouldAttachCookieAuthToRequest\(useAuthStorage\)/)
  assert.match(backendSource, /credentials: attachCookieAuth \? 'include' : 'same-origin'/)
  assert.doesNotMatch(
    backendSource,
    /credentials:\s*\(useAuthStorage \|\| shouldSendAuthCredentials\(\)\) \? 'include' : 'same-origin'/,
  )
})

test('SMB-238: google prepare login does not opt into cookie auth storage', () => {
  const prepareBlock = backendSource.match(/export async function prepareSharedLedgerGoogleAuth[\s\S]*?^}/m)?.[0] ?? ''
  assert.match(
    prepareBlock,
    /requestJson\('\/api\/auth\/google\/prepare',[\s\S]*?auth: purpose === 'link',[\s\S]*?\)/,
  )
  assert.doesNotMatch(prepareBlock, /useAuthStorage:\s*true/)
})

test('SMB-238: login and refresh still opt into cookie auth storage', () => {
  assert.match(backendSource, /loginSharedLedgerAccount[\s\S]*?useAuthStorage:\s*true/)
  assert.match(backendSource, /performRefreshRequest[\s\S]*?useAuthStorage:\s*true/)
})

test('SMB-238: backend CORS reflects origin for cookie auth even when ALLOW_ALL_ORIGINS is enabled', () => {
  assert.match(httpSource, /function wantsCredentialedCors\(req\)/)
  assert.match(httpSource, /'https:\/\/localhost'/)
  assert.match(httpSource, /credentialed \|\| !ALLOW_ALL_ORIGINS/)
  assert.match(httpSource, /X-Straw-Native-Client/)
})

test('SMB-239: refreshSharedLedgerSession restores cookie session when access token is missing', () => {
  const refreshBlock = backendSource.match(/export async function refreshSharedLedgerSession[\s\S]*?^}/m)?.[0] ?? ''
  assert.match(refreshBlock, /if \(!session\?\.token\)/)
  assert.match(refreshBlock, /shouldSendAuthCredentials\(\)/)
  assert.match(refreshBlock, /restoreSharedLedgerSession\(\{ force: true \}\)/)
})

test('SMB-242: refresh auth failures clear tokens without wiping persisted user profile', () => {
  assert.match(backendSource, /function clearAuthTokens\(/)
  assert.match(backendSource, /function shouldClearSessionOnRefreshFailure\(/)
  assert.match(backendSource, /clearAuthTokens\(\{ markNeedsReauth: true \}\)/)
  assert.match(backendSource, /NATIVE_CLIENT_HEADER|getAuthStorageHeaders\(/)
})
