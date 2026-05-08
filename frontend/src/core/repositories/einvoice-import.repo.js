import { query, run } from '@/core/db/sqlite'

function nowMs() {
  return Date.now()
}

// ── Credentials ──────────────────────────────────────────────────────────────

function normalizeCredentialRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: Number(row.id),
    platform: String(row.platform ?? 'einvoice'),
    encryptedAccount: String(row.encrypted_account ?? ''),
    encryptedPassword: String(row.encrypted_password ?? ''),
    iv: String(row.iv ?? ''),
    passwordIv: String(row.password_iv ?? row.iv ?? ''),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

export async function getEInvoiceCredential(platform = 'einvoice') {
  const result = await query(
    'SELECT * FROM einvoice_credentials WHERE platform = ? LIMIT 1;',
    [platform],
  )
  const row = result?.values?.[0]
  return row ? normalizeCredentialRow(row) : null
}

export async function upsertEInvoiceCredential({ platform = 'einvoice', encryptedAccount, encryptedPassword, iv, passwordIv = iv }) {
  const existing = await getEInvoiceCredential(platform)
  const now = nowMs()
  if (existing) {
    await run(
      `UPDATE einvoice_credentials
       SET encrypted_account = ?, encrypted_password = ?, iv = ?, password_iv = ?, updated_at = ?
       WHERE platform = ?;`,
      [encryptedAccount, encryptedPassword, iv, passwordIv, now, platform],
    )
  } else {
    await run(
      `INSERT INTO einvoice_credentials (platform, encrypted_account, encrypted_password, iv, password_iv, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [platform, encryptedAccount, encryptedPassword, iv, passwordIv, now, now],
    )
  }
  return getEInvoiceCredential(platform)
}

export async function deleteEInvoiceCredential(platform = 'einvoice') {
  await run('DELETE FROM einvoice_credentials WHERE platform = ?;', [platform])
}

// ── Invoice Imports ───────────────────────────────────────────────────────────

function normalizeInvoiceRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: Number(row.id),
    invoiceNumber: String(row.invoice_number ?? ''),
    amount: Number(row.amount ?? 0),
    invoiceDate: Number(row.invoice_date ?? 0),
    merchantName: row.merchant_name ? String(row.merchant_name) : null,
    carrierName: row.carrier_name ? String(row.carrier_name) : null,
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    importedAt: Number(row.imported_at ?? 0),
  }
}

export async function getImportedInvoiceNumbers() {
  const result = await query('SELECT invoice_number FROM einvoice_invoice_imports;', [])
  return new Set((result?.values ?? []).map((r) => String(r.invoice_number)))
}

export async function insertInvoiceImport({ invoiceNumber, amount, invoiceDate, merchantName, carrierName, transactionId }) {
  await run(
    `INSERT OR IGNORE INTO einvoice_invoice_imports
       (invoice_number, amount, invoice_date, merchant_name, carrier_name, transaction_id, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [invoiceNumber, amount, invoiceDate, merchantName ?? null, carrierName ?? null, transactionId ?? null, nowMs()],
  )
}

export async function listRecentInvoiceImports(limitDays = 90) {
  const since = Date.now() - limitDays * 24 * 60 * 60 * 1000
  const result = await query(
    'SELECT * FROM einvoice_invoice_imports WHERE invoice_date >= ? ORDER BY invoice_date DESC;',
    [since],
  )
  return (result?.values ?? []).map(normalizeInvoiceRow)
}
