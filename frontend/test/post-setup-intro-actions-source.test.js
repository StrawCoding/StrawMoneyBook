import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const introSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/PostSetupIntroPage.vue'),
  'utf8',
)
const featuresMapSource = readFileSync(
  resolve(import.meta.dirname, '../StrawMoneyBook_Features_Map.md'),
  'utf8',
)
const detailedDocSource = readFileSync(
  resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'),
  'utf8',
)

test('shared-ledger intro slide exposes backup restore (→ auto-backup) and ledger sync quick actions', () => {
  const sharedLedgerBlock = introSource.match(/id: 'shared-ledger',[\s\S]*?points: \[/)?.[0] ?? ''

  assert.match(sharedLedgerBlock, /extraActions:\s*\[/)
  assert.match(sharedLedgerBlock, /post_setup_intro\.shared_ledger\.restore_backup_action/)
  // SMB-215 v1.3.2: 「恢復備份」 must point to /settings/auto-backup so
  // Tester sees 自動備份 items (Google Drive / WebDAV sign-in + 立即還原),
  // not the manual JSON / CSV import surface (`/settings/data-management`).
  assert.match(sharedLedgerBlock, /to: '\/settings\/auto-backup'/)
  assert.doesNotMatch(sharedLedgerBlock, /to: '\/settings\/data-management'/)
  assert.match(sharedLedgerBlock, /post_setup_intro\.shared_ledger\.ledger_sync_action/)
  assert.match(sharedLedgerBlock, /to: '\/settings\/google-drive-ledger-sync'/)
})

test('post-setup intro docs mention shared-ledger extra backup and sync actions', () => {
  assert.match(featuresMapSource, /初始設定後導覽頁[\s\S]*共同帳本[\s\S]*恢復備份[\s\S]*帳本同步/)
  assert.match(detailedDocSource, /初始設定後導覽頁[\s\S]*共同帳本[\s\S]*恢復備份[\s\S]*帳本同步/)
})
