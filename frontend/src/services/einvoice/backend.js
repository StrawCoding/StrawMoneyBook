import { translateMessage } from '@/ui/services/i18n.service.js'
import {
  deleteEInvoiceCredential,
  getEInvoiceCredential,
  getImportedInvoiceNumbers,
  insertInvoiceImport,
  upsertEInvoiceCredential,
} from '@/core/repositories/einvoice-import.repo.js'
import { decryptCredential, encryptCredential } from './credential-crypto.js'
import { EINVOICE_PLATFORM, createEInvoiceError } from './shared.js'
import { isEInvoiceAutomationRuntimeSupported, queryNativeEInvoices } from './native-automation.js'
import { traceEInvoiceScrape, traceEInvoiceImport } from '@/core/services/einvoice-debug.service.js'

const t = (key, params, fallback) => translateMessage(key, params, fallback)

// ── Device UUID (stable per-install key for credential encryption) ─────────────

const DEVICE_UUID_KEY = 'smb.einvoice.device_uuid'

function getOrCreateDeviceUuid() {
  let uuid = localStorage.getItem(DEVICE_UUID_KEY)
  if (!uuid) {
    uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_UUID_KEY, uuid)
  }
  return uuid
}

// ── Credential management ─────────────────────────────────────────────────────

export async function saveEInvoiceCredential(phone, password) {
  const deviceUuid = getOrCreateDeviceUuid()
  const { encrypted: encryptedAccount, iv: ivAccount } = await encryptCredential(phone, deviceUuid)
  const { encrypted: encryptedPassword } = await encryptCredential(password, deviceUuid)
  await upsertEInvoiceCredential({
    platform: EINVOICE_PLATFORM,
    encryptedAccount,
    encryptedPassword,
    iv: ivAccount,
  })
}

export async function loadEInvoiceCredential() {
  const row = await getEInvoiceCredential(EINVOICE_PLATFORM)
  if (!row) return null
  const deviceUuid = getOrCreateDeviceUuid()
  try {
    const phone = await decryptCredential(row.encryptedAccount, row.iv, deviceUuid)
    const password = await decryptCredential(row.encryptedPassword, row.iv, deviceUuid)
    return { phone, password }
  } catch {
    return null
  }
}

export async function clearEInvoiceCredential() {
  await deleteEInvoiceCredential(EINVOICE_PLATFORM)
}

export async function hasEInvoiceCredential() {
  const row = await getEInvoiceCredential(EINVOICE_PLATFORM)
  return Boolean(row)
}

// ── Invoice scraping (requires EInvoiceAutomation native plugin) ──────────────

export function isEInvoiceAutomationSupported() {
  return isEInvoiceAutomationRuntimeSupported()
}

export async function scrapeEInvoiceList(queryParams) {
  if (!isEInvoiceAutomationSupported()) {
    throw createEInvoiceError(
      t('einvoice.error.not_supported', {}, '目前平台尚不支援電子發票自動抓取'),
      'einvoice_not_supported',
    )
  }
  return traceEInvoiceScrape(
    { phone: queryParams?.phone, dateFrom: queryParams?.dateFrom, dateTo: queryParams?.dateTo },
    () => queryNativeEInvoices(queryParams),
  )
}

// ── Import invoices into ledger ───────────────────────────────────────────────

export async function importSelectedInvoices(invoices, { accountId, categoryId, ledgerId } = {}) {
  return traceEInvoiceImport(async () => {
    const alreadyImported = await getImportedInvoiceNumbers()
    const results = { imported: [], skipped: [], failed: [] }

    for (const invoice of invoices) {
      if (alreadyImported.has(invoice.invoiceNumber)) {
        results.skipped.push(invoice)
        continue
      }
      try {
        await insertInvoiceImport({
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          invoiceDate: invoice.invoiceDate,
          merchantName: invoice.merchantName,
          carrierName: invoice.carrierName,
          transactionId: null,
        })
        results.imported.push(invoice)
      } catch {
        results.failed.push(invoice)
      }
    }

    return results
  })
}
