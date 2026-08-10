import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const importSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/import.service.js'),
  'utf8',
)
const sqliteSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/sqlite.js'),
  'utf8',
)
const accountSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/account.repo.js'),
  'utf8',
)
const categorySource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/category.repo.js'),
  'utf8',
)
const sharedLedgerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'),
  'utf8',
)

test('smb296: JSON 匯入前會 normalizeSharedLedgerSnapshot 再 INSERT，且 FK 錯誤會 typed rethrow', () => {
  assert.match(importSource, /normalizeSharedLedgerSnapshot/)
  assert.match(importSource, /const sanitizedPayload = normalizeSharedLedgerSnapshot\(payload\)/)
  assert.match(importSource, /rethrowAsForeignKeyError/)
  assert.doesNotMatch(importSource, /PRAGMA foreign_keys\s*=\s*OFF/)
})

test('smb296: sqlite run/execute 會把 FOREIGN KEY 轉成 typed error，且開啟時維持 foreign_keys=ON', () => {
  assert.match(sqliteSource, /PRAGMA foreign_keys = ON/)
  assert.match(sqliteSource, /rethrowAsForeignKeyError/)
  assert.match(sqliteSource, /await conn\.run\(sql, values\)/)
})

test('smb296: 刪除帳戶／分類會檢查含 soft-deleted 的 FK 引用，硬刪失敗時改 soft-delete', () => {
  assert.match(accountSource, /countAccountForeignKeyRefs/)
  assert.match(accountSource, /softDeleteAccount/)
  assert.match(accountSource, /peer_account_id/)
  assert.match(categorySource, /countCategoryForeignKeyRefs/)
  assert.match(categorySource, /softDeleteCategory/)
  assert.match(categorySource, /budget_items/)
})

test('smb296: 共同帳本同步失敗會寫入可見 FK 友善錯誤，且仍嘗試復原本機帳本', () => {
  assert.match(sharedLedgerSource, /formatSyncForeignKeyError/)
  assert.match(sharedLedgerSource, /rethrowAsForeignKeyError/)
  assert.match(sharedLedgerSource, /failed to restore local ledger after snapshot import failure/)
})
