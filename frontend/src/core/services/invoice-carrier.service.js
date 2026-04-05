import * as invoiceCarrierRepo from '@/core/repositories/invoice-carrier.repo'
import * as transactionRepo from '@/core/repositories/transaction.repo'
import { createId, nowIso } from '@/core/utils/id'

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

/**
 * 同步電子發票載具資料
 * @param {string} connectionId - 連線 ID
 * @param {object} ledger - 活動帳本
 * @param {object} opts - 同步選項 { startDate, endDate, carrierCode }
 * @returns {Promise<object>} { invoices, newCount, syncStatus }
 */
export async function syncInvoiceCarrierConnection(connectionId, ledger, opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')
  if (!ledger?.id) throw new Error('ledger is required')

  try {
    // 取得現有連線
    const connection = await invoiceCarrierRepo.findInvoiceCarrierConnectionById(connectionId)
    if (!connection) throw new Error('Connection not found')

    // 呼叫後端 API 同步
    const syncResult = await fetch('/api/invoice/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: opts.session_id,
        connection_id: connectionId,
        start_date: opts.startDate,
        end_date: opts.endDate,
        carrier_code: opts.carrierCode,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    })

    if (!syncResult.invoices) {
      throw new Error('Invalid sync result: missing invoices')
    }

    // Upsert 發票到資料庫
    await invoiceCarrierRepo.upsertManyInvoiceCarrierInvoices(connectionId, syncResult.invoices)

    // 更新同步狀態
    const updated = await invoiceCarrierRepo.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      last_sync_status: 'ok',
      last_error: null,
    })

    return {
      invoices: syncResult.invoices,
      newCount: syncResult.invoices.length,
      syncStatus: 'ok',
      connection: updated,
    }
  } catch (error) {
    // 記錄同步失敗
    await invoiceCarrierRepo.updateInvoiceCarrierConnectionSyncStatus(connectionId, {
      last_sync_status: 'error',
      last_error: String(error?.message ?? error ?? 'Sync failed'),
    })

    throw error
  }
}

/**
 * 批量匯入電子發票為交易
 * @param {string} connectionId - 連線 ID
 * @param {string[]} invoiceIds - 欲匯入的發票 ID 陣列
 * @param {string} ledgerId - 帳本 ID
 * @param {string} targetAccountId - 目標帳戶 ID
 * @param {string} categoryId - 分類 ID（可選，預設為支出）
 * @returns {Promise<object[]>} 建立的交易陣列
 */
export async function importInvoicesAsTransactions(
  connectionId,
  invoiceIds,
  ledgerId,
  targetAccountId,
  categoryId = null,
) {
  if (!connectionId) throw new Error('connectionId is required')
  if (!Array.isArray(invoiceIds) || !invoiceIds.length) throw new Error('invoiceIds must be non-empty array')
  if (!ledgerId) throw new Error('ledgerId is required')
  if (!targetAccountId) throw new Error('targetAccountId is required')

  const createdTransactions = []

  for (const invoiceId of invoiceIds) {
    const invoice = await invoiceCarrierRepo.findInvoiceCarrierInvoiceById(invoiceId)
    if (!invoice) {
      console.warn(`Invoice ${invoiceId} not found`)
      continue
    }

    if (invoice.imported_transaction_id) {
      console.warn(`Invoice ${invoiceId} already imported as ${invoice.imported_transaction_id}`)
      continue
    }

    try {
      // 建立交易
      const transaction = await transactionRepo.addTransaction(ledgerId, {
        type: 'expense',
        account_id: targetAccountId,
        category_id: categoryId,
        amount_minor: invoice.amount,
        occurred_at: invoice.invoice_date ? new Date(`${invoice.invoice_date}T12:00:00Z`).toISOString() : nowIso(),
        note: `電子發票 ${invoice.invoice_number} - ${invoice.seller_name || ''}`,
        origin_type: 'invoice_import',
        include_in_budget: 1,
        include_in_analysis: 1,
      })

      // 標記發票已匯入
      await invoiceCarrierRepo.markInvoiceCarrierInvoiceImported(invoiceId, transaction.id)
      createdTransactions.push(transaction)
    } catch (error) {
      console.error(`Failed to import invoice ${invoiceId}:`, error)
      // 繼續處理其他發票，不中斷
    }
  }

  return createdTransactions
}

/**
 * 新增電子發票載具連線
 * @param {object} input - { mobilePhone, userLabel }
 * @returns {Promise<object>} 新連線
 */
export async function createInvoiceCarrierConnection(input) {
  const mobilePhone = normalizeText(input?.mobile_phone || input?.mobilePhone)
  if (!mobilePhone) throw new Error('mobilePhone is required')

  // 檢查是否已存在
  const existing = await invoiceCarrierRepo.findInvoiceCarrierConnectionByMobilePhone(mobilePhone)
  if (existing && existing.status === 'active') {
    throw new Error('Connection with this mobile phone already exists')
  }

  return invoiceCarrierRepo.addInvoiceCarrierConnection({
    mobile_phone: mobilePhone,
    user_label: normalizeText(input?.user_label || input?.userLabel) || mobilePhone,
  })
}

/**
 * 刪除電子發票載具連線（軟刪除）
 * @param {string} connectionId
 * @returns {Promise<void>}
 */
export async function deleteInvoiceCarrierConnection(connectionId) {
  if (!connectionId) throw new Error('connectionId is required')
  return invoiceCarrierRepo.deleteInvoiceCarrierConnection(connectionId)
}

/**
 * 列出所有活躍連線
 * @returns {Promise<object[]>} 連線陣列
 */
export async function listInvoiceCarrierConnections() {
  return invoiceCarrierRepo.listInvoiceCarrierConnections()
}

/**
 * 取得特定連線
 * @param {string} connectionId
 * @returns {Promise<object|null>} 連線物件或 null
 */
export async function getInvoiceCarrierConnection(connectionId) {
  if (!connectionId) return null
  return invoiceCarrierRepo.findInvoiceCarrierConnectionById(connectionId)
}

/**
 * 列出發票（帶分頁）
 * @param {string} connectionId
 * @param {object} opts - { offset, limit }
 * @returns {Promise<object[]>} 發票陣列
 */
export async function listInvoiceCarrierInvoices(connectionId, opts = {}) {
  if (!connectionId) throw new Error('connectionId is required')
  return invoiceCarrierRepo.listInvoiceCarrierInvoices(connectionId, opts)
}
