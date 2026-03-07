import assert from 'node:assert/strict'

import {
  buildFirstBankCursor,
  parseFirstBankCursor,
  parseFirstBankTransactions,
  resolveFirstBankSyncStartDate,
  splitFirstBankDateRange,
} from '../api/bank/_first-bank-provider.js'

const cursor = buildFirstBankCursor({
  initialStartDate: '2026-02-07',
})

assert.deepEqual(parseFirstBankCursor(cursor), {
  initialStartDate: '2026-02-07',
})

assert.equal(
  resolveFirstBankSyncStartDate({
    cursor,
    lastSyncAt: '',
    lookbackDays: 7,
  }),
  '2026-02-07',
)

assert.equal(
  resolveFirstBankSyncStartDate({
    cursor,
    lastSyncAt: '2026-03-01T12:34:56+08:00',
    lookbackDays: 7,
  }),
  '2026-03-01',
)

assert.deepEqual(
  splitFirstBankDateRange('2026-01-01', '2026-02-15'),
  [
    {
      startDate: '2026-01-01',
      endDate: '2026-01-30',
      startDateBank: '2026/01/01',
      endDateBank: '2026/01/30',
    },
    {
      startDate: '2026-01-31',
      endDate: '2026-02-15',
      startDateBank: '2026/01/31',
      endDateBank: '2026/02/15',
    },
  ],
)

const fixtureHtml = `
  <html>
    <body>
      <table class="CnbTable">
        <tr>
          <td>交易日期</td>
          <td>摘要</td>
          <td>存入</td>
          <td>支出</td>
          <td>餘額</td>
        </tr>
        <tr>
          <td>2026/03/07</td>
          <td>薪資入帳</td>
          <td>50,000</td>
          <td></td>
          <td>80,000</td>
        </tr>
        <tr>
          <td>2026/03/06</td>
          <td>超商消費</td>
          <td></td>
          <td>120</td>
          <td>30,000</td>
        </tr>
      </table>
    </body>
  </html>
`

const parsed = parseFirstBankTransactions(fixtureHtml, {
  accountId: '29168214193',
  rangeStart: '2026/03/01',
  rangeEnd: '2026/03/07',
})

assert.equal(parsed.length, 2)
assert.equal(parsed[0].providerAccountId, '29168214193')
assert.equal(parsed[0].amountMinor, 5000000)
assert.equal(parsed[0].description, '薪資入帳')
assert.equal(parsed[1].amountMinor, -12000)
assert.equal(parsed[1].description, '超商消費')

console.log('First Bank provider fixture checks passed')
