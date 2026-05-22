import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDataManagementPage.vue'),
  'utf8',
)
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)
const jaMessagesSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/runtime-ja-messages.generated.js'),
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

test('data management long-running restore/import/reset shows percentage loading overlay', () => {
  assert.match(source, /operationProgress = ref\(createIdleOperationProgress\(\)\)/)
  assert.match(source, /function showOperationProgress\(type\)/)
  assert.match(source, /settings_data\.progress\.import_json\.title/)
  assert.match(source, /settings_data\.progress\.reset\.title/)
  assert.match(source, /operation-progress-fill/)
  assert.match(source, /role="progressbar"/)
  assert.match(source, /:aria-valuenow="operationProgress\.percent"/)
  assert.match(source, /withOperationProgress\('importJson',[\s\S]*await resetDatabase\(\)[\s\S]*await importBackupJsonAsNewLedgers\(text\)[\s\S]*await refreshAllStores\(\)/)
  assert.match(source, /withOperationProgress\('resetAll',[\s\S]*await createResetRecoveryBackup\(\)[\s\S]*await resetDatabase\(\)[\s\S]*await refreshAllStores\(\)/)
})

test('data management progress copy is covered by i18n and docs', () => {
  assert.match(i18nSource, /'settings_data\.progress\.title': '處理資料中'/)
  assert.match(i18nSource, /'settings_data\.progress\.import_json\.title': '正在還原備份'/)
  assert.match(i18nSource, /'settings_data\.progress\.reset\.title': '正在重設資料'/)
  assert.match(i18nSource, /'settings_data\.progress\.title': 'Processing data'/)
  assert.match(i18nSource, /'settings_data\.progress\.import_json\.title': 'Restoring backup'/)
  assert.match(i18nSource, /'settings_data\.progress\.reset\.title': 'Resetting data'/)
  assert.match(jaMessagesSource, /"settings_data\.progress\.import_json\.title": "バックアップを復元中"/)
  assert.match(featuresMapSource, /資料管理[\s\S]*百分比[\s\S]*還原備份|還原備份[\s\S]*百分比[\s\S]*資料管理/)
  assert.match(detailedDocSource, /資料管理頁[\s\S]*百分比[\s\S]*恢復備份|恢復備份[\s\S]*百分比[\s\S]*資料管理頁/)
})
