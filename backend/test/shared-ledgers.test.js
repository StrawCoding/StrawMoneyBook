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

test('snapshot push rejects stale base versions at zero boundary', async () => {
  const owner = await createMemberUser('owner-version-zero@example.com')
  const ledgerId = createId('ledger')
  const sharedLedger = await updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: ledgerId,
      name: 'Version Zero Ledger',
      invite_code: 'VERZERO1',
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name: 'Version Zero Ledger' }] },
      },
      version: 0,
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

  const makeRequest = (baseVersion, name) => ({
    method: 'POST',
    url: `/api/shared-ledgers/${sharedLedger.id}/snapshot`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      baseVersion,
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name }] },
      },
    }),
  })

  const firstReq = makeRequest(0, 'Version One Ledger')
  const firstRes = createMockResponse(firstReq)
  await sharedLedgersHandler(firstReq, firstRes)
  assert.equal(firstRes.statusCode, 200)
  assert.equal(firstRes.body?.item?.version, 1)

  const staleReq = makeRequest(0, 'Stale Version Ledger')
  const staleRes = createMockResponse(staleReq)
  await sharedLedgersHandler(staleReq, staleRes)
  assert.equal(staleRes.statusCode, 409)
  assert.equal(staleRes.body?.error, 'version_conflict')
  assert.equal(staleRes.body?.current_version, 1)
})

test('invite by email creates invitation record and returns 201', async () => {
  const owner = await createMemberUser('owner-invite-email@example.com')
  const ledgerId = createId('ledger')

  const sharedLedger = await updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: ledgerId,
      name: 'Invite Email Ledger',
      invite_code: 'INVMAIL1',
      owner_user_id: owner.id,
      members: [{ user_id: owner.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name: 'Invite Email Ledger' }] },
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
    url: `/api/shared-ledgers/${sharedLedger.id}/invitations`,
    headers: {
      host: 'localhost',
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ email: 'invited@example.com' }),
  }
  const res = createMockResponse(req)

  await sharedLedgersHandler(req, res)

  assert.equal(res.statusCode, 201)
  assert.equal(typeof res.body?.invitation?.id, 'string')
  assert.equal(res.body?.invitation?.email, 'invited@example.com')
  assert.equal(res.body?.invitation?.status, 'pending')
})

async function createSessionFor(user) {
  return createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })
}

async function createLedgerWithMembers(ownerId, members, inviteCode) {
  const ledgerId = createId('ledger')
  return updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: ledgerId,
      name: 'Role Ledger',
      invite_code: inviteCode,
      owner_user_id: ownerId,
      members,
      invitations: [],
      snapshot: {
        ledger_id: ledgerId,
        tables: { ledgers: [{ id: ledgerId, name: 'Role Ledger' }] },
      },
      version: 1,
      created_at: now,
      updated_at: now,
      updated_by_user_id: ownerId,
    }
    data.shared_ledgers.push(record)
    return record
  })
}

test('viewer cannot push snapshot (403 forbidden)', async () => {
  const owner = await createMemberUser('role-owner-1@example.com')
  const viewer = await createMemberUser('role-viewer-1@example.com')
  const now = nowIso()
  const ledger = await createLedgerWithMembers(owner.id, [
    { user_id: owner.id, role: 'owner', joined_at: now },
    { user_id: viewer.id, role: 'viewer', joined_at: now },
  ], 'ROLEVWR1')

  const session = await createSessionFor(viewer)
  const req = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/snapshot`,
    headers: { host: 'localhost', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      baseVersion: 1,
      snapshot: { ledger_id: ledger.ledger_id, tables: { ledgers: [{ id: ledger.ledger_id, name: 'Hacked' }] } },
    }),
  }
  const res = createMockResponse(req)
  await sharedLedgersHandler(req, res)

  assert.equal(res.statusCode, 403)
  assert.equal(res.body?.error, 'shared_ledger_forbidden')
})

test('member cannot invite but admin can', async () => {
  const owner = await createMemberUser('role-owner-2@example.com')
  const adminUser = await createMemberUser('role-admin-2@example.com')
  const memberUser = await createMemberUser('role-member-2@example.com')
  const now = nowIso()
  const ledger = await createLedgerWithMembers(owner.id, [
    { user_id: owner.id, role: 'owner', joined_at: now },
    { user_id: adminUser.id, role: 'admin', joined_at: now },
    { user_id: memberUser.id, role: 'member', joined_at: now },
  ], 'ROLEINV2')

  const memberSession = await createSessionFor(memberUser)
  const memberReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/invitations`,
    headers: { host: 'localhost', authorization: `Bearer ${memberSession.accessToken}` },
    body: JSON.stringify({ email: 'new-invitee-2@example.com' }),
  }
  const memberRes = createMockResponse(memberReq)
  await sharedLedgersHandler(memberReq, memberRes)
  assert.equal(memberRes.statusCode, 403)
  assert.equal(memberRes.body?.error, 'shared_ledger_forbidden')

  const adminSession = await createSessionFor(adminUser)
  const adminReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/invitations`,
    headers: { host: 'localhost', authorization: `Bearer ${adminSession.accessToken}` },
    body: JSON.stringify({ email: 'new-invitee-2@example.com' }),
  }
  const adminRes = createMockResponse(adminReq)
  await sharedLedgersHandler(adminReq, adminRes)
  assert.equal(adminRes.statusCode, 201)
})

test('owner can update member role and demoted viewer loses push', async () => {
  const owner = await createMemberUser('role-owner-3@example.com')
  const memberUser = await createMemberUser('role-member-3@example.com')
  const now = nowIso()
  const ledger = await createLedgerWithMembers(owner.id, [
    { user_id: owner.id, role: 'owner', joined_at: now },
    { user_id: memberUser.id, role: 'member', joined_at: now },
  ], 'ROLEUPD3')

  const ownerSession = await createSessionFor(owner)
  const roleReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/members/${memberUser.id}/role`,
    headers: { host: 'localhost', authorization: `Bearer ${ownerSession.accessToken}` },
    body: JSON.stringify({ role: 'viewer' }),
  }
  const roleRes = createMockResponse(roleReq)
  await sharedLedgersHandler(roleReq, roleRes)
  assert.equal(roleRes.statusCode, 200)
  const updatedMember = (roleRes.body?.members ?? []).find((m) => m.user_id === memberUser.id)
  assert.equal(updatedMember?.role, 'viewer')

  const memberSession = await createSessionFor(memberUser)
  const pushReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/snapshot`,
    headers: { host: 'localhost', authorization: `Bearer ${memberSession.accessToken}` },
    body: JSON.stringify({
      baseVersion: 1,
      snapshot: { ledger_id: ledger.ledger_id, tables: { ledgers: [{ id: ledger.ledger_id, name: 'x' }] } },
    }),
  }
  const pushRes = createMockResponse(pushReq)
  await sharedLedgersHandler(pushReq, pushRes)
  assert.equal(pushRes.statusCode, 403)
})

test('owner transfers ownership and is demoted to admin', async () => {
  const owner = await createMemberUser('role-owner-4@example.com')
  const memberUser = await createMemberUser('role-member-4@example.com')
  const now = nowIso()
  const ledger = await createLedgerWithMembers(owner.id, [
    { user_id: owner.id, role: 'owner', joined_at: now },
    { user_id: memberUser.id, role: 'member', joined_at: now },
  ], 'ROLEXFR4')

  const ownerSession = await createSessionFor(owner)
  const transferReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/transfer`,
    headers: { host: 'localhost', authorization: `Bearer ${ownerSession.accessToken}` },
    body: JSON.stringify({ targetUserId: memberUser.id }),
  }
  const transferRes = createMockResponse(transferReq)
  await sharedLedgersHandler(transferReq, transferRes)
  assert.equal(transferRes.statusCode, 200)

  const members = transferRes.body?.members ?? []
  const newOwner = members.find((m) => m.user_id === memberUser.id)
  const oldOwner = members.find((m) => m.user_id === owner.id)
  assert.equal(newOwner?.role, 'owner')
  assert.equal(newOwner?.is_owner, true)
  assert.equal(oldOwner?.role, 'admin')

  // Old owner (now admin) can no longer transfer ownership.
  const retryReq = {
    method: 'POST',
    url: `/api/shared-ledgers/${ledger.id}/transfer`,
    headers: { host: 'localhost', authorization: `Bearer ${ownerSession.accessToken}` },
    body: JSON.stringify({ targetUserId: owner.id }),
  }
  const retryRes = createMockResponse(retryReq)
  await sharedLedgersHandler(retryReq, retryRes)
  assert.equal(retryRes.statusCode, 403)
})
