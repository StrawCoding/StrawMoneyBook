import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAccessTokenExpiresInSeconds,
  issueAccessToken,
  verifyAccessToken,
} from '../src/collab/store-access-token.js'

test('issueAccessToken and verifyAccessToken round-trip a valid token', () => {
  const token = issueAccessToken({
    id: 'user_1',
    email: 'member@example.com',
    session_family_id: 'family_1',
  }, {
    tokenSecret: 'secret',
    accessTokenTtlMs: 60_000,
    createId: (prefix) => `${prefix}_1`,
    nowMs: Date.parse('2026-03-20T00:00:00.000Z'),
  })

  const payload = verifyAccessToken(token, {
    tokenSecret: 'secret',
    nowMs: Date.parse('2026-03-20T00:00:30.000Z'),
  })

  assert.equal(payload?.sub, 'user_1')
  assert.equal(payload?.email, 'member@example.com')
  assert.equal(payload?.sid, 'family_1')
})

test('verifyAccessToken rejects expired or tampered tokens', () => {
  const token = issueAccessToken({
    id: 'user_1',
    email: 'member@example.com',
    session_family_id: 'family_1',
  }, {
    tokenSecret: 'secret',
    accessTokenTtlMs: 1_000,
    createId: (prefix) => `${prefix}_1`,
    nowMs: Date.parse('2026-03-20T00:00:00.000Z'),
  })

  assert.equal(
    verifyAccessToken(token, {
      tokenSecret: 'secret',
      nowMs: Date.parse('2026-03-20T00:00:02.000Z'),
    }),
    null,
  )
  assert.equal(
    verifyAccessToken(`${token}broken`, {
      tokenSecret: 'secret',
      nowMs: Date.parse('2026-03-20T00:00:00.500Z'),
    }),
    null,
  )
})

test('getAccessTokenExpiresInSeconds enforces a minimum floor', () => {
  assert.equal(getAccessTokenExpiresInSeconds(5_000), 60)
  assert.equal(getAccessTokenExpiresInSeconds(120_000), 120)
})
