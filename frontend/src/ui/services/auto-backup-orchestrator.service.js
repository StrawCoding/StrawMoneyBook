import {
  performGoogleBackup,
  runGoogleAutoBackupIfDue,
  runGoogleAutoBackupOnDataChange,
} from '@/ui/services/google-backup.service'
import {
  performWebdavBackup,
  runWebdavAutoBackupIfDue,
  runWebdavAutoBackupOnDataChange,
} from '@/ui/services/webdav-backup.service'

const PROVIDER_GOOGLE = 'google'
const PROVIDER_WEBDAV = 'webdav'
const activeProviderRuns = new Map()

const defaultDependencies = {
  performGoogleBackup,
  performWebdavBackup,
  runGoogleAutoBackupIfDue,
  runGoogleAutoBackupOnDataChange,
  runWebdavAutoBackupIfDue,
  runWebdavAutoBackupOnDataChange,
}

const dependencies = { ...defaultDependencies }

export function setAutoBackupOrchestratorDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetAutoBackupOrchestratorDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
  activeProviderRuns.clear()
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeProvider(provider) {
  const normalized = normalizeText(provider).toLowerCase()
  if (normalized === PROVIDER_GOOGLE || normalized === PROVIDER_WEBDAV) return normalized
  throw new Error(`Unsupported auto backup provider: ${provider}`)
}

function buildProviderRunKey(ledgerId, provider) {
  return `${normalizeText(ledgerId)}:${normalizeProvider(provider)}`
}

function assertLedgerId(ledgerId) {
  if (!normalizeText(ledgerId)) throw new Error('ledgerId is required')
}

export function isAutoBackupProviderRunLocked(ledgerId, provider) {
  return activeProviderRuns.has(buildProviderRunKey(ledgerId, provider))
}

export async function withAutoBackupProviderLock(ledgerId, provider, runner) {
  assertLedgerId(ledgerId)
  const normalizedProvider = normalizeProvider(provider)
  const key = buildProviderRunKey(ledgerId, normalizedProvider)
  if (activeProviderRuns.has(key)) {
    return {
      skipped: true,
      locked: true,
      provider: normalizedProvider,
      reason: 'already_running',
    }
  }

  const runPromise = Promise.resolve()
    .then(() => runner())
    .finally(() => {
      activeProviderRuns.delete(key)
    })

  activeProviderRuns.set(key, runPromise)
  return runPromise
}

function providerRunner(provider, mode) {
  const normalizedProvider = normalizeProvider(provider)
  if (normalizedProvider === PROVIDER_GOOGLE && mode === 'due') return dependencies.runGoogleAutoBackupIfDue
  if (normalizedProvider === PROVIDER_GOOGLE && mode === 'data_change') return dependencies.runGoogleAutoBackupOnDataChange
  if (normalizedProvider === PROVIDER_GOOGLE && mode === 'manual') return dependencies.performGoogleBackup
  if (normalizedProvider === PROVIDER_WEBDAV && mode === 'due') return dependencies.runWebdavAutoBackupIfDue
  if (normalizedProvider === PROVIDER_WEBDAV && mode === 'data_change') return dependencies.runWebdavAutoBackupOnDataChange
  if (normalizedProvider === PROVIDER_WEBDAV && mode === 'manual') return dependencies.performWebdavBackup
  throw new Error(`Unsupported auto backup mode: ${mode}`)
}

export async function runAutoBackupProvider(ledgerId, provider, mode, options = {}) {
  const runner = providerRunner(provider, mode)
  return withAutoBackupProviderLock(ledgerId, provider, () => runner(ledgerId, options))
}

export function runAutoBackupProvidersIfDue(ledgerId, providers = [PROVIDER_GOOGLE, PROVIDER_WEBDAV]) {
  assertLedgerId(ledgerId)
  return Promise.allSettled(
    providers.map((provider) => runAutoBackupProvider(ledgerId, provider, 'due')),
  )
}

export function runAutoBackupProvidersOnDataChange(ledgerId, providers = [PROVIDER_GOOGLE, PROVIDER_WEBDAV]) {
  assertLedgerId(ledgerId)
  return Promise.allSettled(
    providers.map((provider) => runAutoBackupProvider(ledgerId, provider, 'data_change')),
  )
}

export async function runManualAutoBackupProvider(ledgerId, provider, { saveSettings } = {}) {
  const runner = providerRunner(provider, 'manual')
  return withAutoBackupProviderLock(ledgerId, provider, async () => {
    if (typeof saveSettings === 'function') {
      const saved = await saveSettings()
      if (!saved) {
        return {
          skipped: true,
          provider: normalizeProvider(provider),
          reason: 'settings_not_saved',
        }
      }
    }
    return runner(ledgerId, { interactiveAuth: true })
  })
}

export const AUTO_BACKUP_PROVIDERS = Object.freeze({
  GOOGLE: PROVIDER_GOOGLE,
  WEBDAV: PROVIDER_WEBDAV,
})
