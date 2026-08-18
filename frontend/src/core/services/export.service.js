import { query } from '@/core/db/sqlite'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import {
  getAccountBookBalanceMinor,
  nextRunningBalanceMinor,
} from '@/core/domain/balance/balance-query.js'
import {
  refundDeductedMinorSql,
  refundRelationExistsSql,
} from '@/core/domain/refund-match-sql.js'

const FileOpener = registerPlugin('FileOpener')
const EXPORT_ROOT_DIR = 'StrawMoneyBook'

const LEDGER_TABLES = [
  'account_groups',
  'accounts',
  'category_groups',
  'categories',
  'transactions',
  'wear_applied',
  'transaction_attachments',
  'counterparties',
  'loans',
  'loan_payments',
  'reimbursement_advances',
  'reimbursement_advance_usages',
  'reimbursements',
  'reimbursement_items',
  'budget_save_settlements',
  'budgets',
  'budget_containers',
  'budget_items',
  'savings_jars',
  'securities',
  'security_transactions',
  'credit_statements',
  'credit_repayments',
  'credit_repayment_allocations',
  'transaction_postings',
  'bank_connections',
  'bank_accounts',
  'bank_transactions',
  'bank_sync_rules',
  'app_settings',
  'deleted_log',
]
const APP_SETTING_SECRET_KEY_RE = /(password|token|secret|authorization|client[_-]?key)/i
const APP_SETTING_SECURE_ONLY_KEY_RE = /^(?:bank_sync\.credentials\.[^.]+|backup\.webdav\.credentials)$/i
const ADDON_NOTE_PREFIX = '【附加項目】'

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function toXmlValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function rowsToCsv(rows, explicitHeaders = null) {
  const headers = Array.isArray(explicitHeaders) && explicitHeaders.length ? explicitHeaders : Object.keys(rows[0] ?? {})
  if (!headers.length) return ''
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((header) => toCsvValue(row[header])).join(','))
  }

  return lines.join('\r\n')
}

function rowsToSpreadsheetXml(sheetName, headers, rows) {
  const headerRow = headers
    .map((header) => `<Cell><Data ss:Type="String">${toXmlValue(header)}</Data></Cell>`)
    .join('')

  const bodyRows = rows
    .map((row) => {
      const cells = headers
        .map((header) => `<Cell><Data ss:Type="String">${toXmlValue(row[header] ?? '')}</Data></Cell>`)
        .join('')
      return `<Row>${cells}</Row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="${toXmlValue(sheetName)}">
    <Table>
      <Row>${headerRow}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`
}

function redactSettingSecrets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSettingSecrets(item))
  }
  if (!value || typeof value !== 'object') return value
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    output[key] = APP_SETTING_SECRET_KEY_RE.test(key) ? '' : redactSettingSecrets(child)
  }
  return output
}

function sanitizeAppSettingRow(row) {
  if (!row || typeof row !== 'object') return row
  const settingKey = String(row.key ?? '').trim()
  if (APP_SETTING_SECURE_ONLY_KEY_RE.test(settingKey)) {
    return null
  }
  try {
    const parsed = JSON.parse(String(row.value_json ?? 'null'))
    if (!parsed || typeof parsed !== 'object') return row
    if (settingKey === 'backup.webdav') {
      return {
        ...row,
        value_json: JSON.stringify({
          ...redactSettingSecrets(parsed),
          connected: false,
          autoEnabled: false,
          dataChangeAutoEnabled: false,
          password: '',
          lastError: '',
        }),
      }
    }
    return {
      ...row,
      value_json: JSON.stringify(redactSettingSecrets(parsed)),
    }
  } catch {
    return row
  }
}

function extractAddonSummaryFromNote(note) {
  const line = String(note ?? '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(ADDON_NOTE_PREFIX))
  if (!line) return ''
  return line.slice(ADDON_NOTE_PREFIX.length).trim()
}

function stripAddonSummaryFromNote(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(ADDON_NOTE_PREFIX))
    .join('\n')
}

function monthRangeUtc(monthKey) {
  const [year, month] = String(monthKey ?? '').split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, 1, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

function yearRangeUtc(yearKey) {
  const year = Number(yearKey)
  const start = new Date(year, 0, 1, 0, 0, 0)
  const end = new Date(year + 1, 0, 1, 0, 0, 0)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

function dayRangeUtc(dayKey) {
  const [year, month, day] = String(dayKey ?? '').split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

function customRangeUtc(startDate, endDate) {
  const [startY, startM, startD] = String(startDate ?? '').split('-').map((part) => Number(part))
  const [endY, endM, endD] = String(endDate ?? '').split('-').map((part) => Number(part))
  const start = new Date(startY, startM - 1, startD, 0, 0, 0)
  const end = new Date(endY, endM - 1, endD + 1, 0, 0, 0)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

export function timestampForFilename(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hour}${minute}${second}`
}

function sanitizeFilenameSegment(value, fallback = 'ledger') {
  const normalized = String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return fallback
  const maxLength = 40
  return Array.from(normalized).slice(0, maxLength).join('')
}

function rangeByMode(mode, options = {}) {
  if (mode === 'year') return yearRangeUtc(options.yearKey)
  if (mode === 'month') return monthRangeUtc(options.monthKey)
  if (mode === 'day') return dayRangeUtc(options.dayKey)
  if (mode === 'custom') return customRangeUtc(options.startDate, options.endDate)
  return { startUtc: null, endUtc: null }
}

export const EXCEL_HEADERS = [
  '類型',
  '記帳時間',
  '交易帳戶',
  '交易帳本',
  '貨幣符號',
  '交易金額',
  '當期帳戶餘額',
  '一級分類',
  '二級分類',
  '交易標籤',
  '備註',
  '附加項目',
  '退款&轉銷',
  '收回',
  '歸還',
  '匯率',
]

export const CSV_HEADERS = EXCEL_HEADERS.filter((header) => header !== '交易標籤')

function splitCategoryPath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return []
  return raw
    .split(/\s*(?:-->|->|→|＞)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeCategoryLevels(groupName, categoryName) {
  const groupParts = splitCategoryPath(groupName)
  const categoryParts = splitCategoryPath(categoryName)

  const primary = groupParts[0] || categoryParts[0] || ''
  let secondary = ''

  if (categoryParts.length > 1) {
    secondary = categoryParts.slice(1).join(' / ')
  } else if (categoryParts.length === 1) {
    secondary = categoryParts[0]
  } else if (groupParts.length > 1) {
    secondary = groupParts.slice(1).join(' / ')
  }

  return { primary, secondary }
}

async function rowsFromLedgerTable(ledgerId, tableName) {
  const result = await query(`SELECT * FROM ${tableName} WHERE ledger_id = ?;`, [ledgerId])
  const rows = result?.values ?? []
  if (tableName !== 'app_settings') return rows
  return rows
    .map((row) => sanitizeAppSettingRow(row))
    .filter(Boolean)
}

async function getSchemaVersion() {
  const schemaResult = await query('SELECT MAX(version) AS version FROM schema_migrations;')
  return Number(schemaResult?.values?.[0]?.version ?? 0)
}

async function loadAccountBalanceBeforeMap(ledgerId, startUtc = null) {
  const withRangeStart = Boolean(startUtc)
  const sql = withRangeStart
    ? `SELECT
         a.id AS account_id,
         a.opening_balance_minor + COALESCE(SUM(t.amount_minor), 0) AS balance_minor
       FROM accounts a
       LEFT JOIN transactions t
         ON t.ledger_id = a.ledger_id
        AND t.account_id = a.id
        AND t.deleted_at IS NULL
        AND t.occurred_at < ?
       WHERE a.ledger_id = ?
       GROUP BY a.id, a.opening_balance_minor;`
    : `SELECT
         a.id AS account_id,
         a.opening_balance_minor AS balance_minor
       FROM accounts a
       WHERE a.ledger_id = ?
       GROUP BY a.id, a.opening_balance_minor;`

  const result = withRangeStart ? await query(sql, [startUtc, ledgerId]) : await query(sql, [ledgerId])
  const rows = result?.values ?? []
  const map = new Map()
  for (const row of rows) {
    map.set(String(row.account_id), getAccountBookBalanceMinor(row.balance_minor))
  }
  return map
}

export async function exportLedgerJson(ledgerId) {
  const payload = {
    schema_version: 0,
    exported_at: new Date().toISOString(),
    ledger_id: ledgerId,
    tables: {},
  }

  payload.schema_version = await getSchemaVersion()

  const ledgerResult = await query('SELECT * FROM ledgers WHERE id = ?;', [ledgerId])
  payload.tables.ledgers = ledgerResult?.values ?? []

  for (const table of LEDGER_TABLES) {
    payload.tables[table] = await rowsFromLedgerTable(ledgerId, table)
  }

  return payload
}

export async function exportAllLedgersJson() {
  const payload = {
    schema_version: await getSchemaVersion(),
    exported_at: new Date().toISOString(),
    backup_scope: 'all_ledgers',
    ledgers: [],
  }

  const ledgerResult = await query(
    'SELECT * FROM ledgers WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC, id ASC;',
  )
  const ledgers = ledgerResult?.values ?? []

  for (const ledgerRow of ledgers) {
    const ledgerId = ledgerRow?.id
    if (!ledgerId) continue

    const ledgerPayload = {
      schema_version: payload.schema_version,
      exported_at: payload.exported_at,
      ledger_id: ledgerId,
      tables: {
        ledgers: [ledgerRow],
      },
    }

    for (const table of LEDGER_TABLES) {
      ledgerPayload.tables[table] = await rowsFromLedgerTable(ledgerId, table)
    }

    payload.ledgers.push(ledgerPayload)
  }

  return payload
}

export async function exportTransactionsCsv(ledgerId) {
  const result = await query(
    `SELECT *
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
     ORDER BY occurred_at DESC, created_at DESC;`,
    [ledgerId],
  )
  const rows = (result?.values ?? []).map((row) => ({
    ...row,
    note_without_addon: stripAddonSummaryFromNote(row.note),
    addon_items: extractAddonSummaryFromNote(row.note),
  }))
  const headers = rows.length
    ? Object.keys(rows[0])
    : [
        'ledger_id',
        'id',
        'type',
        'transfer_group_id',
        'account_id',
        'peer_account_id',
        'category_id',
        'amount_minor',
        'occurred_at',
        'note',
        'location',
        'tags_json',
        'origin_type',
        'external_ref_id',
        'idempotency_key',
        'is_reimbursable',
        'reimbursement_state',
        'reimbursed_at',
        'note_without_addon',
        'addon_items',
        'created_at',
        'updated_at',
        'deleted_at',
      ]
  return rowsToCsv(rows, headers)
}

export async function exportAccountsCsv(ledgerId) {
  const rows = await rowsFromLedgerTable(ledgerId, 'accounts')
  return rowsToCsv(rows)
}

export async function exportCategoriesCsv(ledgerId) {
  const rows = await rowsFromLedgerTable(ledgerId, 'categories')
  return rowsToCsv(rows)
}

function exportTypeLabel(type) {
  if (type === 'expense') return '支出'
  if (type === 'income') return '收入'
  if (type === 'transfer') return '轉帳'
  return '調整'
}

function formatTagsForExport(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).join('、')
  }
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? '').trim()).filter(Boolean).join('、')
    }
  } catch {
    // fall through
  }
  return raw
}

function buildLedgerTransactionExportRows(sourceRows, accountBalanceMap) {
  const csvRows = []
  const excelRows = []

  for (const row of sourceRows) {
    const amountMajor = Number(row.amount_minor ?? 0) / 100
    const accountId = String(row.account_id ?? '')
    const nextBalanceMinor = nextRunningBalanceMinor(accountBalanceMap.get(accountId), row.amount_minor)
    accountBalanceMap.set(accountId, nextBalanceMinor)
    const accountBalanceMajor = nextBalanceMinor / 100
    const categories = normalizeCategoryLevels(row.category_group_name, row.category_name)
    const addonSummary = extractAddonSummaryFromNote(row.note)
    const baseRow = {
      類型: exportTypeLabel(row.type),
      記帳時間: row.occurred_at ?? '',
      交易帳戶: row.account_name ?? '',
      交易帳本: row.ledger_name ?? '',
      貨幣符號: row.currency_code ?? 'TWD',
      交易金額: String(amountMajor),
      當期帳戶餘額: String(accountBalanceMajor),
      一級分類: categories.primary,
      二級分類: categories.secondary,
      備註: stripAddonSummaryFromNote(row.note),
      附加項目: addonSummary,
      '退款&轉銷': '',
      收回: '',
      歸還: '',
      匯率: '1',
    }

    csvRows.push(baseRow)
    excelRows.push({
      ...baseRow,
      交易標籤: formatTagsForExport(row.tags_json),
    })
  }

  return { csvRows, excelRows }
}

export async function getLedgerTransactionsExportData(ledgerId, options = {}) {
  const mode = ['all', 'year', 'month', 'day', 'custom'].includes(options.mode) ? options.mode : 'all'
  const { startUtc, endUtc } = rangeByMode(mode, options)
  const accountBalanceMap = await loadAccountBalanceBeforeMap(ledgerId, startUtc)

  const values = [ledgerId]
  let rangeSql = ''
  if (startUtc && endUtc) {
    rangeSql = ' AND t.occurred_at >= ? AND t.occurred_at < ?'
    values.push(startUtc, endUtc)
  }

  const result = await query(
    `SELECT
       t.type,
       t.account_id,
       t.category_id,
       t.include_in_analysis,
       CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
       ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
       t.occurred_at,
       t.note,
       t.tags_json,
       t.origin_type,
       t.amount_minor,
       a.name AS account_name,
       a.icon AS account_icon,
       a.currency_code,
       l.name AS ledger_name,
       cg.name AS category_group_name,
       c.name AS category_name,
       c.icon AS category_icon
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN ledgers l
       ON l.id = t.ledger_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     LEFT JOIN category_groups cg
       ON cg.ledger_id = c.ledger_id
      AND cg.id = c.group_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
       ${rangeSql}
     ORDER BY t.occurred_at ASC, t.created_at ASC;`,
    values,
  )

  const sourceRows = result?.values ?? []
  const { csvRows, excelRows } = buildLedgerTransactionExportRows(sourceRows, accountBalanceMap)
  const ledgerName = csvRows[0]?.交易帳本 || sourceRows[0]?.ledger_name || 'ledger'

  return {
    mode,
    ledgerName,
    rowCount: csvRows.length,
    csvRows,
    excelRows,
    records: sourceRows,
  }
}

export async function exportLedgerTransactionsExcel(ledgerId, options = {}) {
  const report = await getLedgerTransactionsExportData(ledgerId, options)
  const safeLedgerName = sanitizeFilenameSegment(report.ledgerName)
  const filename = `${safeLedgerName}_transactions_${report.mode}_${timestampForFilename()}.xml`
  const xmlText = rowsToSpreadsheetXml('Transactions', EXCEL_HEADERS, report.excelRows)
  return { filename, xmlText, rowCount: report.rowCount }
}

export async function exportLedgerTransactionsCsv(ledgerId, options = {}) {
  const report = await getLedgerTransactionsExportData(ledgerId, options)
  const safeLedgerName = sanitizeFilenameSegment(report.ledgerName)
  const filename = `${safeLedgerName}_transactions_${report.mode}_${timestampForFilename()}.csv`
  const csvText = rowsToCsv(report.csvRows, CSV_HEADERS)
  return { filename, csvText, rowCount: report.rowCount }
}

function formatMinorForCsv(value) {
  const amountMajor = Number(value ?? 0) / 100
  if (!Number.isFinite(amountMajor)) return '0'
  return amountMajor
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')
}

function resolveLoanStatusLabel(status) {
  const normalized = String(status ?? '').trim()
  const labels = {
    active: '進行中',
    partial: '部分完成',
    settled: '已結清',
    void: '完成',
  }
  return labels[normalized] ?? normalized
}

function resolveLoanDirectionLabel(direction) {
  return direction === 'borrow' ? '借入' : '借出'
}

const LOAN_CSV_HEADERS = [
  '狀態',
  '借貸方向',
  '對象名稱',
  '開始日期',
  '到期日',
  '建立入帳帳戶',
  '本金',
  '預設利息',
  '已收 / 已還',
  '剩餘',
  '備註',
]

function buildLoanCsvRows(loans = []) {
  return (loans ?? []).map((loan) => ({
    狀態: resolveLoanStatusLabel(loan?.status),
    借貸方向: resolveLoanDirectionLabel(loan?.direction),
    對象名稱: String(loan?.counterparty_name ?? '').trim() || '未命名對象',
    開始日期: String(loan?.start_date ?? loan?.setup_occurred_at ?? '').trim(),
    到期日: String(loan?.due_date ?? '').trim(),
    建立入帳帳戶: String(loan?.setup_account_name ?? '').trim(),
    本金: formatMinorForCsv(loan?.principal_minor),
    預設利息: formatMinorForCsv(loan?.preset_interest_minor),
    '已收 / 已還': formatMinorForCsv(loan?.paid_minor),
    剩餘: formatMinorForCsv(loan?.remaining_minor),
    備註: String(loan?.note ?? '').trim(),
  }))
}

export function exportLoanItemsCsv(loans, options = {}) {
  const safeLedgerName = sanitizeFilenameSegment(options.ledgerName ?? 'loans')
  const safeScopeName = sanitizeFilenameSegment(options.scopeName ?? '')
  const normalizedTab = options.tab === 'borrow' ? 'borrow' : 'lend'
  const normalizedScope = options.showFinished ? 'finished' : 'active'
  const timestamp = timestampForFilename(options.now instanceof Date ? options.now : new Date())
  const rows = buildLoanCsvRows(loans)
  const scopeSegment = safeScopeName ? `_${safeScopeName}` : ''
  return {
    filename: `${safeLedgerName}_loans${scopeSegment}_${normalizedTab}_${normalizedScope}_${timestamp}.csv`,
    csvText: rowsToCsv(rows, LOAN_CSV_HEADERS),
    rowCount: rows.length,
  }
}

export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(filename, blob)
}

export function downloadCsvFile(filename, csvText) {
  const blob = new Blob([`\ufeff${csvText}`], { type: 'text/csv;charset=utf-8' })
  downloadBlob(filename, blob)
}

export function downloadExcelFile(filename, xmlText) {
  const blob = new Blob([`\ufeff${xmlText}`], { type: 'application/xml;charset=utf-8' })
  downloadBlob(filename, blob)
}

export function createExcelBlobUrl(xmlText) {
  const blob = new Blob([`\ufeff${xmlText}`], { type: 'application/xml;charset=utf-8' })
  return URL.createObjectURL(blob)
}

export function createCsvBlobUrl(csvText) {
  const blob = new Blob([`\ufeff${csvText}`], { type: 'text/csv;charset=utf-8' })
  return URL.createObjectURL(blob)
}

export function createHtmlBlobUrl(htmlText) {
  const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' })
  return URL.createObjectURL(blob)
}

export function createPdfBlobUrl(pdfData) {
  const blob = pdfData instanceof Blob ? pdfData : new Blob([pdfData], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

export function revokeBlobUrl(url) {
  if (!url) return
  URL.revokeObjectURL(url)
}

export function triggerDownloadFromUrl(url, filename) {
  if (!url) return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function openFileUrl(url) {
  const target = String(url ?? '').trim()
  if (!target || typeof window === 'undefined' || typeof document === 'undefined') return false
  const isPreviewBlobUrl = target.startsWith('blob:') || target.startsWith('data:')
  const isNativeDeviceFile = /^file:\/\//i.test(target) || /^content:\/\//i.test(target) || target.startsWith('/')

  if (Capacitor.isNativePlatform()) {
    if (isPreviewBlobUrl) {
      return false
    }
    if (isNativeDeviceFile) {
      void FileOpener.openFile({ uri: target }).catch((error) => {
        console.warn('[file-opener] failed to open exported file', error)
      })
      return true
    }
    try {
      // Capacitor local file URLs are usually only actionable via in-place navigation.
      window.location.assign(target)
      return true
    } catch {
      // Fall through to browser-style fallbacks.
    }
  }

  const tryAnchorOpen = () => {
    const anchor = document.createElement('a')
    anchor.href = target
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return true
  }

  try {
    const opened = window.open(target, '_blank', 'noopener,noreferrer')
    if (opened) return true
  } catch {
    // Fall through to anchor and direct navigation fallbacks.
  }

  try {
    return tryAnchorOpen()
  } catch {
    try {
      window.location.assign(target)
      return true
    } catch {
      return false
    }
  }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  triggerDownloadFromUrl(url, filename)
  URL.revokeObjectURL(url)
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function bytesToBase64(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array
    ? bytesLike
    : bytesLike instanceof ArrayBuffer
      ? new Uint8Array(bytesLike)
      : new Uint8Array(bytesLike ?? [])
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function writeBase64FileToDevice(filename, dataBase64, options = {}) {
  if (!Capacitor.isNativePlatform()) {
    return { saved: false, reason: 'not-native' }
  }

  const safeFilename = sanitizeDeviceFilename(filename)
  const category = sanitizeDeviceDirectorySegment(options.category, 'exports')
  const relativePath = `${EXPORT_ROOT_DIR}/${category}/${safeFilename}`
  const documentLocation = `Documents/${relativePath}`
  const candidates = [
    { directory: Directory.Documents, path: relativePath, location: documentLocation },
    { directory: Directory.ExternalStorage, path: documentLocation, location: documentLocation },
  ].filter((item) => Boolean(item.directory))

  let lastError = null

  for (const candidate of candidates) {
    try {
      const result = await Filesystem.writeFile({
        path: candidate.path,
        data: dataBase64,
        directory: candidate.directory,
        recursive: true,
      })
      return {
        saved: true,
        uri: result?.uri ?? '',
        openUrl: result?.uri ? Capacitor.convertFileSrc(result.uri) : '',
        filename: safeFilename,
        location: candidate.location,
      }
    } catch (error) {
      lastError = error
    }
  }

  return {
    saved: false,
    reason: lastError?.message ?? 'write-failed',
  }
}

function sanitizeDeviceFilename(filename) {
  const raw = String(filename ?? '').trim()
  const fallback = `export_${Date.now()}.csv`
  if (!raw) return fallback

  const withSafeExt = raw.includes('.') ? raw : `${raw}.csv`
  const normalized = withSafeExt
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const sliced = normalized.slice(0, 80)
  if (!sliced) return fallback
  return sliced
}

function sanitizeDeviceDirectorySegment(value, fallback = 'exports') {
  const normalized = String(value ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return normalized || fallback
}

export async function saveJsonFileToDevice(filename, data, options = {}) {
  const jsonText = JSON.stringify(data, null, 2)
  const dataBase64 = utf8ToBase64(jsonText)
  return writeBase64FileToDevice(filename, dataBase64, options)
}

export async function saveExcelFileToDevice(filename, xmlText, options = {}) {
  const dataBase64 = utf8ToBase64(`\ufeff${xmlText}`)
  return writeBase64FileToDevice(filename, dataBase64, options)
}

export async function saveCsvFileToDevice(filename, csvText, options = {}) {
  const dataBase64 = utf8ToBase64(`\ufeff${csvText}`)
  return writeBase64FileToDevice(filename, dataBase64, options)
}

export async function savePdfFileToDevice(filename, pdfData, options = {}) {
  const pdfBytes = pdfData instanceof Blob ? await pdfData.arrayBuffer() : pdfData
  const dataBase64 = bytesToBase64(pdfBytes)
  return writeBase64FileToDevice(filename, dataBase64, options)
}
