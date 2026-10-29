import { createId } from '@/core/utils/id'
import { getImportedInvoiceNumbers } from '@/core/repositories/einvoice-import.repo.js'
import {
  getEInvoiceSyncConfig,
  insertEInvoiceSyncRun,
  insertPendingEInvoiceInvoices,
  listDismissedInvoiceNumbers,
  listPendingEInvoiceInvoices,
  markPendingInvoicesStatus,
  upsertEInvoiceSyncConfig,
} from '@/core/repositories/einvoice-sync.repo.js'
import { traceEInvoiceScrape } from '@/core/services/einvoice-debug.service.js'
import { assertCanUseCarrierSync, hasCarrierSyncMembershipAccess } from '@/core/services/membership.service.js'
import {
  cancelCarrierSyncBackendSession,
  fetchCarrierInvoices,
  refreshCarrierCaptchaBackendSession,
  resolveCarrierSyncBackend,
} from './carrier-sync-orchestrator.js'
import { importSelectedInvoices, loadEInvoiceCredential } from './backend.js'
import { yieldToMainThread } from '@/core/utils/cooperative-yield'
import { runtimeJobs } from '@/ui/services/runtime-job-scheduler.js'

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildSyncDateRange(config) {
  const lookbackDays = Math.min(14, Math.max(1, Number(config?.lookbackDays ?? 7) || 7))
  const end = new Date()
  const start = new Date(end.getTime())
  if (config?.lastSyncAt) {
    start.setTime(Math.max(start.getTime() - lookbackDays * 86_400_000, Number(config.lastSyncAt) - 86_400_000))
  } else {
    start.setDate(start.getDate() - (lookbackDays - 1))
  }
  return {
    dateFrom: formatDateInput(start),
    dateTo: formatDateInput(end),
  }
}

async function dedupeInvoices(invoices = []) {
  const imported = await getImportedInvoiceNumbers()
  await yieldToMainThread()
  const dismissed = await listDismissedInvoiceNumbers()
  await yieldToMainThread()
  const pending = await listPendingEInvoiceInvoices()
  const pendingNumbers = new Set(pending.map((item) => item.invoiceNumber))

  return invoices.filter((invoice) => {
    const number = String(invoice?.invoiceNumber ?? '').trim()
    if (!number) return false
    if (imported.has(number)) return false
    if (dismissed.has(number)) return false
    if (pendingNumbers.has(number)) return false
    return true
  })
}

export async function getCarrierSyncState() {
  const config = await getEInvoiceSyncConfig()
  const pending = await listPendingEInvoiceInvoices()
  return {
    config,
    pendingCount: pending.length,
    pending,
  }
}

export async function saveCarrierSyncConfig(patch = {}) {
  return upsertEInvoiceSyncConfig(patch)
}

export async function syncCarrierInvoicesNow({
  carrierBarcode,
  verificationCode,
  captchaCode = '',
  sessionId = '',
  ledgerId = null,
} = {}) {
  await assertCanUseCarrierSync()

  const config = await getEInvoiceSyncConfig()
  const { dateFrom, dateTo } = buildSyncDateRange(config)
  const syncRunId = createId('einv_sync_run')
  const startedAt = Date.now()

  return traceEInvoiceScrape(
    {
      carrierBarcode,
      dateFrom,
      dateTo,
      operation: 'sync',
      backend: resolveCarrierSyncBackend(),
    },
    async () => {
      const invoices = await fetchCarrierInvoices({
        cardNo: carrierBarcode,
        cardEncrypt: verificationCode,
        dateFrom,
        dateTo,
        captchaCode,
        sessionId,
        lastSyncAt: config?.lastSyncAt ?? null,
        lookbackDays: config?.lookbackDays ?? 7,
      })

      const deduped = await dedupeInvoices(invoices)
      const inserted = await insertPendingEInvoiceInvoices(deduped, syncRunId)
      const finishedAt = Date.now()

      await insertEInvoiceSyncRun({
        id: syncRunId,
        startedAt,
        finishedAt,
        status: 'ok',
        fetchedCount: invoices.length,
        newPendingCount: inserted,
      })

      await upsertEInvoiceSyncConfig({
        ledgerId: ledgerId ?? config?.ledgerId ?? null,
        lastSyncAt: finishedAt,
        lastSyncStatus: 'ok',
        lastError: null,
      })

      return {
        syncRunId,
        fetchedCount: invoices.length,
        newPendingCount: inserted,
        pending: await listPendingEInvoiceInvoices(),
      }
    },
  ).catch(async (error) => {
    if (error?.code === 'einvoice_captcha_required') {
      await insertEInvoiceSyncRun({
        id: syncRunId,
        startedAt,
        finishedAt: Date.now(),
        status: 'captcha_required',
        errorCode: 'einvoice_captcha_required',
        errorMessage: String(error?.message ?? '請輸入圖形驗證碼'),
      })
      await upsertEInvoiceSyncConfig({
        lastSyncStatus: 'captcha_required',
        lastError: null,
      })
      throw error
    }
    await insertEInvoiceSyncRun({
      id: syncRunId,
      startedAt,
      finishedAt: Date.now(),
      status: 'error',
      errorCode: String(error?.code ?? 'einvoice_query_failed'),
      errorMessage: String(error?.message ?? '同步失敗'),
    })
    const errorCode = String(error?.code ?? 'einvoice_query_failed').trim() || 'einvoice_query_failed'
    const errorMessage = String(error?.message ?? '同步失敗').trim() || '同步失敗'
    await upsertEInvoiceSyncConfig({
      lastSyncStatus: 'error',
      // Persist code:message so availability can surface the real stage code
      // (e.g. einvoice_network_failed) instead of collapsing to query_failed.
      lastError: `${errorCode}: ${errorMessage}`,
    })
    throw error
  })
}

export async function importPendingCarrierInvoices({
  invoiceNumbers = [],
  ledgerId,
  accountId,
  categoryId,
} = {}) {
  const pending = await listPendingEInvoiceInvoices()
  const selected = pending.filter((item) => invoiceNumbers.includes(item.invoiceNumber))
  if (!selected.length) {
    return { imported: [], skipped: [], failed: [] }
  }

  const result = await importSelectedInvoices(selected, { ledgerId, accountId, categoryId })
  const importedNumbers = result.imported.map((item) => item.invoiceNumber)
  await markPendingInvoicesStatus(importedNumbers, 'imported')
  return result
}

export async function dismissPendingCarrierInvoices(invoiceNumbers = []) {
  return markPendingInvoicesStatus(invoiceNumbers, 'dismissed')
}

export async function cancelCarrierSyncSession(sessionId = '') {
  if (!sessionId) return
  await cancelCarrierSyncBackendSession(sessionId)
}

/**
 * Restart scrape session to refresh captcha image. Cancels prior session first.
 */
export async function refreshCarrierCaptchaSession({
  carrierBarcode,
  verificationCode,
  previousSessionId = '',
} = {}) {
  await assertCanUseCarrierSync()
  return refreshCarrierCaptchaBackendSession({
    cardNo: carrierBarcode,
    cardEncrypt: verificationCode,
    previousSessionId,
  })
}

let autoSyncInFlight = false
let lastAutoSyncAt = 0
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000

export async function maybeAutoSyncCarrierInvoices({
  carrierBarcode,
  verificationCode,
  ledgerId,
} = {}) {
  if (!hasCarrierSyncMembershipAccess()) return null
  const config = await getEInvoiceSyncConfig()
  if (!config?.autoSyncEnabled) return null
  if (!carrierBarcode || !verificationCode) return null
  if (autoSyncInFlight) return null
  if (Date.now() - lastAutoSyncAt < AUTO_SYNC_COOLDOWN_MS) return null

  autoSyncInFlight = true
  try {
    const result = await syncCarrierInvoicesNow({
      carrierBarcode,
      verificationCode,
      ledgerId,
    })
    lastAutoSyncAt = Date.now()
    return result
  } catch (error) {
    if (error?.code === 'einvoice_captcha_required') throw error
    console.error('[CarrierSync] auto sync failed', error)
    return null
  } finally {
    autoSyncInFlight = false
  }
}

export async function runCarrierSyncAutoRefreshInBackground(ledgerId, reason = 'app_resume') {
  const normalizedLedgerId = String(ledgerId ?? '').trim() || 'default'
  return runtimeJobs.run(`carrier-auto-refresh:${normalizedLedgerId}`, async () => {
    try {
      const credential = await loadEInvoiceCredential()
      if (!credential) return null
      await yieldToMainThread()
      const result = await maybeAutoSyncCarrierInvoices({
        carrierBarcode: credential.carrierBarcode,
        verificationCode: credential.verificationCode,
        ledgerId,
      })
      if (result?.newPendingCount > 0) {
        console.log(`[CarrierSync] ${reason}: ${result.newPendingCount} new pending invoices`)
      }
      return result
    } catch (error) {
      console.error(`[CarrierSync] background refresh failed (${reason})`, error)
      return null
    }
  })
}
