import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appDialogSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/AppDialog.vue'),
  'utf8',
)

const formDialogFiles = [
  '../src/ui/views/subscriptions/SubscriptionListPage.vue',
  '../src/ui/views/savings-jars/SavingsJarListPage.vue',
  '../src/ui/views/settings/SettingsLedgerPage.vue',
  '../src/ui/views/settings/SettingsCategoryPage.vue',
  '../src/ui/views/accounts/AssetAccountManagementPage.vue',
]

test('AppDialog supports rendering form dialogs as bottom sheets', () => {
  assert.match(appDialogSource, /presentation: \{/)
  assert.match(appDialogSource, /default: 'dialog'/)
  assert.match(appDialogSource, /dialog-mask-sheet/)
  assert.match(appDialogSource, /sheet app-bottom-sheet dialog-sheet/)
  assert.match(appDialogSource, /app-bottom-sheet-body/)
})

test('input-heavy dialogs opt into the bottom sheet presentation', () => {
  for (const relativePath of formDialogFiles) {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
    assert.match(source, /presentation="sheet"/)
  }
})
