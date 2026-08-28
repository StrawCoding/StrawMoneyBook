import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  projectAnalysisCategoryTransactions,
  resolveAnalysisCategoryTargetId,
} from '../src/core/utils/analysis-breakdown.js'

const queryServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction-query.service.js'),
  'utf8',
)
const repoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

test('resolveAnalysisCategoryTargetId keeps addon breakdown id', () => {
  assert.equal(
    resolveAnalysisCategoryTargetId('__addon__', '__addon__:%E6%9C%8D%E5%8B%99%E8%B2%BB'),
    '__addon__:%E6%9C%8D%E5%8B%99%E8%B2%BB',
  )
  assert.equal(resolveAnalysisCategoryTargetId('food', ''), 'food')
})

test('projectAnalysisCategoryTransactions keeps addon split amounts without scanning sibling categories', () => {
  const foodWithAddon = {
    id: 'tx-food-addon',
    type: 'expense',
    amount_minor: -11500,
    category_id: 'food',
    include_in_analysis: 1,
    origin_type: null,
    note: '午餐\n【附加項目】服務費+15',
  }
  const traffic = {
    id: 'tx-traffic',
    type: 'expense',
    amount_minor: -8000,
    category_id: 'traffic',
    include_in_analysis: 1,
    origin_type: null,
    note: '',
  }
  const loan = {
    id: 'tx-loan',
    type: 'expense',
    amount_minor: -3000,
    category_id: 'food',
    include_in_analysis: 1,
    origin_type: 'loan_payment',
    note: '',
  }

  const foodRows = projectAnalysisCategoryTransactions([foodWithAddon, traffic, loan], {
    type: 'expense',
    categoryId: 'food',
  })
  assert.equal(foodRows.length, 1)
  assert.equal(foodRows[0].id, 'tx-food-addon')
  assert.equal(foodRows[0].amount_minor, -10000)

  const addonRows = projectAnalysisCategoryTransactions([foodWithAddon, traffic], {
    type: 'expense',
    categoryId: '__addon__',
    addonId: '__addon__:%E6%9C%8D%E5%8B%99%E8%B2%BB',
  })
  assert.equal(addonRows.length, 1)
  assert.equal(addonRows[0].amount_minor, -1500)
  assert.match(String(addonRows[0].analysis_part_label ?? ''), /服務費/)
})

test('analysis category detail query path uses SQL category filter instead of full-ledger chunk', () => {
  assert.match(queryServiceSource, /export async function loadAnalysisCategoryDetail/)
  assert.match(queryServiceSource, /listAnalysisCategoryTransactions/)
  assert.match(queryServiceSource, /summarizeAnalysisTypeTotal/)
  assert.match(repoSource, /export async function listAnalysisCategoryTransactions/)
  assert.match(repoSource, /t\.category_id = \?/)
  assert.match(repoSource, /t\.note LIKE '%【附加項目】%'/)
  const loadFn = queryServiceSource.slice(
    queryServiceSource.indexOf('export async function loadAnalysisCategoryDetail'),
    queryServiceSource.indexOf('export async function loadAnalysisStats'),
  )
  assert.doesNotMatch(loadFn, /listAllTransactionsChunked/)
  assert.doesNotMatch(loadFn, /listTransactionsByScope/)
})
