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
const STATUS_COMPLETED = 'completed'
const STATUS_SKIPPED = 'skipped'
const STATUS_ERROR = 'error'
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

function normalizeRunStatus(status, fallback = STATUS_COMPLETED) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === STATUS_COMPLETED || normalized === STATUS_SKIPPED || normalized === STATUS_ERROR) return normalized
  if (normalized === 'ok') return STATUS_COMPLETED
  if (normalized === 'failed') return STATUS_ERROR
  return fallback
}

function buildProviderRunResult({
  ledgerId,
  provider,
  mode,
  rawResult = null,
  status = '',
  reason = '',
  error = null,
} = {}) {
  const normalizedStatus = normalizeRunStatus(
    status || rawResult?.status,
    error ? STATUS_ERROR : (rawResult?.skipped ? STATUS_SKIPPED : STATUS_COMPLETED),
  )
  const checkedAt = normalizeText(rawResult?.checkedAt) || new Date().toISOString()
  const normalizedProvider = normalizeProvider(provider)
  return {
    ...(rawResult && typeof rawResult === 'object' ? rawResult : {}),
    ledgerId: normalizeText(ledgerId),
    provider: normalizedProvider,
    mode: normalizeText(mode),
    status: normalizedStatus,
    skipped: normalizedStatus === STATUS_SKIPPED,
    error: normalizedStatus === STATUS_ERROR,
    reason: normalizeText(reason || rawResult?.reason) || (
      normalizedStatus === STATUS_COMPLETED
        ? 'backup_completed'
        : normalizedStatus === STATUS_SKIPPED
          ? 'skipped'
          : 'backup_failed'
    ),
    checkedAt,
  }
}

export function isAutoBackupProviderRunLocked(ledgerId, provider) {
  return activeProviderRuns.has(buildProviderRunKey(ledgerId, provider))
}

export async function withAutoBackupProviderLock(ledgerId, provider, runner, mode = '') {
  assertLedgerId(ledgerId)
  const normalizedProvider = normalizeProvider(provider)
  const key = buildProviderRunKey(ledgerId, normalizedProvider)
  if (activeProviderRuns.has(key)) {
    return buildProviderRunResult({
      ledgerId,
      provider: normalizedProvider,
      mode: normalizeText(mode) || 'unknown',
      status: STATUS_SKIPPED,
      reason: 'already_running',
      rawResult: {
        locked: true,
      },
    })
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
  return withAutoBackupProviderLock(ledgerId, provider, async () => {
    try {
      const rawResult = await runner(ledgerId, options)
      return buildProviderRunResult({
        ledgerId,
        provider,
        mode,
        rawResult,
      })
    } catch (error) {
      return buildProviderRunResult({
        ledgerId,
        provider,
        mode,
        status: STATUS_ERROR,
        reason: normalizeText(error?.code) || 'backup_failed',
        error,
      })
    }
  }, mode)
}

export function runAutoBackupProvidersIfDue(ledgerId, providers = [PROVIDER_GOOGLE, PROVIDER_WEBDAV]) {
  assertLedgerId(ledgerId)
  return Promise.all(
    providers.map((provider) => runAutoBackupProvider(ledgerId, provider, 'due')),
  )
}

export function runAutoBackupProvidersOnDataChange(ledgerId, providers = [PROVIDER_GOOGLE, PROVIDER_WEBDAV]) {
  assertLedgerId(ledgerId)
  return Promise.all(
    providers.map((provider) => runAutoBackupProvider(ledgerId, provider, 'data_change')),
  )
}

export async function runManualAutoBackupProvider(ledgerId, provider, { saveSettings } = {}) {
  const runner = providerRunner(provider, 'manual')
  return withAutoBackupProviderLock(ledgerId, provider, async () => {
    if (typeof saveSettings === 'function') {
      const saved = await saveSettings()
      if (!saved) {
        return buildProviderRunResult({
          ledgerId,
          provider,
          mode: 'manual',
          status: STATUS_SKIPPED,
          reason: 'settings_not_saved',
        })
      }
    }
    try {
      const rawResult = await runner(ledgerId, { interactiveAuth: true })
      return buildProviderRunResult({
        ledgerId,
        provider,
        mode: 'manual',
        rawResult,
      })
    } catch (error) {
      return buildProviderRunResult({
        ledgerId,
        provider,
        mode: 'manual',
        status: STATUS_ERROR,
        reason: normalizeText(error?.code) || 'backup_failed',
        error,
      })
    }
  }, 'manual')
}

export const AUTO_BACKUP_PROVIDERS = Object.freeze({
  GOOGLE: PROVIDER_GOOGLE,
  WEBDAV: PROVIDER_WEBDAV,
})
