import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REFRESH_ROTATION_GRACE_MS,
  getRefreshRotationGraceMs,
  isWithinRefreshRotationGrace,
} from '../src/collab/store-auth-session.js'

test('refresh rotation grace defaults to 60s and can be disabled via env', () => {
  assert.equal(DEFAULT_REFRESH_ROTATION_GRACE_MS, 60_000)
  assert.equal(getRefreshRotationGraceMs({}), 60_000)
  assert.equal(getRefreshRotationGraceMs({ SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS: '0' }), 0)
  assert.equal(getRefreshRotationGraceMs({ SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS: '15000' }), 15_000)
  assert.equal(getRefreshRotationGraceMs({ SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS: '-1' }), 60_000)
  assert.equal(getRefreshRotationGraceMs({ SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS: 'nope' }), 60_000)
})

test('isWithinRefreshRotationGrace only accepts recently rotated rows', () => {
  const nowMs = Date.parse('2026-08-28T00:01:00.000Z')
  const rotatedAt = '2026-08-28T00:00:30.000Z'

  assert.equal(
    isWithinRefreshRotationGrace({ revoked_at: rotatedAt }, nowMs, {}),
    true,
  )
  assert.equal(
    isWithinRefreshRotationGrace(
      { revoked_at: '2026-08-27T23:59:00.000Z' },
      nowMs,
      {},
    ),
    false,
  )
  assert.equal(
    isWithinRefreshRotationGrace(
      { revoked_at: rotatedAt },
      nowMs,
      { SHARED_LEDGER_REFRESH_ROTATION_GRACE_MS: '0' },
    ),
    false,
  )
  assert.equal(isWithinRefreshRotationGrace({ revoked_at: '' }, nowMs, {}), false)
})
