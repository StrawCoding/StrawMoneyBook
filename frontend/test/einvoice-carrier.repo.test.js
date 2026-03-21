import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('invoice carrier migration creates connection and invoice tables', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrations/020_invoice_carrier_sync.sql'), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS invoice_carrier_connections/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS invoice_carrier_invoices/)
  assert.match(sql, /provider_invoice_key TEXT NOT NULL/)
  assert.match(sql, /status IN \('active','reauth_required','disabled'\)/)
})

test('invoice carrier repository exposes connection and invoice operations', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/repositories/einvoice-carrier.repo.js'), 'utf8')
  assert.match(source, /export async function listInvoiceCarrierConnections/)
  assert.match(source, /export async function upsertInvoiceCarrierConnection/)
  assert.match(source, /export async function listInvoiceCarrierInvoices/)
  assert.match(source, /export async function upsertInvoiceCarrierInvoices/)
  assert.match(source, /export async function markInvoiceCarrierInvoicesViewed/)
})
