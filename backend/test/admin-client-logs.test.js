import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-admin-logs-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-admin-secret'
process.env.SHARED_LEDGER_ADMIN_EMAILS = 'admin@example.com,admin2@example.com'

const adminHandler = (await import('../src/routes/admin.js')).default
const clientLogsHandler = (await import('../src/routes/client-logs.js')).default
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

async function createUser(email, { member = false } = {}) {
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
      membership_grants: member ? [{
        id: createId('membership_grant'),
        days: 30,
        source: 'seed',
        start_at: now,
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
        meta: {},
      }] : [],
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

async function createSession(user) {
  return createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })
}

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('client error logs can be uploaded and viewed from admin overview', async () => {
  const admin = await createUser('admin@example.com', { member: true })
  const member = await createUser('member@example.com')
  const adminSession = await createSession(admin)
  const memberSession = await createSession(member)

  const logReq = {
    method: 'POST',
    url: '/api/client-logs',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${memberSession.accessToken}`,
    },
    body: JSON.stringify({
      message: 'Unhandled bank sync error',
      code: 'bank_sync_failed',
      stack: 'Error: boom',
      routePath: '/settings/bank-sync',
      platform: 'android',
      context: {
        source: 'window',
        debug: {
          operation: 'connect_bank_account',
          debugHint: 'check otp',
          debugLastStep: 'submit_login',
          trace: {
            steps: [
              { step: 'load_login_page', status: 'ok' },
              { step: 'submit_login', status: 'error' },
            ],
          },
        },
      },
    }),
  }
  const logRes = createMockResponse(logReq)
  await clientLogsHandler(logReq, logRes)

  assert.equal(logRes.statusCode, 201)
  assert.equal(logRes.body?.ok, true)

  const overviewReq = {
    method: 'GET',
    url: '/api/admin',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${adminSession.accessToken}`,
    },
    query: {},
  }
  const overviewRes = createMockResponse(overviewReq)
  await adminHandler(overviewReq, overviewRes)

  assert.equal(overviewRes.statusCode, 200)
  assert.equal(overviewRes.body?.current_user?.is_admin, true)
  assert.equal(overviewRes.body?.stats?.total_users >= 2, true)
  assert.equal(overviewRes.body?.error_logs?.[0]?.message, 'Unhandled bank sync error')
  assert.equal(overviewRes.body?.error_logs?.[0]?.user_email, 'member@example.com')
  assert.equal(overviewRes.body?.error_logs?.[0]?.context?.debug?.operation, 'connect_bank_account')
  assert.equal(overviewRes.body?.error_logs?.[0]?.context?.debug?.debugLastStep, 'submit_login')
})

test('admin can update membership and delete users while non-admin cannot access admin api', async () => {
  const admin = await createUser('admin2@example.com', { member: true })
  const user = await createUser('member2@example.com')
  const adminSession = await createSession(admin)
  const userSession = await createSession(user)

  const forbiddenReq = {
    method: 'GET',
    url: '/api/admin',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${userSession.accessToken}`,
    },
    query: {},
  }
  const forbiddenRes = createMockResponse(forbiddenReq)
  await adminHandler(forbiddenReq, forbiddenRes)
  assert.equal(forbiddenRes.statusCode, 403)
  assert.equal(forbiddenRes.body?.error, 'admin_required')

  const membershipReq = {
    method: 'POST',
    url: `/api/admin/users/${user.id}/membership`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${adminSession.accessToken}`,
    },
    body: JSON.stringify({
      plan: 'monthly',
      active: true,
    }),
  }
  const membershipRes = createMockResponse(membershipReq)
  await adminHandler(membershipReq, membershipRes)

  assert.equal(membershipRes.statusCode, 200)
  assert.equal(membershipRes.body?.item?.membership_active, true)
  assert.equal(membershipRes.body?.item?.membership_source, 'admin_console')

  const deleteReq = {
    method: 'DELETE',
    url: `/api/admin/users/${user.id}`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${adminSession.accessToken}`,
    },
  }
  const deleteRes = createMockResponse(deleteReq)
  await adminHandler(deleteReq, deleteRes)

  assert.equal(deleteRes.statusCode, 200)
  assert.equal(deleteRes.body?.ok, true)

  const overviewReq = {
    method: 'GET',
    url: '/api/admin',
    headers: {
      host: 'localhost',
      authorization: `Bearer ${adminSession.accessToken}`,
    },
    query: {},
  }
  const overviewRes = createMockResponse(overviewReq)
  await adminHandler(overviewReq, overviewRes)

  assert.equal(
    Array.isArray(overviewRes.body?.users) && overviewRes.body.users.some((item) => item.id === user.id),
    false,
  )
})
