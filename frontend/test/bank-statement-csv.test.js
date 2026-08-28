import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectBankStatementCsvFormat,
  parseBankStatementCsv,
} from '../src/services/bank-sync/bank-statement-csv.js'

const firstBankFixture = `交易日期,摘要,支出,存入,餘額
2026/03/07,薪資入帳,,50000,80000
2026/03/06,超商消費,120,,30000`

test('detectBankStatementCsvFormat recognizes TW debit/credit statement headers', () => {
  const format = detectBankStatementCsvFormat(firstBankFixture)
  assert.equal(format, 'tw_debit_credit_csv')
})

test('parseBankStatementCsv maps TW debit/credit rows into bank sync transaction shape', () => {
  const rows = parseBankStatementCsv(firstBankFixture, {
    provider: 'hua_nan_bank_tw',
    providerAccountId: '29168214193',
  })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].providerAccountId, '29168214193')
  assert.equal(rows[0].amountMinor, 5000000)
  assert.equal(rows[0].summary, '薪資入帳')
  assert.match(rows[0].providerTransactionId, /^fbcsv_/)
  assert.equal(rows[1].amountMinor, -12000)
  assert.equal(rows[1].description, '超商消費')
  assert.equal(rows[1].status, 'posted')
})

test('parseBankStatementCsv skips empty and invalid rows', () => {
  const csv = `交易日期,摘要,支出,存入,餘額
,空白列,,,
2026/03/05,轉帳,,1000,31000`

  const rows = parseBankStatementCsv(csv, { providerAccountId: '123' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].amountMinor, 100000)
})

test('parseBankStatementCsv rejects unknown csv shape', () => {
  assert.throws(
    () => parseBankStatementCsv('foo,bar\n1,2', { providerAccountId: '123' }),
    /unsupported bank statement csv/i,
  )
})
