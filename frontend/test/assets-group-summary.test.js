import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { calculateAssetSummary } from '../src/core/utils/assets-summary.js'
import { buildGroupSummaries } from '../src/ui/utils/account-group-summary.js'

const assetsPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/assets.vue'), 'utf8')

test('group summaries keep excluded accounts in group totals while asset summary excludes them', () => {
  const groups = [{
    id: 'group-cash',
    name: '現金',
  }]
  const accounts = [
    {
      id: 'account-wallet',
      group_id: 'group-cash',
      opening_balance_minor: 10000,
      include_in_assets: 1,
    },
    {
      id: 'account-buffer',
      group_id: 'group-cash',
      opening_balance_minor: 5000,
      include_in_assets: 0,
    },
  ]
  const balances = [
    {
      id: 'account-wallet',
      balance_minor: 10000,
      reimbursement_advance_minor: 0,
      account_type: 'asset',
      include_in_assets: 1,
    },
    {
      id: 'account-buffer',
      balance_minor: 5000,
      reimbursement_advance_minor: 0,
      account_type: 'asset',
      include_in_assets: 0,
    },
  ]

  const groupSummaries = buildGroupSummaries(groups, accounts, balances)
  const assetSummary = calculateAssetSummary({ balances })

  assert.equal(groupSummaries.length, 1)
  assert.equal(groupSummaries[0].accountCount, 2)
  assert.equal(groupSummaries[0].totalMinor, 15000)
  assert.equal(assetSummary.totalAssetMinor, 10000)
  assert.equal(assetSummary.disposableMinor, 10000)
})

test('assets page keeps group totals inline within each account group instead of a dedicated summary section', () => {
  assert.match(assetsPageSource, /class="group-total"/)
  assert.match(assetsPageSource, /groupSummaries/)
  assert.doesNotMatch(assetsPageSource, /assets_page\.group_summary_title/)
  assert.doesNotMatch(assetsPageSource, /groupStatSummaries/)
})
