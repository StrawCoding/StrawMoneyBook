import { isBankCredentialAuthError, selectSyncableBankAccounts } from '../../services/bank-sync/shared.js'
import { logBankSyncAction } from '../../core/services/bank-sync-debug.service.js'
import { isSecurityLockCurrentlyLocked, isSecurityLockEnabled } from './security-lock.service.js'

const AUTO_REFRESH_COOLDOWN_MS = 10 * 60 * 1000
const lastRunAtByLedger = new Map()
const inflightByLedger = new Map()

async function defaultGetBankSyncState(ledgerId) {
  const mod = await import('./bank-sync.service.js')
  return mod.getBankSyncState(ledgerId)
}

async function defaultSyncBankConnectionNow(ledgerId, connectionId) {
  const mod = await import('./bank-sync.service.js')
  return mod.syncBankConnectionNow(ledgerId, connectionId)
}

const defaultDependencies = {
  getBankSyncState: defaultGetBankSyncState,
  syncBankConnectionNow: defaultSyncBankConnectionNow,
  isSecurityLockCurrentlyLocked,
  isSecurityLockEnabled,
}
const dependencies = { ...defaultDependencies }

function normalizeText(value) {
  return String(value ?? '').trim()
}

function shouldSkipForSecurityLock() {
  return dependencies.isSecurityLockEnabled() && dependencies.isSecurityLockCurrentlyLocked()
}

function isConnectionEligible(connection) {
  if (normalizeText(connection?.status).toLowerCase() !== 'active') return false
  return selectSyncableBankAccounts(connection?.accounts).length > 0
}

function isMembershipRequiredError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  if (code === 'MEMBERSHIP_LIMIT_BANK_SYNC_ACCESS') return true
  return normalizeText(error?.message).includes('銀行同步僅限會員使用')
}

export function resetBankSyncAutoRefreshStateForTest() {
  lastRunAtByLedger.clear()
  inflightByLedger.clear()
  Object.assign(dependencies, defaultDependencies)
}

export function setBankSyncAutoRefreshDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export async function runBankSyncAutoRefreshIfDue(ledgerId, options = {}) {
  const normalizedLedgerId = normalizeText(ledgerId)
  logBankSyncAction('autoRefresh.check', {
    ledgerId: normalizedLedgerId,
    reason: normalizeText(options.reason) || 'background',
  })
  if (!normalizedLedgerId) {
    return { ok: false, skipped: 'missing_ledger_id' }
  }
  if (shouldSkipForSecurityLock()) {
    return { ok: false, skipped: 'security_locked' }
  }

  const existingFlight = inflightByLedger.get(normalizedLedgerId)
  if (existingFlight) {
    return existingFlight
  }

  const now = Date.now()
  const lastRunAt = Number(lastRunAtByLedger.get(normalizedLedgerId) ?? 0)
  if (now - lastRunAt < AUTO_REFRESH_COOLDOWN_MS) {
    return { ok: false, skipped: 'cooldown' }
  }

  const flight = (async () => {
    lastRunAtByLedger.set(normalizedLedgerId, Date.now())
    let state = []
    try {
      state = await dependencies.getBankSyncState(normalizedLedgerId)
    } catch (error) {
      if (isMembershipRequiredError(error)) {
        return { ok: false, skipped: 'membership_required' }
      }
      throw error
    }
    const targets = state.filter((connection) => isConnectionEligible(connection))
    if (!targets.length) {
      return { ok: false, skipped: 'no_connections' }
    }

    const results = []
    for (const connection of targets) {
      try {
        const result = await dependencies.syncBankConnectionNow(normalizedLedgerId, connection.id)
        results.push({
          connectionId: connection.id,
          ok: true,
          added: Number(result?.added?.length ?? 0),
          modified: Number(result?.modified?.length ?? 0),
        })
      } catch (error) {
        logBankSyncAction('autoRefresh.connectionFailed', {
          ledgerId: normalizedLedgerId,
          connectionId: connection.id,
          errorCode: normalizeText(error?.code),
          errorMessage: normalizeText(error?.message ?? error),
        })
        console.warn(`[bank-sync] auto refresh failed (${normalizeText(options.reason) || 'background'})`, {
          ledgerId: normalizedLedgerId,
          connectionId: connection.id,
          error,
        })
        results.push({
          connectionId: connection.id,
          ok: false,
          authError: isBankCredentialAuthError(error),
          errorCode: normalizeText(error?.code),
          message: normalizeText(error?.message ?? error),
        })
      }
    }

    const failedConnections = results.filter((item) => item.ok === false)
    const syncedConnections = results.filter((item) => item.ok !== false)
    return {
      ok: failedConnections.length === 0,
      reason: normalizeText(options.reason) || 'background',
      syncedConnections,
      failedConnections,
    }
  })().finally(() => {
    inflightByLedger.delete(normalizedLedgerId)
  })

  inflightByLedger.set(normalizedLedgerId, flight)
  return flight
}
