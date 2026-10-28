import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildFifoRepaymentAllocations } from '../src/core/utils/credit-card-apply.js'

const root = resolve(import.meta.dirname, '..')

test('buildFifoRepaymentAllocations applies FIFO by remaining', () => {
  const unpaid = [
    { id: 's1', remaining_minor: 3000, period_start_inclusive: '2026-01-01' },
    { id: 's2', remaining_minor: 5000, period_start_inclusive: '2026-02-01' },
  ]
  const allocs = buildFifoRepaymentAllocations(4500, unpaid)
  assert.deepEqual(
    allocs.map((a) => ({ statementId: a.statementId, amountMinor: a.amountMinor })),
    [
      { statementId: 's1', amountMinor: 3000 },
      { statementId: 's2', amountMinor: 1500 },
    ],
  )
})

test('credit enhancement wiring: routes, pages, delete control', () => {
  const router = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
  assert.match(router, /credit-statement-detail/)
  assert.match(router, /settings-credit-due-reminder/)

  const page = readFileSync(resolve(root, 'src/ui/views/credit-cards/CreditCardsPage.vue'), 'utf8')
  assert.match(page, /credit-delete-open/)
  assert.match(page, /credit-statement-row/)
  assert.match(page, /credit-repay-preview/)

  const detail = readFileSync(resolve(root, 'src/ui/views/credit-cards/CreditStatementDetailPage.vue'), 'utf8')
  assert.match(detail, /credit-statement-closed-lock/)

  const about = readFileSync(resolve(root, 'src/ui/views/TransactionAboutPage.vue'), 'utf8')
  assert.match(about, /tx-credit-statement-link/)
})
