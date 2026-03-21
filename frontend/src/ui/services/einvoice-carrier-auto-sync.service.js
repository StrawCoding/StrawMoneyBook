import { isSecurityLockCurrentlyLocked, isSecurityLockEnabled } from './security-lock.service.js'

const AUTO_SYNC_COOLDOWN_MS = 10 * 60 * 1000
const inflightByLedger = new Map()
const lastRunAtByLedger = new Map()

async function defaultGetInvoiceCarrierState(ledgerId) {
  const mod = await import('./einvoice-carrier.service.js')
  return mod.getInvoiceCarrierState(ledgerId)
}

async function defaultSyncInvoiceCarrierNow(ledgerId, connectionId) {
  const mod = await import('./einvoice-carrier.service.js')
  return mod.syncInvoiceCarrierNow(ledgerId, connectionId)
}

const defaultDependencies = {
  getInvoiceCarrierState: defaultGetInvoiceCarrierState,
  syncInvoiceCarrierNow: defaultSyncInvoiceCarrierNow,
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

export function resetEinvoiceCarrierAutoSyncStateForTest() {
  inflightByLedger.clear()
  lastRunAtByLedger.clear()
  Object.assign(dependencies, defaultDependencies)
}

export function setEinvoiceCarrierAutoSyncDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export async function runInvoiceCarrierAutoSyncIfDue(ledgerId, options = {}) {
  const normalizedLedgerId = normalizeText(ledgerId)
  if (!normalizedLedgerId) return { ok: false, skipped: 'missing_ledger_id' }
  if (shouldSkipForSecurityLock()) return { ok: false, skipped: 'security_locked' }

  const existingFlight = inflightByLedger.get(normalizedLedgerId)
  if (existingFlight) return existingFlight

  const now = Date.now()
  const lastRunAt = Number(lastRunAtByLedger.get(normalizedLedgerId) ?? 0)
  if (now - lastRunAt < AUTO_SYNC_COOLDOWN_MS) {
    return { ok: false, skipped: 'cooldown' }
  }

  const flight = (async () => {
    lastRunAtByLedger.set(normalizedLedgerId, Date.now())
    const state = await dependencies.getInvoiceCarrierState(normalizedLedgerId)
    const targets = state.filter((connection) => normalizeText(connection.status).toLowerCase() === 'active')
    if (!targets.length) return { ok: false, skipped: 'no_connections' }

    const results = []
    for (const connection of targets) {
      try {
        const result = await dependencies.syncInvoiceCarrierNow(normalizedLedgerId, connection.id)
        results.push({
          connectionId: connection.id,
          syncedCount: Number(result?.syncedCount ?? 0),
        })
      } catch (error) {
        console.warn(`[einvoice] auto sync failed (${normalizeText(options.reason) || 'background'})`, {
          ledgerId: normalizedLedgerId,
          connectionId: connection.id,
          error,
        })
        if (normalizeText(error?.code) === 'einvoice_session_expired') {
          return {
            ok: false,
            halted: 'reauth_required',
            connectionId: connection.id,
            message: normalizeText(error?.message ?? error),
          }
        }
      }
    }

    return {
      ok: true,
      reason: normalizeText(options.reason) || 'background',
      syncedConnections: results,
    }
  })().finally(() => {
    inflightByLedger.delete(normalizedLedgerId)
  })

  inflightByLedger.set(normalizedLedgerId, flight)
  return flight
}
