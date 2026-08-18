import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bankTxnCalendarDayKey,
  isCrossSourceLikelyDuplicate,
  mergeBankTxnRawJson,
  readPossibleDuplicateOf,
} from '../src/core/domain/bank-transaction-identity.js'
import { rejectProductionServerless } from '../api/_production-guard.js'

test('bankTxnCalendarDayKey reads ISO date prefix and parses timestamps', () => {
  assert.equal(bankTxnCalendarDayKey('2026-08-18T09:00:00.000Z'), '2026-08-18')
  assert.equal(bankTxnCalendarDayKey('2026-08-18'), '2026-08-18')
  assert.equal(bankTxnCalendarDayKey(''), '')
})

test('cross-source duplicates match same account, day, amount, different provider ids', () => {
  const csv = {
    bankAccountId: 'acct-1',
    providerTransactionId: 'fbcsv_abc',
    postedAt: '2026-08-18T01:00:00.000Z',
    amountMinor: -120000,
  }
  const native = {
    bank_account_id: 'acct-1',
    provider_transaction_id: 'fbtxn_xyz',
    posted_at: '2026-08-18T08:00:00.000Z',
    amount_minor: -120000,
  }
  assert.equal(isCrossSourceLikelyDuplicate(csv, native), true)
  assert.equal(isCrossSourceLikelyDuplicate(csv, { ...native, provider_transaction_id: 'fbcsv_abc' }), false)
  assert.equal(isCrossSourceLikelyDuplicate(csv, { ...native, amount_minor: -1 }), false)
  assert.equal(isCrossSourceLikelyDuplicate(csv, { ...native, bank_account_id: 'acct-2' }), false)
})

test('raw_json merge records possible_duplicate_of without dropping original fields', () => {
  const merged = mergeBankTxnRawJson('{"source":"csv"}', { possible_duplicate_of: 'btx_1' })
  assert.equal(readPossibleDuplicateOf(merged), 'btx_1')
  assert.equal(JSON.parse(merged).source, 'csv')
  assert.equal(readPossibleDuplicateOf('not-json'), null)
})

test('rejectProductionServerless only 404s Vercel production and preview', () => {
  const original = process.env.VERCEL_ENV
  const responses = []
  function fakeRes() {
    return {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(name, value) { this.headers[name] = value },
      end(body) { this.body = String(body ?? '') },
    }
  }
  try {
    delete process.env.VERCEL_ENV
    const local = fakeRes()
    assert.equal(rejectProductionServerless(local), false)
    assert.equal(local.statusCode, 200)

    process.env.VERCEL_ENV = 'production'
    const prod = fakeRes()
    assert.equal(rejectProductionServerless(prod), true)
    assert.equal(prod.statusCode, 404)
    assert.match(prod.body, /api\.strawmb\.com/)

    process.env.VERCEL_ENV = 'preview'
    const preview = fakeRes()
    assert.equal(rejectProductionServerless(preview), true)
    assert.equal(preview.statusCode, 404)

    process.env.VERCEL_ENV = 'development'
    const dev = fakeRes()
    assert.equal(rejectProductionServerless(dev), false)
  } finally {
    if (original == null) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = original
    responses.length = 0
  }
})
