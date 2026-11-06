import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGroupSummaries } from '../src/ui/utils/account-group-summary.js'

test('buildGroupSummaries skips archived cash accounts', () => {
  const groups = [{ id: 'g1', name: 'G' }]
  const accounts = [
    { id: 'a1', group_id: 'g1', account_kind: 'cash', include_in_group_statistics: 1, opening_balance_minor: 100, currency_code: 'TWD' },
    { id: 'a2', group_id: 'g1', account_kind: 'cash', is_archived: 1, include_in_group_statistics: 1, opening_balance_minor: 9999, currency_code: 'TWD' },
  ]
  const summaries = buildGroupSummaries(groups, accounts, [{ id: 'a1', balance_minor: 100 }, { id: 'a2', balance_minor: 9999 }])
  assert.equal(summaries[0].accountCount, 1)
  assert.equal(summaries[0].totalMinor, 100)
})
