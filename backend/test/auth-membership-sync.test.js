import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-auth-membership-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-auth-membership-secret'

const authHandler = (await import('../src/routes/auth.js')).default
const sharedLedgersHandler = (await import('../src/routes/shared-ledgers.js')).default
const {
  createId,
  createLoginSession,
  createUniqueReferralCode,
  findUserByEmail,
  nowIso,
  updateStore,
} = await import('../src/collab/store.js')

function createMockResponse(req) {
  return {
    __request: req,
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    getHeader(name) {
      return this.headers[name]
    },
    status(code) {
      this.statusCode = Number(code) || 200
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end(payload) {
      this.ended = payload
      return this
    },
  }
}

async function createUser(email = 'member-sync@example.com') {
  return updateStore(async (data) => {
    const existing = findUserByEmail(data, email)
    if (existing) return existing
    const now = nowIso()
    const user = {
      id: createId('user'),
      email,
      account: email,
      email_verified: true,
      display_name: email.split('@')[0],
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

test('google play membership sync enables shared-ledger access', async () => {
  const user = await createUser('membership-on@example.com')
  const session = await createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const authReq = {
    method: 'POST',
    url: '/api/auth/membership/google-play',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      active: true,
      plan: 'monthly',
      expiresAt: '2026-04-19T00:00:00.000Z',
      lastSyncStatus: 'ok',
    }),
  }
  const authRes = createMockResponse(authReq)

  await authHandler(authReq, authRes)

  assert.equal(authRes.statusCode, 200)
  assert.equal(authRes.body?.user?.membership_active, true)

  const sharedReq = {
    method: 'GET',
    url: '/api/shared-ledgers',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
  }
  const sharedRes = createMockResponse(sharedReq)

  await sharedLedgersHandler(sharedReq, sharedRes)

  assert.equal(sharedRes.statusCode, 200)
  assert.deepEqual(sharedRes.body?.items ?? [], [])
})

test('google play membership sync can clear the synced grant after a verified free-state sync', async () => {
  const user = await createUser('membership-off@example.com')
  const session = await createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const enableReq = {
    method: 'POST',
    url: '/api/auth/membership/google-play',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      active: true,
      plan: 'monthly',
      expiresAt: '2026-04-19T00:00:00.000Z',
      lastSyncStatus: 'ok',
    }),
  }
  const enableRes = createMockResponse(enableReq)
  await authHandler(enableReq, enableRes)
  assert.equal(enableRes.statusCode, 200)
  assert.equal(enableRes.body?.user?.membership_active, true)

  const disableReq = {
    method: 'POST',
    url: '/api/auth/membership/google-play',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      active: false,
      plan: '',
      lastSyncStatus: 'ok',
    }),
  }
  const disableRes = createMockResponse(disableReq)
  await authHandler(disableReq, disableRes)

  assert.equal(disableRes.statusCode, 200)
  assert.equal(disableRes.body?.user?.membership_active, false)

  const sharedReq = {
    method: 'GET',
    url: '/api/shared-ledgers',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
  }
  const sharedRes = createMockResponse(sharedReq)

  await sharedLedgersHandler(sharedReq, sharedRes)

  assert.equal(sharedRes.statusCode, 403)
  assert.equal(sharedRes.body?.error, 'membership_required')
})
