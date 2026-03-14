import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-auth-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-shared-ledger-secret'

const {
  createId,
  createLoginSession,
  createUniqueReferralCode,
  createAuthNonce,
  consumeAuthNonce,
  findUserByEmail,
  rotateRefreshSession,
  updateStore,
} = await import('../src/collab/store.js')

async function createTestUser(email = 'tester@example.com') {
  return updateStore(async (data) => {
    const now = new Date().toISOString()
    const existing = findUserByEmail(data, email)
    if (existing) return existing
    const user = {
      id: createId('user'),
      email,
      account: email,
      email_verified: true,
      display_name: 'Tester',
      avatar_url: '',
      referral_code: createUniqueReferralCode(data),
      referred_by_user_id: '',
      referred_by_code: '',
      referral_redeemed_at: '',
      membership_grants: [],
      login_failed_attempts: 0,
      last_failed_login_at: '',
      login_locked_until: '',
      must_change_password: false,
      temporary_password_issued_at: '',
      password_reset_required: false,
      password_reset_token_hash: '',
      password_reset_requested_at: '',
      password_reset_expires_at: '',
      password_hash: 'hash',
      password_salt: 'salt',
      last_login_at: now,
      created_at: now,
      updated_at: now,
    }
    data.users.push(user)
    return user
  })
}

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('refresh token rotation rejects reuse of an already-rotated token', async () => {
  const user = await createTestUser('rotate@example.com')
  const firstSession = await createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const rotatedSession = await rotateRefreshSession(firstSession.refreshToken, {
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  assert.notEqual(rotatedSession.refreshToken, firstSession.refreshToken)
  assert.ok(rotatedSession.accessToken)

  await assert.rejects(
    rotateRefreshSession(firstSession.refreshToken, {
      ipAddress: '127.0.0.1',
      userAgent: 'node:test',
    }),
    (error) => error?.code === 'refresh_token_reuse_detected',
  )
})

test('Google nonce can only be consumed once', async () => {
  const nonceRecord = await createAuthNonce({
    provider: 'google',
    purpose: 'login',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const consumed = await consumeAuthNonce({
    provider: 'google',
    nonce: nonceRecord.nonce,
    purpose: 'login',
  })

  assert.equal(consumed.provider, 'google')
  assert.equal(consumed.purpose, 'login')

  await assert.rejects(
    consumeAuthNonce({
      provider: 'google',
      nonce: nonceRecord.nonce,
      purpose: 'login',
    }),
    (error) => error?.code === 'google_nonce_replayed',
  )
})
