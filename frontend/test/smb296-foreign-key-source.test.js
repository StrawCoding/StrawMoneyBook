import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

function listJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'migrations' || name === 'node_modules') continue
      listJsFiles(full, out)
      continue
    }
    if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.vue')) out.push(full)
  }
  return out
}

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
const repairSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/repair.service.js'),
  'utf8',
)
const ledgerRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/ledger.repo.js'),
  'utf8',
)
const deleteOrderSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/utils/sqlite-delete-order.js'),
  'utf8',
)

test('smb296: JSON 匯入前會 normalizeSharedLedgerSnapshot 再 INSERT，且 FK 錯誤會 typed rethrow', () => {
  assert.match(importSource, /normalizeSharedLedgerSnapshot/)
  assert.match(importSource, /const sanitizedPayload = normalizeSharedLedgerSnapshot\(payload\)/)
  assert.match(importSource, /rethrowAsForeignKeyError/)
  assert.doesNotMatch(importSource, /PRAGMA foreign_keys\s*=\s*OFF/)
})

test('smb296: sqlite run/execute 會把 FOREIGN KEY 轉成 typed error，且產品碼維持 foreign_keys=ON（禁 OFF wipe）', () => {
  assert.match(sqliteSource, /PRAGMA foreign_keys = ON/)
  assert.match(sqliteSource, /rethrowAsForeignKeyError/)
  assert.match(sqliteSource, /DATABASE_WIPE_DELETE_ORDER/)
  assert.match(sqliteSource, /await conn\.run\(sql, values\)/)
  assert.doesNotMatch(sqliteSource, /PRAGMA foreign_keys\s*=\s*OFF/)
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

test('smb296: repair.service 會修復含 soft-deleted 的 orphan account／category 引用', () => {
  assert.match(repairSource, /ensureRepairAccount/)
  assert.match(repairSource, /orphanTxAccountFixed/)
  // Soft-deleted rows still violate SQLite FK — account orphan UPDATE must not filter deleted_at.
  assert.match(
    repairSource,
    /SET account_id = \?,\s*updated_at = \?\s*WHERE ledger_id = \?\s*AND NOT EXISTS \(/,
  )
  assert.doesNotMatch(
    repairSource,
    /SET account_id = \?,\s*updated_at = \?\s*WHERE ledger_id = \?\s*AND deleted_at IS NULL/,
  )
})

test('smb296: purge／wipe 共用 child-first 刪除順序且不關閉 foreign_keys', () => {
  assert.match(deleteOrderSource, /LEDGER_CHILD_DELETE_ORDER/)
  assert.match(deleteOrderSource, /DATABASE_WIPE_DELETE_ORDER/)
  assert.match(ledgerRepoSource, /LEDGER_CHILD_DELETE_ORDER/)
  assert.doesNotMatch(ledgerRepoSource, /PRAGMA foreign_keys\s*=\s*OFF/)
})

test('smb296: 產品執行期 JS/Vue（排除 migrations）不得 PRAGMA foreign_keys=OFF', () => {
  const srcRoot = resolve(import.meta.dirname, '../src')
  const offenders = []
  for (const file of listJsFiles(srcRoot)) {
    const text = readFileSync(file, 'utf8')
    if (/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(text)) offenders.push(file)
  }
  assert.deepEqual(offenders, [], `runtime sources still disable foreign_keys: ${offenders.join(', ')}`)
})
