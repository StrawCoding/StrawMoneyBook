import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

/*
 * SMB-215 Restart history & current invariants (v1.3.2):
 *
 *  - v1.2.27: added「恢復備份 / 帳本同步」to PostSetupIntroPage's
 *    shared-ledger slide (the page reached AFTER setup completes).
 *    Tester reply「沒有東西」 → wrong surface.
 *
 *  - v1.3.1: moved the two buttons to WelcomePage step 2 (the actual
 *    「初始化頁面第二頁」the Tester referred to). The「恢復備份」 button
 *    pointed to `/settings/data-management` (manual JSON / CSV import).
 *    Tester reply「恢復備份需要有自動備份的項目」 → the destination
 *    must be a surface with *automatic backup items* (Google Drive /
 *    WebDAV sign-in + 立即還原), not the manual import page.
 *
 *  - v1.3.2 (this fix): point「恢復備份」 to `/settings/auto-backup`
 *    instead, and move `allowWithoutSetup: true` from
 *    `settings-data-management` to `settings-auto-backup`. The
 *    `/settings/google-drive-ledger-sync` allowWithoutSetup from
 *    v1.3.1 stays (it's the「帳本同步」 destination).
 *
 * These tests pin every invariant the Tester actually cares about,
 * so a future refactor can't silently regress back to v1.2.27 / v1.3.1.
 * The v1.2.27 entry on PostSetupIntroPage is intentionally preserved
 * (see post-setup-intro-actions-source.test.js) — both surfaces expose
 * the entries so the Tester finds them wherever they look.
 */

const welcomeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/WelcomePage.vue'),
  'utf8',
)
const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)
const i18nSource = readI18nBundleSource()
const jaSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/runtime-ja-messages.generated.js'),
  'utf8',
)

test('SMB-215 v1.3.2: WelcomePage step 2 exposes 恢復備份 (→ auto-backup) + 帳本同步 RouterLinks (only when !hasLedgers)', () => {
  // Extract the step-2 section so we don't accidentally match the
  // wrong slide.
  const step2Match = welcomeSource.match(
    /step === 2[\s\S]*?<\/section>/,
  )
  assert.ok(step2Match, 'WelcomePage step-2 section must exist')
  const step2 = step2Match[0]

  // Restore-backup entry MUST point to /settings/auto-backup
  // (Tester reply v1.3.1 → v1.3.2: 「恢復備份需要有自動備份的項目」).
  assert.match(
    step2,
    /<RouterLink v-if="!hasLedgers" class="btn secondary-link" to="\/settings\/auto-backup">[\s\S]*?welcome\.restore_backup_action/,
  )
  // smb298: local recovery may link to data-management, but restore_backup_action
  // itself must stay on auto-backup (not the manual import page).
  assert.doesNotMatch(
    step2,
    /to="\/settings\/data-management"[\s\S]{0,220}welcome\.restore_backup_action/,
  )
  assert.match(step2, /welcome\.local_recovery_action/)
  // Ledger-sync entry
  assert.match(
    step2,
    /<RouterLink v-if="!hasLedgers" class="btn secondary-link" to="\/settings\/google-drive-ledger-sync">[\s\S]*?welcome\.ledger_sync_action/,
  )
  // Both must sit alongside the existing shared-ledger link (not replace it).
  assert.match(step2, /welcome\.join_shared_ledger/)
})

test('SMB-215 v1.3.2 + smb298: auto-backup + google-drive-ledger-sync + data-management allowWithoutSetup', () => {
  // Without allowWithoutSetup the buttons would be dead — App.vue would
  // immediately redirect back to WelcomePage because the user still has
  // 0 ledgers / 0 accounts when they click the button.
  const autoBackupBlock = routerSource.match(
    /name: 'settings-auto-backup'[\s\S]*?\},/,
  )?.[0]
  assert.ok(autoBackupBlock, 'settings-auto-backup route block must exist')
  assert.match(autoBackupBlock, /allowWithoutSetup:\s*true/)

  const syncBlock = routerSource.match(
    /name: 'settings-google-drive-ledger-sync'[\s\S]*?\},/,
  )?.[0]
  assert.ok(syncBlock, 'settings-google-drive-ledger-sync route block must exist')
  assert.match(syncBlock, /allowWithoutSetup:\s*true/)

  // smb298: local IndexedDB recovery list/restore from Welcome needs data-management
  // reachable with 0 ledgers. restore_backup_action still points to auto-backup only.
  const dataMgmtBlock = routerSource.match(
    /name: 'settings-data-management'[\s\S]*?\},/,
  )?.[0]
  assert.ok(dataMgmtBlock, 'settings-data-management route block must exist')
  assert.match(dataMgmtBlock, /allowWithoutSetup:\s*true/)
})

test('SMB-215 v1.3.2: i18n welcome.restore_backup_action / welcome.ledger_sync_action exist in all three locales', () => {
  // zh-TW base — the audit script also enforces parity, but we pin the
  // exact zh-TW strings so they're not silently changed.
  assert.match(i18nSource, /'welcome\.restore_backup_action':\s*'恢復備份'/)
  assert.match(i18nSource, /'welcome\.ledger_sync_action':\s*'帳本同步'/)
  // en
  assert.match(i18nSource, /'welcome\.restore_backup_action':\s*'Restore Backup'/)
  assert.match(i18nSource, /'welcome\.ledger_sync_action':\s*'Ledger Sync'/)
  // ja (generated bundle)
  assert.match(jaSource, /"welcome\.restore_backup_action":\s*"バックアップを復元"/)
  assert.match(jaSource, /"welcome\.ledger_sync_action":\s*"台帳の同期"/)
})
