import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBankImportPlan,
  buildBankImportRuleMatchText,
  resolveBankImportRule,
} from '../src/services/bank-sync/import-auto-rule.js'

test('buildBankImportRuleMatchText joins searchable bank fields', () => {
  assert.equal(
    buildBankImportRuleMatchText({
      summary: '優遊付儲值',
      merchant: '悠遊付',
      description: '信用卡扣款',
      transaction_type: '轉帳',
    }),
    '優遊付儲值 悠遊付 信用卡扣款 轉帳',
  )
})

test('resolveBankImportRule matches keyword expressions for bank import text', () => {
  const matched = resolveBankImportRule(
    {
      summary: '優遊付儲值100',
      description: '自動加值',
    },
    [
      { keyword: '便利商店', type: 'expense' },
      { keyword: '優遊付 & 儲值', type: 'transfer', peerAccountId: 'asset_easy_wallet' },
    ],
  )

  assert.equal(matched?.type, 'transfer')
  assert.equal(matched?.peerAccountId, 'asset_easy_wallet')
})

test('buildBankImportPlan turns matched transfer rule into transfer import plan', () => {
  const plan = buildBankImportPlan(
    {
      amount_minor: -10000,
      mapped_account_id: 'asset_bank',
      summary: '優遊付儲值100',
      transaction_type: '支出',
    },
    [
      {
        keyword: '優遊付',
        type: 'transfer',
        accountId: '',
        peerAccountId: 'asset_easy_wallet',
        note: '自動規則',
      },
    ],
  )

  assert.equal(plan.mode, 'transfer')
  assert.equal(plan.fromAccountId, 'asset_bank')
  assert.equal(plan.toAccountId, 'asset_easy_wallet')
  assert.equal(plan.importedTxnSide, 'out')
  assert.match(plan.note, /自動規則/)
  assert.match(plan.note, /優遊付儲值100/)
})

test('buildBankImportPlan reverses transfer direction for incoming bank transfers', () => {
  const plan = buildBankImportPlan(
    {
      amount_minor: 10000,
      mapped_account_id: 'asset_bank',
      summary: '街口提領',
      transaction_type: '轉入',
    },
    [
      {
        keyword: '街口',
        type: 'transfer',
        peerAccountId: 'asset_jkopay',
        note: '銀行匯入',
      },
    ],
  )

  assert.equal(plan.mode, 'transfer')
  assert.equal(plan.fromAccountId, 'asset_jkopay')
  assert.equal(plan.toAccountId, 'asset_bank')
  assert.equal(plan.importedTxnSide, 'in')
  assert.match(plan.note, /銀行匯入/)
  assert.match(plan.note, /街口提領/)
})

test('buildBankImportPlan keeps default transaction mode when rule type conflicts with amount sign', () => {
  const plan = buildBankImportPlan(
    {
      amount_minor: -2200,
      mapped_account_id: 'asset_bank',
      summary: '午餐',
    },
    [
      {
        keyword: '午餐',
        type: 'income',
        accountId: 'asset_cash',
      },
    ],
  )

  assert.equal(plan.mode, 'transaction')
  assert.equal(plan.type, 'expense')
  assert.equal(plan.accountId, 'asset_bank')
  assert.equal(plan.matchedRule, null)
})
