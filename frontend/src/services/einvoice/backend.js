import { translateMessage } from '@/ui/services/i18n.service.js'
import {
  deleteEInvoiceCredential,
  getEInvoiceCredential,
  getImportedInvoiceNumbers,
  insertInvoiceImport,
  upsertEInvoiceCredential,
} from '@/core/repositories/einvoice-import.repo.js'
import { decryptCredential, encryptCredential } from './credential-crypto.js'
import { EINVOICE_PLATFORM, createEInvoiceError, buildCarrierTagsJson } from './shared.js'
import { traceEInvoiceScrape, traceEInvoiceImport } from '@/core/services/einvoice-debug.service.js'
import { createExpense } from '@/core/services/transaction.service.js'
import { Capacitor } from '@capacitor/core'

const t = (key, params, fallback) => translateMessage(key, params, fallback)

// ── Backend API base URL ──────────────────────────────────────────────────────

const PROD_DEFAULT_API_BASE = 'https://api.strawmb.com'
const EXPLICIT_API_BASE = String(import.meta.env.VITE_EINVOICE_API_BASE_URL ?? '').trim()
const EINVOICE_CLIENT_SHARED_KEY = String(import.meta.env.VITE_EINVOICE_CLIENT_SHARED_KEY ?? '').trim()
const EINVOICE_QUERY_TIMEOUT_MS = 35_000

function getEInvoiceApiBase() {
  if (EXPLICIT_API_BASE) return EXPLICIT_API_BASE
  if (Capacitor.getPlatform() !== 'web') return PROD_DEFAULT_API_BASE
  if (import.meta.env.PROD) return PROD_DEFAULT_API_BASE
  return ''
}

function buildApiUrl(path) {
  const base = getEInvoiceApiBase()
  return base ? `${base.replace(/\/$/, '')}${path}` : path
}

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

export async function saveEInvoiceCredential(carrierBarcode, verificationCode) {
  console.log('[EInvoice] 儲存載具憑證（條碼前 4 碼）:', String(carrierBarcode ?? '').slice(0, 4) + '****')
  const deviceUuid = getOrCreateDeviceUuid()
  const { encrypted: encryptedAccount, iv: ivAccount } = await encryptCredential(carrierBarcode, deviceUuid)
  const { encrypted: encryptedPassword, iv: ivPassword } = await encryptCredential(verificationCode, deviceUuid)
  await upsertEInvoiceCredential({
    platform: EINVOICE_PLATFORM,
    encryptedAccount,
    encryptedPassword,
    iv: ivAccount,
    passwordIv: ivPassword,
  })
  console.log('[EInvoice] 載具憑證儲存成功')
}

export async function loadEInvoiceCredential() {
  const row = await getEInvoiceCredential(EINVOICE_PLATFORM)
  if (!row) {
    console.log('[EInvoice] 無已儲存憑證')
    return null
  }
  const deviceUuid = getOrCreateDeviceUuid()
  try {
    const carrierBarcode = await decryptCredential(row.encryptedAccount, row.iv, deviceUuid)
    const verificationCode = await decryptCredential(row.encryptedPassword, row.passwordIv || row.iv, deviceUuid)
    console.log('[EInvoice] 已載入儲存憑證（條碼前 4 碼）:', String(carrierBarcode ?? '').slice(0, 4) + '****')
    return { carrierBarcode, verificationCode }
  } catch (err) {
    console.error('[EInvoice] 憑證解密失敗，忽略已儲存資料', err)
    return null
  }
}

export async function clearEInvoiceCredential() {
  console.log('[EInvoice] 清除載具憑證')
  await deleteEInvoiceCredential(EINVOICE_PLATFORM)
}

export async function hasEInvoiceCredential() {
  const row = await getEInvoiceCredential(EINVOICE_PLATFORM)
  return Boolean(row)
}

// ── Invoice scraping via backend API ─────────────────────────────────────────

export async function scrapeEInvoiceList(queryParams) {
  console.log('[EInvoice] 開始查詢發票 — 日期區間:', queryParams?.dateFrom, '~', queryParams?.dateTo)
  return traceEInvoiceScrape(
    { carrierBarcode: queryParams?.carrierBarcode, dateFrom: queryParams?.dateFrom, dateTo: queryParams?.dateTo },
    async () => {
      const url = buildApiUrl('/api/einvoice/query-invoices')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EINVOICE_QUERY_TIMEOUT_MS)
      try {
        const headers = { 'Content-Type': 'application/json' }
        if (EINVOICE_CLIENT_SHARED_KEY) {
          headers['X-Straw-Client-Key'] = EINVOICE_CLIENT_SHARED_KEY
        }
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            cardNo: String(queryParams?.carrierBarcode ?? '').trim(),
            cardEncrypt: String(queryParams?.verificationCode ?? ''),
            startDate: String(queryParams?.dateFrom ?? '').trim(),
            endDate: String(queryParams?.dateTo ?? '').trim(),
            onlyWinningInv: 'N',
          }),
          signal: controller.signal,
        })
        let data = null
        try {
          data = await response.json()
        } catch {
          data = null
        }
        if (!response.ok) {
          const errorCode = String(data?.error ?? 'einvoice_query_failed')
          const errorMessage = String(data?.message ?? t('einvoice.error.scrape_failed', {}, '抓取發票失敗，請重試'))
          throw createEInvoiceError(errorMessage, errorCode)
        }
        const list = Array.isArray(data?.invoices) ? data.invoices : []
        console.log('[EInvoice] 查詢完成，API 回傳', list.length, '筆')
        return list
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw createEInvoiceError(
            t('einvoice.error.timeout', {}, '查詢逾時，請稍後再試'),
            'einvoice_query_timeout',
          )
        }
        throw err
      } finally {
        clearTimeout(timeout)
      }
    },
  )
}

// ── Import invoices into ledger ───────────────────────────────────────────────

export async function importSelectedInvoices(invoices, { accountId, categoryId, ledgerId } = {}) {
  return traceEInvoiceImport(async () => {
    console.log('[EInvoice] 開始匯入，共', invoices.length, '筆待處理')
    const alreadyImported = await getImportedInvoiceNumbers()
    console.log('[EInvoice] 已匯入發票號碼共', alreadyImported.size, '筆（用於去重）')
    const shouldCreateTransactions = Boolean(ledgerId && accountId && categoryId)
    if (shouldCreateTransactions) {
      console.log('[EInvoice] 將同步建立支出交易 — 帳本:', ledgerId, '帳戶:', accountId, '分類:', categoryId)
    }
    const results = { imported: [], skipped: [], failed: [] }

    for (const invoice of invoices) {
      if (alreadyImported.has(invoice.invoiceNumber)) {
        console.log('[EInvoice] 跳過重複發票:', invoice.invoiceNumber)
        results.skipped.push(invoice)
        continue
      }
      try {
        let transactionId = null
        if (shouldCreateTransactions) {
          transactionId = await createExpense(ledgerId, {
            accountId,
            categoryId,
            amountMinor: Math.round(Number(invoice.amount) * 100),
            occurredAt: new Date(invoice.invoiceDate).toISOString(),
            note: invoice.merchantName ?? '',
            tagsJson: buildCarrierTagsJson(invoice.carrierName),
            originType: 'einvoice',
          })
          console.log('[EInvoice] 已建立支出交易:', transactionId, '發票:', invoice.invoiceNumber)
        }
        await insertInvoiceImport({
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          invoiceDate: invoice.invoiceDate,
          merchantName: invoice.merchantName,
          carrierName: invoice.carrierName,
          transactionId,
        })
        console.log('[EInvoice] 寫入成功:', invoice.invoiceNumber, '金額:', invoice.amount)
        results.imported.push(invoice)
      } catch (err) {
        console.error('[EInvoice] 單筆發票寫入失敗:', invoice.invoiceNumber, err)
        results.failed.push(invoice)
      }
    }

    console.log('[EInvoice] 匯入結束 — 成功:', results.imported.length, '略過:', results.skipped.length, '失敗:', results.failed.length)
    return results
  })
}
