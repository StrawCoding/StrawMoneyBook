import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * SMB-215 Restart (v1.3.1) — regression coverage:
 *
 * v1.2.27 added the「恢復備份 / 帳本同步」quick actions to the wrong
 * surface (PostSetupIntroPage's shared-ledger slide — i.e. the page
 * AFTER setup completes), but the Tester's original requirement and
 * the issue title「初始化頁面」refer to the SETUP wizard itself
 * (`WelcomePage.vue`), specifically step 2「建立帳本」where the
 * existing「已有共同帳本？登入並加入」 secondary link already lives.
 *
 * The Tester's「沒有東西」reply confirmed that they could not find the
 * buttons on the 初始化第二頁 (because they were on PostSetupIntroPage
 * which is reached AFTER finishing step 3).
 *
 * v1.3.1 fixes this by adding the two buttons to WelcomePage step 2
 * (siblings of the existing shared-ledger link, only when
 * `!hasLedgers`), and adds `allowWithoutSetup: true` to the two
 * destination routes so the buttons actually reach their target pages
 * instead of being silently bounced back to WelcomePage by App.vue's
 * shouldShowWelcomePage guard.
 *
 * These tests pin both invariants. The v1.2.27 work on
 * PostSetupIntroPage is intentionally preserved (see
 * post-setup-intro-actions-source.test.js) — both surfaces now expose
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
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)
const jaSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/runtime-ja-messages.generated.js'),
  'utf8',
)

test('SMB-215 v1.3.1: WelcomePage step 2 exposes 恢復備份 + 帳本同步 RouterLinks (only when !hasLedgers)', () => {
  // Extract the step-2 section so we don't accidentally match the
  // wrong slide.
  const step2Match = welcomeSource.match(
    /step === 2[\s\S]*?<\/section>/,
  )
  assert.ok(step2Match, 'WelcomePage step-2 section must exist')
  const step2 = step2Match[0]

  // Restore-backup entry
  assert.match(
    step2,
    /<RouterLink v-if="!hasLedgers" class="btn secondary-link" to="\/settings\/data-management">[\s\S]*?welcome\.restore_backup_action/,
  )
  // Ledger-sync entry
  assert.match(
    step2,
    /<RouterLink v-if="!hasLedgers" class="btn secondary-link" to="\/settings\/google-drive-ledger-sync">[\s\S]*?welcome\.ledger_sync_action/,
  )
  // Both must sit alongside the existing shared-ledger link (not replace it).
  assert.match(step2, /welcome\.join_shared_ledger/)
})

test('SMB-215 v1.3.1: data-management + google-drive-ledger-sync routes have allowWithoutSetup: true', () => {
  // Without allowWithoutSetup the buttons would be dead — App.vue would
  // immediately redirect back to WelcomePage because the user still has
  // 0 ledgers / 0 accounts when they click the button.
  const dataMgmtBlock = routerSource.match(
    /name: 'settings-data-management'[\s\S]*?\},/,
  )?.[0]
  assert.ok(dataMgmtBlock, 'settings-data-management route block must exist')
  assert.match(dataMgmtBlock, /allowWithoutSetup:\s*true/)

  const syncBlock = routerSource.match(
    /name: 'settings-google-drive-ledger-sync'[\s\S]*?\},/,
  )?.[0]
  assert.ok(syncBlock, 'settings-google-drive-ledger-sync route block must exist')
  assert.match(syncBlock, /allowWithoutSetup:\s*true/)
})

test('SMB-215 v1.3.1: i18n welcome.restore_backup_action / welcome.ledger_sync_action exist in all three locales', () => {
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
