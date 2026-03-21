import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('invoice carrier migration creates connection and invoice tables', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrations/020_invoice_carrier_sync.sql'), 'utf8')
  const importSql = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrations/021_invoice_carrier_import.sql'), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS invoice_carrier_connections/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS invoice_carrier_invoices/)
  assert.match(sql, /provider_invoice_key TEXT NOT NULL/)
  assert.match(sql, /status IN \('active','reauth_required','disabled'\)/)
  assert.match(importSql, /ALTER TABLE invoice_carrier_connections ADD COLUMN mapped_account_id TEXT;/)
  assert.match(importSql, /ALTER TABLE invoice_carrier_invoices ADD COLUMN imported INTEGER NOT NULL DEFAULT 0/)
  assert.match(importSql, /ALTER TABLE invoice_carrier_invoices ADD COLUMN imported_txn_id TEXT;/)
})

test('invoice carrier repository exposes connection and invoice operations', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/repositories/einvoice-carrier.repo.js'), 'utf8')
  assert.match(source, /export async function listInvoiceCarrierConnections/)
  assert.match(source, /export async function upsertInvoiceCarrierConnection/)
  assert.match(source, /export async function listInvoiceCarrierInvoices/)
  assert.match(source, /export async function listInvoiceCarrierInvoicesByIds/)
  assert.match(source, /export async function upsertInvoiceCarrierInvoices/)
  assert.match(source, /export async function markInvoiceCarrierInvoicesViewed/)
  assert.match(source, /export async function markInvoiceCarrierInvoicesImported/)
  assert.match(source, /export async function findImportedLedgerTransactionBySourceRef/)
})
