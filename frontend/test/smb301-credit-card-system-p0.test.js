import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeDueOn,
  derivePaidMinorFromAllocations,
  isOverdue,
  isPostedInPeriod,
  normalizeCloseDay,
  parseLocalIso,
  resolvePeriodBoundsForPostedAt,
  shouldNotifyRepaymentReminder,
  toLocalIso,
} from '../src/core/utils/credit-period.js'

const root = resolve(import.meta.dirname, '..')

test('close-day boundary: D 00:00 / 12:00 / 23:59:59 stay in old period; D+1 00:00 opens new', () => {
  const closeDay = 15
  const cases = [
    ['2026-03-15T00:00:00.000', true],
    ['2026-03-15T12:00:00.000', true],
    ['2026-03-15T23:59:59.999', true],
    ['2026-03-16T00:00:00.000', false],
  ]
  for (const [iso, expectOld] of cases) {
    const bounds = resolvePeriodBoundsForPostedAt(iso, closeDay)
    const inOld = isPostedInPeriod(iso, bounds.periodStartInclusive, bounds.periodEndExclusive)
    assert.equal(inOld, true, iso)
    if (expectOld) {
      assert.ok(bounds.periodEndExclusive.startsWith('2026-03-16'), bounds.periodEndExclusive)
    } else {
      assert.ok(bounds.periodStartInclusive.startsWith('2026-03-16'), bounds.periodStartInclusive)
      assert.ok(bounds.periodEndExclusive.startsWith('2026-04-16'), bounds.periodEndExclusive)
    }
  }
})

test('short month and year rollover clamp close day', () => {
  // close day 31 in February 2026 (non-leap) → Feb 28; period ends Mar 1 00:00
  const feb = resolvePeriodBoundsForPostedAt('2026-02-28T12:00:00.000', 31)
  assert.ok(feb.periodEndExclusive.startsWith('2026-03-01'), feb.periodEndExclusive)
  assert.equal(isPostedInPeriod('2026-02-28T23:59:59.000', feb.periodStartInclusive, feb.periodEndExclusive), true)
  assert.equal(isPostedInPeriod('2026-03-01T00:00:00.000', feb.periodStartInclusive, feb.periodEndExclusive), false)

  const nye = resolvePeriodBoundsForPostedAt('2026-12-31T23:59:59.000', 31)
  assert.ok(nye.periodEndExclusive.startsWith('2027-01-01'), nye.periodEndExclusive)
  const jan = resolvePeriodBoundsForPostedAt('2027-01-01T00:00:00.000', 31)
  assert.ok(jan.periodStartInclusive.startsWith('2027-01-01'), jan.periodStartInclusive)
})

test('due_on exists; overdue ignores reminder day', () => {
  const dueOn = computeDueOn('2026-03-15', 10)
  assert.match(dueOn, /^2026-04-10$/)
  assert.equal(isOverdue({ dueOn, remainingMinor: 100, now: parseLocalIso('2026-04-11T00:00:00') }), true)
  assert.equal(isOverdue({ dueOn, remainingMinor: 100, now: parseLocalIso('2026-04-10T12:00:00') }), false)
  assert.equal(isOverdue({ dueOn, remainingMinor: 0, now: parseLocalIso('2026-04-20T00:00:00') }), false)

  // Reminder day 5 fires notify but must not affect overdue above
  assert.equal(shouldNotifyRepaymentReminder({
    dueOn,
    repaymentReminderDay: 5,
    remainingMinor: 100,
    now: parseLocalIso('2026-04-05T09:00:00'),
  }), true)
  assert.equal(isOverdue({ dueOn, remainingMinor: 100, now: parseLocalIso('2026-04-05T09:00:00') }), false)
})

test('paid_minor is derived from allocations only', () => {
  assert.equal(derivePaidMinorFromAllocations([
    { amount_minor: 1000 },
    { amountMinor: 250 },
  ]), 1250)
  assert.equal(derivePaidMinorFromAllocations([]), 0)
})

test('migration / wiring mentions hard-contract identifiers', () => {
  const mig = readFileSync(resolve(root, 'src/core/db/migrations/043_credit_card_system_p0.sql'), 'utf8')
  assert.match(mig, /credit_statements/)
  assert.match(mig, /credit_repayment_allocations/)
  assert.match(mig, /transaction_postings/)
  assert.match(mig, /payment_due_day/)
  assert.match(mig, /posted_at/)
  assert.match(mig, /closing_balance_minor/)

  const migrate = readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8')
  assert.match(migrate, /043_credit_card_system_p0/)
  assert.match(migrate, /credit_card_system_p0/)

  const service = readFileSync(resolve(root, 'src/core/services/credit.service.js'), 'utf8')
  assert.match(service, /createCreditPurchase/)
  assert.match(service, /createCreditRepayment/)
  assert.match(service, /CLOSED_POSTING_MUTATION_FORBIDDEN/)
  assert.match(service, /runCreditStatementRollovers/)
  assert.match(service, /credit-accrual/)
  assert.match(service, /validateRepaymentAllocationPlan/)
  assert.match(service, /computeActualCardDebtMinor/)
  assert.match(service, /buildCreditRefundAdjustmentPlan/)

  const txService = readFileSync(resolve(root, 'src/core/services/transaction.service.js'), 'utf8')
  assert.match(txService, /createCreditRefundAdjustment/)
  assert.match(txService, /chooseRefundFormalPath/)
  assert.match(txService, /assertTransactionMutableForCredit/)
  assert.match(txService, /assertUpdateManualCreditMutationAllowed/)
  assert.match(txService, /buildUpdateManualTransactionFields/)
  assert.match(txService, /findTransactionRecordById/)
  const updateManualFn = txService.match(
    /export async function updateManualTransaction[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.match(updateManualFn, /assertUpdateManualCreditMutationAllowed/)
  assert.match(updateManualFn, /findTransactionRecordById/)
  assert.match(updateManualFn, /buildUpdateManualTransactionFields/)
  assert.doesNotMatch(updateManualFn, /payload\.postedAt\s*\?\?\s*payload\.occurredAt/)

  const apply = readFileSync(resolve(root, 'src/core/utils/credit-card-apply.js'), 'utf8')
  assert.match(apply, /REPAYMENT_ALLOCATION_REQUIRED/)
  assert.match(apply, /ALLOCATION_CROSS_CARD_FORBIDDEN/)
  assert.match(apply, /ALLOCATION_EXCEEDS_REMAINING/)
  assert.match(apply, /shouldForbidClosedCreditMutation/)
  assert.match(apply, /diffCreditManualTransactionChanges/)
  assert.match(apply, /assertUpdateManualCreditMutationAllowed/)
  assert.match(apply, /buildUpdateManualTransactionFields/)
  assert.match(apply, /applyUpdateManualTransactionFields/)
  assert.match(apply, /computeActualCardDebtMinor/)
  assert.match(apply, /clampPostedAtIntoOpenPeriod/)
  assert.match(apply, /chooseRefundFormalPath/)

  const txRepo = readFileSync(resolve(root, 'src/core/repositories/transaction.repo.js'), 'utf8')
  assert.match(txRepo, /findTransactionRecordById[\s\S]*posted_at/)
  const updateByIdFn = txRepo.match(
    /export async function updateTransactionById[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.doesNotMatch(updateByIdFn, /posted_at\s*=/)

  const merge = readFileSync(resolve(root, 'src/ui/services/shared-ledger/snapshot-merge.js'), 'utf8')
  assert.match(merge, /credit_card_bundle/)

  const page = readFileSync(resolve(root, 'src/ui/views/credit-cards/CreditCardsPage.vue'), 'utf8')
  assert.match(page, /test-id="credit-cards-page"/)
  assert.match(page, /credit-repay-submit/)

  const features = readFileSync(resolve(root, 'src/ui/views/FeatureListPage.vue'), 'utf8')
  assert.match(features, /feature-link-credit-cards/)

  const router = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
  assert.match(router, /path: '\/credit-cards'/)

  assert.equal(normalizeCloseDay(99, 25), 25)
  assert.equal(toLocalIso(parseLocalIso('2026-08-13T10:11:12.003')).startsWith('2026-08-13T10:11:12'), true)

  const utcMidnight = parseLocalIso('2026-08-18T16:00:00.000Z', 'Asia/Taipei')
  assert.equal(toLocalIso(utcMidnight).startsWith('2026-08-19T00:00:00'), true)
  const stillOpen = resolvePeriodBoundsForPostedAt('2026-08-25T15:59:59.000Z', 25, { timeZone: 'Asia/Taipei' })
  assert.equal(stillOpen.periodEndExclusive.startsWith('2026-08-26'), true)
  const nextPeriod = resolvePeriodBoundsForPostedAt('2026-08-25T16:00:00.000Z', 25, { timeZone: 'Asia/Taipei' })
  assert.equal(nextPeriod.periodStartInclusive.startsWith('2026-08-26'), true)
  assert.equal(nextPeriod.periodEndExclusive.startsWith('2026-09-26'), true)
})

test('closed credit gate helpers: allow pure occurred_at; forbid postedAt / slim row', async () => {
  const {
    assertUpdateManualCreditMutationAllowed,
    buildUpdateManualTransactionFields,
    diffCreditManualTransactionChanges,
    shouldForbidClosedCreditMutation,
  } = await import('../src/core/utils/credit-card-apply.js')

  const current = {
    type: 'expense',
    account_id: 'card1',
    category_id: 'c1',
    amount_minor: -1200,
    occurred_at: '2026-03-10T12:00:00.000Z',
    posted_at: '2026-03-12T00:00:00.000Z',
    note: '咖啡',
    origin_type: 'manual',
    is_reimbursable: 0,
    include_in_budget: 1,
    include_in_analysis: 1,
  }
  const payload = {
    type: 'expense',
    accountId: 'card1',
    categoryId: 'c1',
    amountMinor: 1200,
    occurredAt: '2026-03-09T08:00:00.000Z',
    note: '咖啡',
    isReimbursable: false,
    includeInBudget: true,
    includeInAnalysis: true,
    // postedAt omitted — TransactionEditPage / HomeTransactionEditSheet
  }

  const gate = assertUpdateManualCreditMutationAllowed({
    currentTx: current,
    payload,
    status: 'closed',
  })
  assert.equal(gate.allowed, true)
  assert.equal(gate.changes.occurredAt, true)
  assert.equal(gate.changes.postedAt, false)

  const fields = buildUpdateManualTransactionFields(current, payload)
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'postedAt'), false)
  assert.equal(fields.occurredAt, '2026-03-09T08:00:00.000Z')
  assert.equal(fields.amountMinor, -1200)

  assert.throws(
    () => assertUpdateManualCreditMutationAllowed({
      currentTx: current,
      payload: { ...payload, postedAt: '2026-03-20T00:00:00.000Z' },
      status: 'closed',
    }),
    (err) => err.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN',
  )

  // Slim findTransactionById shape must fail (missing compare fields)
  assert.throws(
    () => assertUpdateManualCreditMutationAllowed({
      currentTx: { id: 'x', type: 'expense', origin_type: 'manual' },
      payload,
      status: 'closed',
    }),
    (err) => err.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN',
  )

  const changes = diffCreditManualTransactionChanges(current, payload)
  assert.equal(shouldForbidClosedCreditMutation({ status: 'closed', changes }), false)
})
