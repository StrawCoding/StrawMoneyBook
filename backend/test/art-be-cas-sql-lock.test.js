/**
 * ART-BE-CAS — SQL optimistic lock on shared_ledger snapshot upsert.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-art-be-cas-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-art-be-cas-secret'

const {
  createId,
  createInviteCode,
  createUniqueReferralCode,
  findUserByEmail,
  nowIso,
  readStore,
  updateStore,
} = await import('../src/collab/store.js')

async function seedLedger() {
  return updateStore(async (data) => {
    let user = findUserByEmail(data, 'cas-owner@example.com')
    if (!user) {
      const now = nowIso()
      user = {
        id: createId('user'),
        email: 'cas-owner@example.com',
        account: 'cas-owner@example.com',
        email_verified: true,
        display_name: 'cas',
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
        last_login_at: '',
        password_hash: '',
        password_salt: '',
        created_at: now,
        updated_at: now,
      }
      data.users.push(user)
    }

    const now = nowIso()
    const ledger = {
      id: createId('shared'),
      ledger_id: 'ledger_cas_1',
      name: 'CAS Ledger',
      invite_code: createInviteCode(),
      owner_user_id: user.id,
      members: [{ user_id: user.id, role: 'owner', joined_at: now }],
      invitations: [],
      snapshot: { schema_version: 1, ledger: { id: 'ledger_cas_1', name: 'CAS Ledger' }, tables: {} },
      previous_snapshot: null,
      force_audit: [],
      version: 3,
      created_at: now,
      updated_at: now,
      updated_by_user_id: user.id,
    }
    data.shared_ledgers.push(ledger)
    return ledger
  })
}

test('ART-BE-CAS: matching __cas_base_version allows snapshot upsert', async () => {
  const seeded = await seedLedger()
  await updateStore(async (data) => {
    const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
    ledger.snapshot = { ...ledger.snapshot, note: 'ok' }
    ledger.version = 4
    ledger.__cas_base_version = 3
    ledger.__cas_force = false
  })
  const data = await readStore()
  const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
  assert.equal(Number(ledger.version), 4)
  assert.equal(ledger.snapshot.note, 'ok')
})

test('ART-BE-CAS: mismatched __cas_base_version rejects write with version_conflict', async () => {
  const seeded = await seedLedger()
  await assert.rejects(
    () => updateStore(async (data) => {
      const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
      ledger.snapshot = { ...ledger.snapshot, note: 'stale' }
      ledger.version = 99
      ledger.__cas_base_version = 1
      ledger.__cas_force = false
    }),
    (error) => error?.code === 'version_conflict' && Number(error?.status) === 409,
  )
  const data = await readStore()
  const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
  assert.equal(Number(ledger.version), 3)
  assert.notEqual(ledger.snapshot?.note, 'stale')
})

test('ART-BE-CAS: force bypasses SQL version predicate', async () => {
  const seeded = await seedLedger()
  await updateStore(async (data) => {
    const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
    ledger.snapshot = { ...ledger.snapshot, note: 'forced' }
    ledger.version = 10
    ledger.__cas_base_version = 0
    ledger.__cas_force = true
  })
  const data = await readStore()
  const ledger = data.shared_ledgers.find((item) => item.id === seeded.id)
  assert.equal(Number(ledger.version), 10)
  assert.equal(ledger.snapshot.note, 'forced')
})

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})
