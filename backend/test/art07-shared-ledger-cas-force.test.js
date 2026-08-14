/**
 * ART-07 — Shared ledger CAS + break-glass force.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-art07-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-art07-secret'

const sharedLedgersHandler = (await import('../src/routes/shared-ledgers.js')).default
const {
  createId,
  createLoginSession,
  createUniqueReferralCode,
  findUserByEmail,
  nowIso,
  readStore,
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
    },
    end(payload) {
      this.ended = payload
      return this
    },
  }
}

async function createMemberUser(email) {
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
        source: 'admin',
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

async function seedLedger(owner, { version = 1, name = 'CAS Ledger' } = {}) {
  const ledgerId = createId('ledger')
  return updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: ledgerId,
      name,
      invite_code: createId('inv').slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, 'X'),
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name }] },
      },
      version,
      created_at: now,
      updated_at: now,
      updated_by_user_id: owner.id,
    }
    data.shared_ledgers.push(record)
    return record
  })
}

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('ART-07: CAS success after matching baseVersion', async () => {
  const owner = await createMemberUser('art07-cas@example.com')
  const ledger = await seedLedger(owner, { version: 2, name: 'Before' })
  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/snapshot`,
    headers: { host: 'localhost', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      baseVersion: 2,
      snapshot: {
        ledger_id: ledger.ledger_id,
        tables: { ledgers: [{ id: ledger.ledger_id, name: 'After CAS' }] },
      },
    }),
  }
  const res = createMockResponse(req)
  await sharedLedgersHandler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.item?.version, 3)
  assert.equal(res.body?.force_applied, false)
})

test('ART-07: force without reason is rejected', async () => {
  const owner = await createMemberUser('art07-force-reason@example.com')
  const ledger = await seedLedger(owner, { version: 1 })
  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/snapshot`,
    headers: { host: 'localhost', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      baseVersion: 0,
      force: true,
      snapshot: {
        ledger_id: ledger.ledger_id,
        tables: { ledgers: [{ id: ledger.ledger_id, name: 'Forced' }] },
      },
    }),
  }
  const res = createMockResponse(req)
  await sharedLedgersHandler(req, res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.error, 'force_reason_required')
})

test('ART-07: force with reason writes audit and previous_snapshot', async () => {
  const owner = await createMemberUser('art07-force-ok@example.com')
  const ledger = await seedLedger(owner, { version: 4, name: 'Keep Me' })
  const session = await createLoginSession(owner, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })

  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/snapshot`,
    headers: { host: 'localhost', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      baseVersion: 0,
      force: true,
      forceReason: 'break-glass recovery after failed merge',
      snapshot: {
        ledger_id: ledger.ledger_id,
        tables: { ledgers: [{ id: ledger.ledger_id, name: 'Forced OK' }] },
      },
    }),
  }
  const res = createMockResponse(req)
  await sharedLedgersHandler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.force_applied, true)
  assert.equal(res.body?.item?.version, 5)

  const data = await readStore()
  const saved = data.shared_ledgers.find((item) => item.id === ledger.id)
  assert.equal(saved.previous_snapshot?.tables?.ledgers?.[0]?.name, 'Keep Me')
  assert.equal(saved.force_audit?.length, 1)
  assert.match(String(saved.force_audit[0].reason), /break-glass/)
  assert.equal(saved.force_audit[0].from_version, 4)
})

test('ART-07: frontend conflict path no longer silent-force pushes', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../frontend/src/ui/services/shared-ledger.service.js'),
    'utf8',
  )
  assert.match(source, /never silent force:true/)
  assert.match(source, /force: false/)
  assert.match(source, /force_reason_required/)
  assert.doesNotMatch(
    source,
    /resolvedSnapshot = mergedSnapshot\s*\n\s*result = await pushSharedLedgerSnapshot\([\s\S]*force:\s*true/,
  )
})
