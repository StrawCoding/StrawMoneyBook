import { simpleHash } from './shared.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeHeader(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '')
}

function parseAmountMinor(text) {
  const source = normalizeText(text)
  if (!source) return 0
  const negative = source.includes('(') || source.startsWith('-')
  const numeric = source.replace(/[^0-9.]/g, '')
  if (!numeric) return 0
  const minor = Math.round(Number(numeric) * 100)
  if (!Number.isFinite(minor) || minor === 0) return 0
  return negative ? minor * -1 : minor
}

function parsePostedAt(text) {
  const match = normalizeText(text).match(/(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) return ''
  let year = Number(match[1])
  if (year < 1000) year += 1911
  const month = String(Number(match[2])).padStart(2, '0')
  const day = String(Number(match[3])).padStart(2, '0')
  const hour = String(Number(match[4] ?? 0)).padStart(2, '0')
  const minute = String(Number(match[5] ?? 0)).padStart(2, '0')
  const second = String(Number(match[6] ?? 0)).padStart(2, '0')
  const iso = new Date(`${String(year).padStart(4, '0')}-${month}-${day}T${hour}:${minute}:${second}+08:00`)
  return Number.isNaN(iso.getTime()) ? '' : iso.toISOString()
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function parseCsv(text) {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0]).map((header) => normalizeText(header))
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row = {}
    headers.forEach((header, index) => {
      row[header] = normalizeText(cols[index])
    })
    return row
  })
  return { headers, rows }
}

function detectColumn(headers, candidates = []) {
  const normalized = headers.map((header) => ({
    raw: header,
    key: normalizeHeader(header),
  }))
  for (const candidate of candidates) {
    const token = normalizeHeader(candidate)
    const match = normalized.find((item) => item.key.includes(token) || token.includes(item.key))
    if (match) return match.raw
  }
  return ''
}

export function detectBankStatementCsvFormat(csvText) {
  const { headers } = parseCsv(csvText)
  if (!headers.length) return ''
  const hasDate = Boolean(detectColumn(headers, ['交易日期', '日期', 'date', 'posted']))
  const hasSummary = Boolean(detectColumn(headers, ['摘要', '說明', 'description', 'memo']))
  const hasDebit = Boolean(detectColumn(headers, ['支出', '提出', '借方', 'debit']))
  const hasCredit = Boolean(detectColumn(headers, ['存入', '貸方', 'credit']))
  if (hasDate && hasSummary && (hasDebit || hasCredit)) {
    return 'first_bank_tw'
  }
  return ''
}

export function parseBankStatementCsv(csvText, options = {}) {
  const providerAccountId = normalizeText(options.providerAccountId)
  if (!providerAccountId) {
    throw new Error('providerAccountId is required for bank statement CSV import')
  }
  const format = detectBankStatementCsvFormat(csvText)
  if (!format) {
    throw new Error('unsupported bank statement csv format')
  }

  const { headers, rows } = parseCsv(csvText)
  const dateCol = detectColumn(headers, ['交易日期', '日期', 'date', 'posted'])
  const summaryCol = detectColumn(headers, ['摘要', '說明', 'description', 'memo'])
  const debitCol = detectColumn(headers, ['支出', '提出', '借方', 'debit'])
  const creditCol = detectColumn(headers, ['存入', '貸方', 'credit'])
  const balanceCol = detectColumn(headers, ['餘額', 'balance'])
  const typeCol = detectColumn(headers, ['交易類別', '類別', 'type'])
  const noteCol = detectColumn(headers, ['備註', 'note'])
  const statusCol = detectColumn(headers, ['狀態', 'status'])

  const transactions = []
  for (const row of rows) {
    const postedAtText = normalizeText(row[dateCol])
    const summary = normalizeText(row[summaryCol])
    const debitMinor = parseAmountMinor(row[debitCol])
    const creditMinor = parseAmountMinor(row[creditCol])
    const amountMinor = creditMinor || (debitMinor ? debitMinor * -1 : 0)
    if (!postedAtText || !amountMinor) continue

    const postedAt = parsePostedAt(postedAtText)
    const balanceMinor = parseAmountMinor(row[balanceCol])
    const transactionType = normalizeText(row[typeCol])
    const note = normalizeText(row[noteCol])
    const statusText = normalizeText(row[statusCol]) || '正常'
    const sourceText = `${providerAccountId}|${postedAtText}|${summary}|${amountMinor}|${balanceMinor}`
    const providerTransactionId = `fbcsv_${simpleHash(sourceText)}`

    transactions.push({
      providerTransactionId,
      providerAccountId,
      postedAt: postedAt || new Date().toISOString(),
      amountMinor,
      balanceMinor: balanceMinor || null,
      currency: 'TWD',
      transactionType: transactionType || null,
      note: note || null,
      summary: summary || null,
      description: summary || transactionType || note || 'Bank statement CSV transaction',
      merchant: note || '',
      status: /沖銷|reversed/i.test(statusText) ? 'reversed' : 'posted',
      rawJson: JSON.stringify({
        source: 'bank_statement_csv',
        format,
        row,
      }),
    })
  }

  return transactions
}
