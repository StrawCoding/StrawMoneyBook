import test from 'node:test'
import assert from 'node:assert/strict'

import { parseSpeechBookkeeping } from '../src/speech/financial-parser.js'
import { normalizeTaiwaneseSpeechText } from '../src/speech/tw-normalization.js'

const baseContext = {
  accounts: [
    { id: 'acc_cash', name: '現金', type: 'cash' },
    { id: 'acc_cathay', name: '國泰信用卡', type: 'credit' },
  ],
  expenseCategories: [
    { id: 'cat_breakfast', name: '早餐' },
    { id: 'cat_transport', name: '交通' },
  ],
  incomeCategories: [
    { id: 'cat_salary', name: '薪水' },
  ],
  counterparties: ['小明'],
  addonTemplates: [
    { id: 'addon_fee', label: '手續費', defaultDirection: 'plus' },
  ],
}

test('normalizeTaiwaneseSpeechText fixes common Taiwan aliases and colloquial money', () => {
  const result = normalizeTaiwaneseSpeechText('昨天早參兩百五用國太卡')

  assert.equal(result.normalizedText.includes('早餐'), true)
  assert.equal(result.normalizedText.includes('國泰'), true)
  assert.equal(result.normalizedText.includes('250'), true)
})

test('parseSpeechBookkeeping returns draft and no missing requirements for a complete expense', () => {
  const result = parseSpeechBookkeeping({
    text: '昨天早餐250用現金',
    context: baseContext,
  })

  assert.equal(result.actionType, 'expense')
  assert.equal(result.draft?.accountId, 'acc_cash')
  assert.equal(result.draft?.categoryId, 'cat_breakfast')
  assert.deepEqual(result.missingRequirements, [])
})

test('parseSpeechBookkeeping reports p1 when amount is missing', () => {
  const result = parseSpeechBookkeeping({
    text: '昨天早餐用現金',
    context: baseContext,
  })

  assert.equal(result.missingRequirements.some((item) => item.code === 'p1'), true)
})

test('parseSpeechBookkeeping reports p3 when counterparty is missing for loan intent', () => {
  const result = parseSpeechBookkeeping({
    text: '我借出300',
    context: baseContext,
  })

  assert.equal(result.actionType, 'lend')
  assert.equal(result.missingRequirements.some((item) => item.code === 'p3'), true)
})

test('parseSpeechBookkeeping recognizes query analysis intent', () => {
  const result = parseSpeechBookkeeping({
    text: '幫我查詢本月花了多少',
    context: baseContext,
  })

  assert.equal(result.actionType, 'query_analysis')
  assert.equal(result.needsConfirmation, true)
})
