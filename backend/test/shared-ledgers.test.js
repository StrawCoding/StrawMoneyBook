import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-shared-ledgers-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-shared-ledger-secret'

const sharedLedgersHandler = (await import('../src/routes/shared-ledgers.js')).default
const {
  createId,
  createUniqueReferralCode,
  findUserByEmail,
  nowIso,
  updateStore,
  createLoginSession,
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

async function createMemberUser(email = 'member@example.com') {
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

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('cannot invite self by email', async () => {
  const owner = await createMemberUser('owner@example.com')

  const ledger = await updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: createId('ledger'),
      name: 'Self Invite Ledger',
      invite_code: 'SELFINV1',
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: {
        ledger_id: createId('ledger_snapshot'),
        tables: { ledgers: [{ id: createId('ledger_row'), name: 'Self Invite Ledger' }] },
      },
      version: 1,
      created_at: now,
      updated_at: now,
      updated_by_user_id: owner.id,
    }
    data.shared_ledgers.push(record)
    return record
  })

  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/invitations`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ email: owner.email }),
  }
  const res = createMockResponse(req)

  await sharedLedgersHandler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.message, '不可邀請自己')
})

test('cannot accept own invitation', async () => {
  const owner = await createMemberUser('owner-accept@example.com')

  const invitationId = createId('shared_invitation')
  await updateStore(async (data) => {
    const now = nowIso()
    data.shared_ledgers.push({
      id: createId('shared_ledger'),
      ledger_id: createId('ledger'),
      name: 'Own Invite Ledger',
      invite_code: 'SELFACC1',
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [{
        id: invitationId,
        email: owner.email,
        invited_by_user_id: owner.id,
        status: 'pending',
        created_at: now,
        accepted_at: '',
      }],
      snapshot: {
        ledger_id: createId('ledger_snapshot'),
        tables: { ledgers: [{ id: createId('ledger_row'), name: 'Own Invite Ledger' }] },
      },
      version: 1,
      created_at: now,
      updated_at: now,
      updated_by_user_id: owner.id,
    })
  })

  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/invitations/${invitationId}`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({}),
  }
  const res = createMockResponse(req)

  await sharedLedgersHandler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.message, '不可接受自己的邀請')
})
