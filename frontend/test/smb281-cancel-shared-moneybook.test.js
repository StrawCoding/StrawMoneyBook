import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pageSource = readFileSync(
  join(root, 'src/ui/views/settings/SettingsSharedLedgerPage.vue'),
  'utf8',
)
const serviceSource = readFileSync(
  join(root, 'src/ui/services/shared-ledger.service.js'),
  'utf8',
)
const backendClientSource = readFileSync(
  join(root, 'src/services/shared-ledger/backend.js'),
  'utf8',
)
const routesSource = readFileSync(
  join(dirname(root), 'backend/src/routes/shared-ledgers/index.js'),
  'utf8',
)
const ledgerHandlersSource = readFileSync(
  join(dirname(root), 'backend/src/routes/shared-ledgers/ledger-handlers.js'),
  'utf8',
)
const i18nSource = readI18nBundleSource()

test('SMB-281: DELETE shared ledger bypasses membership so leave/unshare still works', () => {
  assert.match(routesSource, /name: 'delete'[\s\S]*?bypassMembership: true/)
  assert.match(ledgerHandlersSource, /mode: 'already_gone'/)
  assert.match(ledgerHandlersSource, /mode: 'owner_deleted'/)
  assert.match(ledgerHandlersSource, /mode: 'member_left'/)
})

test('SMB-281: stopSharing clears local meta even when remote ledger is already gone', () => {
  assert.match(serviceSource, /export async function stopSharingLocalLedger/)
  assert.match(serviceSource, /export async function stopSharingRemoteSharedLedger/)
  assert.match(serviceSource, /function isSharedLedgerAlreadyGoneError/)
  assert.match(serviceSource, /deleteSharedLedgerAllowingGone/)
  assert.match(serviceSource, /assertStopSharingSessionReady/)
  assert.match(serviceSource, /needsSharedLedgerReauth/)
  assert.match(serviceSource, /clearSharedLedgerMeta/)
  assert.match(backendClientSource, /export async function deleteSharedLedger/)
  assert.match(backendClientSource, /method: 'DELETE'/)
})

test('SMB-281: settings page keeps cancel/leave controls when membership lapses', () => {
  assert.match(pageSource, /data-testid="shared-ledger-local-unshare-panel"/)
  assert.match(pageSource, /data-testid="shared-ledger-local-unshare-btn"/)
  assert.match(pageSource, /data-testid="shared-ledger-active-unshare-btn"/)
  assert.match(pageSource, /data-testid="shared-ledger-remote-unshare-btn"/)
  assert.match(pageSource, /hasLocalSharedBindings/)
  assert.match(pageSource, /member_only_unshare_hint/)
  assert.match(pageSource, /getActiveUnshareLabel/)
  assert.match(pageSource, /leave_shared/)
  assert.match(pageSource, /unshare_needs_reauth/)
  assert.match(pageSource, /sessionNeedsReauth/)
  assert.doesNotMatch(
    pageSource,
    /async function stopSharingActiveLedger\(\) \{\s*if \(!activeLedger\.value \|\| !activeLedgerMeta\.value\?\.shared_ledger_id \|\| apiUnavailable\.value\) return/,
  )
})

test('SMB-281: confirm dialog action surfaces failure toast and clears busy state', () => {
  assert.match(pageSource, /confirmDialogAction/)
  assert.match(pageSource, /toast\.unshare_failed/)
  assert.match(pageSource, /toast\.unshare_needs_reauth/)
  assert.match(pageSource, /loading: false/)
  assert.match(pageSource, /ledgerActionBusy\.value = ''/)
  assert.match(pageSource, /remoteDeleteBusyId\.value = ''/)
  assert.match(pageSource, /await refreshLocalBindings\(\)/)
})

test('SMB-281: confirm dialog stacks above BottomNav', () => {
  const dialogSource = readFileSync(join(root, 'src/ui/components/common/AppDialog.vue'), 'utf8')
  const navSource = readFileSync(join(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
  assert.match(dialogSource, /\.dialog-mask-popup\s*\{[\s\S]*?z-index:\s*75/)
  assert.match(navSource, /\.bottom-nav\s*\{[\s\S]*?z-index:\s*40/)
})

test('SMB-281: i18n covers cancel share and leave share copy', () => {
  for (const key of [
    'settings_shared_ledgers.unshare',
    'settings_shared_ledgers.leave_shared',
    'settings_shared_ledgers.unshare_confirm',
    'settings_shared_ledgers.leave_shared_confirm',
    'settings_shared_ledgers.toast.unshared',
    'settings_shared_ledgers.toast.shared_left',
    'settings_shared_ledgers.toast.unshare_failed',
    'settings_shared_ledgers.toast.unshare_needs_reauth',
    'settings_shared_ledgers.local_bindings_title',
  ]) {
    assert.match(i18nSource, new RegExp(key.replace(/\./g, '\\.')))
  }
  assert.match(i18nSource, /取消共享/)
  assert.match(i18nSource, /不再共享/)
})
