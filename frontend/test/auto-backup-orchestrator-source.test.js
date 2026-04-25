import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const orchestratorSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/auto-backup-orchestrator.service.js'),
  'utf8',
)
const runtimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)

test('auto backup orchestrator owns provider-scoped concurrency locks', () => {
  assert.match(orchestratorSource, /const activeProviderRuns = new Map\(\)/)
  assert.match(orchestratorSource, /function buildProviderRunKey\(ledgerId, provider\) \{/)
  assert.match(orchestratorSource, /export async function withAutoBackupProviderLock\(ledgerId, provider, runner\) \{/)
  assert.match(orchestratorSource, /reason: 'already_running'/)
  assert.match(orchestratorSource, /activeProviderRuns\.delete\(key\)/)
})

test('runtime backup dispatch goes through the orchestrator instead of direct provider writes', () => {
  assert.match(runtimeSource, /runAutoBackupProvidersIfDue/)
  assert.match(runtimeSource, /runAutoBackupProvidersOnDataChange/)
  assert.match(runtimeSource, /runAutoBackupProvider\(ledgerId, 'google', 'due'\)/)
  assert.doesNotMatch(runtimeSource, /runGoogleAutoBackupIfDue/)
  assert.doesNotMatch(runtimeSource, /runGoogleAutoBackupOnDataChange/)
  assert.doesNotMatch(runtimeSource, /runWebdavAutoBackupIfDue/)
  assert.doesNotMatch(runtimeSource, /runWebdavAutoBackupOnDataChange/)
})

test('manual backup buttons save settings through orchestrator preflight before upload', () => {
  assert.match(orchestratorSource, /export async function runManualAutoBackupProvider/)
  assert.match(orchestratorSource, /const saved = await saveSettings\(\)/)
  assert.match(orchestratorSource, /reason: 'settings_not_saved'/)
  assert.match(settingsSource, /runManualAutoBackupProvider\(ledgerStore\.activeLedgerId, 'webdav'/)
  assert.match(settingsSource, /runManualAutoBackupProvider\(ledgerStore\.activeLedgerId, 'google'/)
})
