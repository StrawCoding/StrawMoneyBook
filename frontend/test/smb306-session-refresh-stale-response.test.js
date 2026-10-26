import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldApplyRefreshGeneration } from '../src/services/shared-ledger/refresh-generation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const sessionSource = readFileSync(
  join(dirname(root), 'backend/src/collab/store-auth-session.js'),
  'utf8',
)

test('stale refresh responses are discarded when a newer generation is in flight', () => {
  assert.equal(shouldApplyRefreshGeneration(1, 1), true)
  assert.equal(shouldApplyRefreshGeneration(1, 2), false)
  assert.equal(shouldApplyRefreshGeneration('3', 3), true)
  assert.equal(shouldApplyRefreshGeneration(0, 1), false)
})

test('shared-ledger backend increments refresh generation and ignores stale bodies', () => {
  assert.match(backendSource, /let refreshGeneration = 0/)
  assert.match(backendSource, /shouldApplyRefreshGeneration/)
  assert.match(backendSource, /const activeGeneration = generation \?\? \+\+refreshGeneration/)
  assert.match(
    backendSource,
    /if \(!shouldApplyRefreshGeneration\(activeGeneration, refreshGeneration\)\) \{\s*return readSession\(\)/,
  )
  assert.match(backendSource, /function clearAuthTokens[\s\S]*refreshGeneration \+= 1/)
  assert.match(backendSource, /function clearSession[\s\S]*refreshGeneration \+= 1/)
})

test('cookie-mode refresh omits stale native body token unless cookie is missing', () => {
  assert.match(backendSource, /function buildRefreshRequestBody/)
  assert.match(
    backendSource,
    /shouldSendAuthCredentials\(\) && !useNativeRefreshBodyFallback[\s\S]*return \{\}/,
  )
  assert.match(backendSource, /useNativeRefreshBodyFallback: true/)
})

test('rotated refresh replay walks the live family head inside grace instead of family-revoke', () => {
  assert.match(sessionSource, /DEFAULT_REFRESH_ROTATION_GRACE_MS = 60_000/)
  assert.match(sessionSource, /isWithinRefreshRotationGrace/)
  assert.match(sessionSource, /findLiveFamilyHead/)
  assert.match(sessionSource, /rotateLiveRefreshTokenRow/)
  assert.match(sessionSource, /rejectRotatedRefreshReuse/)
  assert.match(sessionSource, /committedError/)
  assert.match(sessionSource, /SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS/)
})
