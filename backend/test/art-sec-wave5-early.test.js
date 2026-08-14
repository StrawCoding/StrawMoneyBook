/**
 * ART-SEC-01 / ART-SEC-02 / ART-SEC-03 Phase A tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getMembershipGrantSummary,
  isVerifiedMembershipSource,
  syncMembershipGrantBySource,
} from '../src/collab/store-membership.js'

test('ART-SEC-01: server.js 500 responses use sanitized message', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/server.js'), 'utf8')
  assert.match(source, /internal server error/)
  assert.doesNotMatch(
    source,
    /sendJson\(response, 500, \{[\s\S]*message: String\(error\?\.message/,
  )
})

test('ART-SEC-02: production Google OAuth always enforces client shared key', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/routes/google-oauth.js'), 'utf8')
  assert.match(source, /function isProductionRuntime/)
  assert.match(source, /function assertClientAuthOrReject/)
  assert.match(source, /GOOGLE_OAUTH_CLIENT_SHARED_KEY is not configured/)
  assert.match(source, /if \(isProductionRuntime\(\)\) return true/)
})

test('ART-SEC-03: google_play_client_sync is never an authoritative membership source', () => {
  assert.equal(isVerifiedMembershipSource('google_play_client_sync'), false)
  assert.equal(isVerifiedMembershipSource('admin'), true)

  const user = { membership_grants: [] }
  const helpers = {
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => '2026-08-14T00:00:00.000Z',
    createStoreError: (message, code, status) => {
      const err = new Error(message)
      err.code = code
      err.status = status
      return err
    },
    nowMs: Date.parse('2026-08-14T00:00:00.000Z'),
  }

  syncMembershipGrantBySource(
    user,
    'google_play_client_sync',
    {
      active: true,
      startAt: '2026-08-14T00:00:00.000Z',
      endAt: '2027-08-14T00:00:00.000Z',
      meta: { trust_status: 'UNVERIFIED' },
    },
    helpers,
  )

  assert.equal(user.membership_grants.length, 1)
  assert.equal(
    getMembershipGrantSummary(user, Date.parse('2026-08-14T00:00:00.000Z')).active,
    false,
  )

  syncMembershipGrantBySource(
    user,
    'admin',
    {
      active: true,
      startAt: '2026-08-14T00:00:00.000Z',
      endAt: '2027-08-14T00:00:00.000Z',
      meta: {},
    },
    helpers,
  )
  assert.equal(
    getMembershipGrantSummary(user, Date.parse('2026-08-14T00:00:00.000Z')).active,
    true,
  )
})

test('ART-SEC-03: client Play sync cannot unlock shared-ledger membership gate', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-sec03-'))
  process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
  process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-sec03-secret'

  try {
    const authHandler = (await import(`../src/routes/auth.js?sec03=${Date.now()}`)).default
    const sharedLedgersHandler = (await import(`../src/routes/shared-ledgers.js?sec03=${Date.now()}`)).default
    const {
      createId,
      createLoginSession,
      createUniqueReferralCode,
      findUserByEmail,
      nowIso,
      updateStore,
    } = await import(`../src/collab/store.js?sec03=${Date.now()}`)

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
        },
        end(payload) {
          this.ended = payload
          return this
        },
      }
    }

    const user = await updateStore(async (data) => {
      const email = 'sec03-client@example.com'
      const existing = findUserByEmail(data, email)
      if (existing) return existing
      const now = nowIso()
      const created = {
        id: createId('user'),
        email,
        account: email,
        email_verified: true,
        display_name: 'sec03',
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
      data.users.push(created)
      return created
    })

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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastSyncStatus: 'ok',
      }),
    }
    const authRes = createMockResponse(authReq)
    await authHandler(authReq, authRes)
    assert.equal(authRes.statusCode, 200)
    assert.equal(authRes.body?.user?.membership_active, false)
    assert.equal(authRes.body?.membership_observation?.trust_status, 'UNVERIFIED')

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
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
