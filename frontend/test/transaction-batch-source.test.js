import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyBatchNotePatch,
  buildBatchTransactionUpdateInput,
  BATCH_NOTE_MODE_CLEAR,
  BATCH_NOTE_MODE_REPLACE,
  BATCH_TOGGLE_FALSE,
  BATCH_TOGGLE_TRUE,
} from '../src/core/services/transaction-batch-patch.js'

const searchPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionSearchPage.vue'),
  'utf8',
)
const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)
const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

test('TransactionSearchPage supports batch select mode', () => {
  assert.match(searchPageSource, /batchMode/)
  assert.match(searchPageSource, /selectedIds/)
  assert.match(searchPageSource, /toggleBatchMode/)
  assert.match(searchPageSource, /toggleSelectAll/)
  assert.match(searchPageSource, /toggleSelect/)
  assert.match(searchPageSource, /批量操作/)
})

test('TransactionSearchPage supports batch category change', () => {
  assert.match(searchPageSource, /batchEditSheetOpen/)
  assert.match(searchPageSource, /batchPatch/)
  assert.match(searchPageSource, /applyBatchEdit/)
  assert.match(searchPageSource, /openBatchEditSheet/)
  assert.match(searchPageSource, /批量編輯/)
  assert.match(searchPageSource, /可報銷/)
  assert.match(searchPageSource, /納入預算/)
  assert.match(searchPageSource, /納入收支分析/)
  assert.match(searchPageSource, /備註/)
})

test('transaction service exports batchPatchCategory', () => {
  assert.match(transactionServiceSource, /export async function batchPatchCategory/)
  assert.match(transactionServiceSource, /batchPatchCategoryForTransactions/)
})

test('transaction service exports batchPatchTransactions', () => {
  assert.match(transactionServiceSource, /export async function batchPatchTransactions/)
  assert.match(transactionServiceSource, /buildBatchTransactionUpdateInput/)
  assert.match(transactionServiceSource, /assertCanCreateReimbursement/)
})

test('transaction repo exports batchPatchCategoryForTransactions', () => {
  assert.match(transactionRepoSource, /export async function batchPatchCategoryForTransactions/)
})

test('applyBatchNotePatch preserves addon summary when replacing or clearing visible note', () => {
  const currentNote = '午餐\n【附加項目】服務費+10、折扣-5'

  assert.equal(
    applyBatchNotePatch(currentNote, { noteMode: BATCH_NOTE_MODE_REPLACE, note: '聚餐' }),
    '聚餐\n【附加項目】服務費+10、折扣-5',
  )
  assert.equal(
    applyBatchNotePatch(currentNote, { noteMode: BATCH_NOTE_MODE_CLEAR, note: '' }),
    '【附加項目】服務費+10、折扣-5',
  )
})

test('buildBatchTransactionUpdateInput applies reimbursement and budget flags for expense transactions', () => {
  const result = buildBatchTransactionUpdateInput({
    type: 'expense',
    account_id: 'acc-1',
    peer_account_id: null,
    category_id: 'cat-old',
    amount_minor: -1200,
    occurred_at: '2026-04-08T10:00:00.000Z',
    note: '午餐',
    is_reimbursable: 0,
    reimbursement_state: 'none',
    include_in_budget: 1,
    include_in_analysis: 1,
  }, {
    categoryId: 'cat-new',
    isReimbursableMode: BATCH_TOGGLE_TRUE,
    includeInBudgetMode: BATCH_TOGGLE_FALSE,
  })

  assert.equal(result.ok, true)
  assert.equal(result.input.categoryId, 'cat-new')
  assert.equal(result.input.isReimbursable, true)
  assert.equal(result.input.reimbursementState, 'pending')
  assert.equal(result.input.includeInBudget, false)
  assert.equal(result.input.includeInAnalysis, true)
})

test('buildBatchTransactionUpdateInput rejects reimbursement patch for non-expense transactions', () => {
  const result = buildBatchTransactionUpdateInput({
    type: 'income',
    account_id: 'acc-1',
    category_id: 'cat-1',
    amount_minor: 1200,
    occurred_at: '2026-04-08T10:00:00.000Z',
  }, {
    isReimbursableMode: BATCH_TOGGLE_TRUE,
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /只有支出交易可批量設定可報銷/)
})
