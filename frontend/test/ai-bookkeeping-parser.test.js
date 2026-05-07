import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_BOOKKEEPING_WARNING_KEY,
  parseAutoBookkeepingText,
} from '../src/core/services/ai-bookkeeping.service.js'

function buildContext(overrides = {}) {
  return {
    accounts: [
      { id: 'acc_cash', name: '現金' },
      { id: 'acc_bank', name: '玉山銀行' },
    ],
    expenseCategories: [
      { id: 'cat_food', name: '午餐' },
      { id: 'cat_transport', name: '交通' },
    ],
    incomeCategories: [
      { id: 'cat_salary', name: '薪水' },
      { id: 'cat_cashback', name: '現金回饋' },
    ],
    counterparties: [],
    historyTransactions: [],
    autoFillRules: [],
    addonTemplates: [
      { id: 'discount', label: '優惠', defaultDirection: 'minus' },
      { id: 'fee', label: '手續費', defaultDirection: 'plus' },
      { id: 'coupon', label: '折價券', defaultDirection: 'minus' },
    ],
    useTinyNer: false,
    now: new Date('2026-03-20T08:00:00.000Z'),
    ...overrides,
  }
}

test('parseAutoBookkeepingText returns empty-input warning for blank input', () => {
  const result = parseAutoBookkeepingText('   ', buildContext())

  assert.equal(result.draft, null)
  assert.deepEqual(result.warningKeys, [AI_BOOKKEEPING_WARNING_KEY.EMPTY_INPUT])
})

test('parseAutoBookkeepingText returns transfer warning when transfer accounts are insufficient', () => {
  const result = parseAutoBookkeepingText('轉帳 500', buildContext({
    accounts: [{ id: 'acc_only', name: '現金' }],
  }))

  assert.equal(result.draft?.type, 'transfer')
  assert.equal(result.draft?.amountMajor, 500)
  assert.equal(result.draft?.accountId, '')
  assert.equal(result.draft?.peerAccountId, '')
  assert.ok(result.warningKeys.includes(AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT))
})

test('parseAutoBookkeepingText falls back to the first account and matched expense category', () => {
  const result = parseAutoBookkeepingText('午餐 120', buildContext())

  assert.equal(result.draft?.type, 'expense')
  assert.equal(result.draft?.accountId, 'acc_cash')
  assert.equal(result.draft?.categoryId, 'cat_food')
  assert.equal(result.draft?.amountMajor, 120)
})

test('parseAutoBookkeepingText warns when loan intent has no counterparty name', () => {
  const result = parseAutoBookkeepingText('借給 500', buildContext())

  assert.equal(result.draft?.loanIntent?.mode, 'create')
  assert.equal(result.draft?.loanIntent?.direction, 'lend')
  assert.ok(result.warningKeys.includes(AI_BOOKKEEPING_WARNING_KEY.NO_COUNTERPARTY))
})

test('parseAutoBookkeepingText keeps addon items separate from the main amount while preserving freeform note text', () => {
  const result = parseAutoBookkeepingText('朋友聚餐 午餐 120 手續費 5', buildContext())

  assert.equal(result.draft?.amountMajor, 120)
  assert.equal(result.draft?.categoryId, 'cat_food')
  assert.equal(result.draft?.addonItems?.length, 1)
  assert.equal(result.draft?.addonItems?.[0]?.label, '手續費')
  assert.equal(result.draft?.addonItems?.[0]?.deltaMajor, 5)
  assert.match(result.draft?.note ?? '', /朋友聚餐/)
})

test('parseAutoBookkeepingText recognizes custom addon template labels', () => {
  const result = parseAutoBookkeepingText('午餐 120 折價券 20', buildContext())

  assert.equal(result.draft?.amountMajor, 120)
  assert.equal(result.draft?.addonItems?.length, 1)
  assert.equal(result.draft?.addonItems?.[0]?.label, '折價券')
  assert.equal(result.draft?.addonItems?.[0]?.deltaMajor, 20)
  assert.equal(result.draft?.note ?? '', '')
})

test('parseAutoBookkeepingText can produce zero settled amount after addon offsets', () => {
  const result = parseAutoBookkeepingText('午餐 120 優惠 120', buildContext())

  assert.equal(result.draft?.amountMajor, 120)
  assert.equal(result.draft?.addonItems?.length, 1)
  assert.equal(result.draft?.addonItems?.[0]?.label, '優惠')
  assert.equal(result.draft?.addonItems?.[0]?.deltaMajor, 120)
  assert.deepEqual(result.warningKeys, [])
})

test('parseAutoBookkeepingText does not treat amount subtraction as month-day and keeps the intended relative date', () => {
  const result = parseAutoBookkeepingText('昨天午餐 120-20', buildContext())

  assert.equal(result.draft?.amountMajor, 100)
  assert.equal(result.draft?.occurredAt?.slice(0, 10), '2026-03-19')
})

test('parseAutoBookkeepingText does not treat amount addition as a time token', () => {
  const result = parseAutoBookkeepingText('今天午餐 120+20', buildContext())

  assert.equal(result.draft?.amountMajor, 140)
  assert.equal(result.draft?.occurredAt?.slice(0, 10), '2026-03-20')
  assert.equal(result.draft?.occurredAt?.slice(11, 16), '08:00')
  assert.equal(result.draft?.note ?? '', '')
})

test('parseAutoBookkeepingText removes arithmetic formulas from note text while preserving real note content', () => {
  const result = parseAutoBookkeepingText('朋友午餐 120+20', buildContext())

  assert.equal(result.draft?.amountMajor, 140)
  assert.equal(result.draft?.note ?? '', '朋友')
})
