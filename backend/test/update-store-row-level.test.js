import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-update-store-'))
const dbFile = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_DB_FILE = dbFile
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-update-store-secret'

const {
  createId,
  createUniqueReferralCode,
  nowIso,
  readStore,
  updateStore,
} = await import('../src/collab/store.js')

function buildUser(email) {
  const now = nowIso()
  return {
    id: createId('user'),
    email,
    account: email,
    email_verified: true,
    display_name: email.split('@')[0],
    avatar_url: '',
    referral_code: '',
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
    last_login_at: '',
    created_at: now,
    updated_at: now,
  }
}

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('updateStore 只寫入實際變更的 record（不做全量 upsert）', async () => {
  const USER_COUNT = 25
  await updateStore(async (data) => {
    for (let i = 0; i < USER_COUNT; i += 1) {
      const user = buildUser(`bulk-user-${i}@example.com`)
      user.referral_code = createUniqueReferralCode(data)
      data.users.push(user)
    }
  })

  // 用第二條連線安裝寫入計數 trigger（同一 DB 檔，WAL 下所有連線共用 schema）
  const probe = new Database(dbFile)
  probe.exec(`
    CREATE TABLE IF NOT EXISTS __write_probe (id INTEGER PRIMARY KEY, count INTEGER NOT NULL);
    INSERT OR REPLACE INTO __write_probe (id, count) VALUES (1, 0);
    DROP TRIGGER IF EXISTS __probe_user_update;
    DROP TRIGGER IF EXISTS __probe_user_insert;
    CREATE TRIGGER __probe_user_update AFTER UPDATE ON users
    BEGIN
      UPDATE __write_probe SET count = count + 1 WHERE id = 1;
    END;
    CREATE TRIGGER __probe_user_insert AFTER INSERT ON users
    BEGIN
      UPDATE __write_probe SET count = count + 1 WHERE id = 1;
    END;
  `)

  try {
    // 只修改其中一位 user
    await updateStore(async (data) => {
      const target = data.users.find((item) => item.email === 'bulk-user-7@example.com')
      target.display_name = 'changed-name'
    })

    const writes = Number(probe.prepare('SELECT count FROM __write_probe WHERE id = 1').get().count)
    // 舊的全量 upsert 會對 25 位 user 全部觸發 update trigger；
    // row-level 差異寫入只會觸發 1 次。
    assert.ok(
      writes <= 2,
      `預期僅寫入變更的 record（<=2 次），實際觸發 ${writes} 次寫入`,
    )

    // 資料正確性：變更生效、其他 user 不受影響
    const store = await readStore()
    const changed = store.users.find((item) => item.email === 'bulk-user-7@example.com')
    assert.equal(changed.display_name, 'changed-name')
    assert.equal(store.users.length, USER_COUNT)
  } finally {
    probe.exec(`
      DROP TRIGGER IF EXISTS __probe_user_update;
      DROP TRIGGER IF EXISTS __probe_user_insert;
    `)
    probe.close()
  }
})

test('updateStore 刪除 record 時只刪除被移除的 row', async () => {
  const before = await readStore()
  const removedEmail = 'bulk-user-3@example.com'
  await updateStore(async (data) => {
    data.users = data.users.filter((item) => item.email !== removedEmail)
  })
  const after = await readStore()
  assert.equal(after.users.length, before.users.length - 1)
  assert.ok(!after.users.some((item) => item.email === removedEmail))
  assert.ok(after.users.some((item) => item.email === 'bulk-user-4@example.com'))
})
