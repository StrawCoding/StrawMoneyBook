import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-shared-ledger-invite-email-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-shared-ledger-invite-email-secret'

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

async function loadModules() {
  const sharedLedgersHandler = (await import('../src/routes/shared-ledgers.js')).default
  const store = await import('../src/collab/store.js')
  return { sharedLedgersHandler, ...store }
}

async function createMemberUser(updateStore, findUserByEmail, createId, createUniqueReferralCode, nowIso, email = 'member@example.com') {
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
      membership_grants: [{
        id: createId('membership_grant'),
        days: 30,
        source: 'test',
        start_at: now,
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
        meta: {},
      }],
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

async function createSharedLedgerForOwner(updateStore, createId, nowIso, owner, options = {}) {
  const ledgerId = options.ledgerId ?? createId('ledger')
  return updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: ledgerId,
      name: options.name ?? 'Invite Email Ledger',
      invite_code: options.inviteCode ?? 'INVMAIL1',
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name: options.name ?? 'Invite Email Ledger' }] },
      },
      version: 1,
      created_at: now,
      updated_at: now,
      updated_by_user_id: owner.id,
    }
    data.shared_ledgers.push(record)
    return record
  })
}

async function sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, { method, url, body }) {
  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })
  const req = {
    method,
    url,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: body == null ? '' : JSON.stringify(body),
  }
  const res = createMockResponse(req)
  await sharedLedgersHandler(req, res)
  return res
}

test.after(async () => {
  delete process.env.SMTP_JSON_TRANSPORT
  delete process.env.SMTP_URL
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM
  await rm(tempDir, { recursive: true, force: true })
})

test('invite by email reports not_configured when mail transport is unavailable', async () => {
  delete process.env.SMTP_JSON_TRANSPORT
  delete process.env.SMTP_URL
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM

  const {
    sharedLedgersHandler,
    createId,
    createUniqueReferralCode,
    findUserByEmail,
    nowIso,
    updateStore,
    createLoginSession,
  } = await loadModules()

  const owner = await createMemberUser(updateStore, findUserByEmail, createId, createUniqueReferralCode, nowIso, 'owner-invite-not-configured@example.com')
  const sharedLedger = await createSharedLedgerForOwner(updateStore, createId, nowIso, owner)

  const res = await sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, {
    method: 'POST',
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations`,
    body: { email: 'invited-not-configured@example.com' },
  })

  assert.equal(res.statusCode, 201)
  assert.equal(res.body?.email_delivery?.status, 'not_configured')
  assert.match(res.body?.email_delivery?.error ?? '', /尚未設定寄信服務/)
  assert.equal(res.body?.invitation?.email_delivery_status, 'not_configured')
})

test('invite by email reports sent when mail transport succeeds', async () => {
  process.env.SMTP_JSON_TRANSPORT = '1'
  delete process.env.SMTP_URL
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM

  const {
    sharedLedgersHandler,
    createId,
    createUniqueReferralCode,
    findUserByEmail,
    nowIso,
    updateStore,
    createLoginSession,
  } = await loadModules()

  const owner = await createMemberUser(updateStore, findUserByEmail, createId, createUniqueReferralCode, nowIso, 'owner-invite-sent@example.com')
  const sharedLedger = await createSharedLedgerForOwner(updateStore, createId, nowIso, owner, { inviteCode: 'INVMAIL2' })

  const res = await sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, {
    method: 'POST',
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations`,
    body: { email: 'invited-sent@example.com' },
  })

  assert.equal(res.statusCode, 201)
  assert.equal(res.body?.email_delivery?.status, 'sent')
  assert.equal(res.body?.invitation?.email_delivery_status, 'sent')
  assert.match(res.body?.invitation?.email_sent_at ?? '', /^\d{4}-\d{2}-\d{2}T/)
})

test('resend invitation returns explicit email delivery status', async () => {
  process.env.SMTP_JSON_TRANSPORT = '1'
  delete process.env.SMTP_URL
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM

  const {
    sharedLedgersHandler,
    createId,
    createUniqueReferralCode,
    findUserByEmail,
    nowIso,
    updateStore,
    createLoginSession,
  } = await loadModules()

  const owner = await createMemberUser(updateStore, findUserByEmail, createId, createUniqueReferralCode, nowIso, 'owner-invite-resend@example.com')
  const sharedLedger = await createSharedLedgerForOwner(updateStore, createId, nowIso, owner, { inviteCode: 'INVMAIL3' })

  const inviteRes = await sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, {
    method: 'POST',
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations`,
    body: { email: 'invited-resend@example.com' },
  })
  assert.equal(inviteRes.statusCode, 201)
  const invitationId = inviteRes.body?.invitation?.id
  assert.ok(invitationId)

  const listRes = await sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, {
    method: 'GET',
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations`,
  })
  assert.equal(listRes.statusCode, 200)
  assert.equal(listRes.body?.items?.length, 1)
  assert.equal(listRes.body?.items?.[0]?.email, 'invited-resend@example.com')

  const resendRes = await sendSharedLedgerRequest(sharedLedgersHandler, createLoginSession, owner, {
    method: 'POST',
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations/${invitationId}/resend`,
    body: {},
  })
  assert.equal(resendRes.statusCode, 200)
  assert.equal(resendRes.body?.email_delivery?.status, 'sent')
  assert.equal(resendRes.body?.invitation?.email_delivery_status, 'sent')
})
