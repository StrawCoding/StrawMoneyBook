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
  assert.match(orchestratorSource, /const STATUS_COMPLETED = 'completed'/)
  assert.match(orchestratorSource, /const STATUS_SKIPPED = 'skipped'/)
  assert.match(orchestratorSource, /const STATUS_ERROR = 'error'/)
  assert.match(orchestratorSource, /export async function withAutoBackupProviderLock\(ledgerId, provider, runner, mode = ''\) \{/)
  assert.match(orchestratorSource, /reason: 'already_running'/)
  assert.match(orchestratorSource, /activeProviderRuns\.delete\(key\)/)
})

test('auto backup orchestrator normalizes every provider run result', () => {
  assert.match(orchestratorSource, /function buildProviderRunResult\(/)
  assert.match(orchestratorSource, /ledgerId: normalizeText\(ledgerId\)/)
  assert.match(orchestratorSource, /provider: normalizedProvider/)
  assert.match(orchestratorSource, /mode: normalizeText\(mode\)/)
  assert.match(orchestratorSource, /status: normalizedStatus/)
  assert.match(orchestratorSource, /checkedAt/)
  assert.match(orchestratorSource, /runAutoBackupProvidersIfDue/)
  assert.match(orchestratorSource, /return Promise\.all\(/)
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
  assert.match(orchestratorSource, /mode: 'manual'/)
  assert.match(settingsSource, /runManualAutoBackupProvider\(ledgerStore\.activeLedgerId, 'webdav'/)
  assert.match(settingsSource, /runManualAutoBackupProvider\(ledgerStore\.activeLedgerId, 'google'/)
})

test('runtime state update events include provider, mode, status, reason, and checkedAt', () => {
  assert.match(runtimeSource, /function notifyAutoBackupStateUpdated\(windowObject, result = \{\}\) \{/)
  assert.match(runtimeSource, /provider: String\(result\?\.provider/)
  assert.match(runtimeSource, /mode: String\(result\?\.mode/)
  assert.match(runtimeSource, /status: String\(result\?\.status/)
  assert.match(runtimeSource, /reason: String\(result\?\.reason/)
  assert.match(runtimeSource, /checkedAt: String\(result\?\.checkedAt/)
  assert.match(runtimeSource, /function notifyAutoBackupRunResults/)
})
