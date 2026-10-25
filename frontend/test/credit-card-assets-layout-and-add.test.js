import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildGroupSummaries } from '../src/ui/utils/account-group-summary.js'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(resolve(root, rel), 'utf8')

const assetsSource = read('src/ui/views/assets.vue')
const creditPageSource = read('src/ui/views/credit-cards/CreditCardsPage.vue')
const creditServiceSource = read('src/core/services/credit.service.js')
const accountStoreSource = read('src/ui/stores/account.store.js')
const creditStoreSource = read('src/ui/stores/credit.store.js')
const managementSource = read('src/ui/views/accounts/AssetAccountManagementPage.vue')

test('assets page puts securities left and credit right without full-width stack', () => {
  assert.match(assetsSource, /data-testid="assets-securities-entry"/)
  assert.match(assetsSource, /data-testid="assets-credit-entry"/)
  const securitiesAt = assetsSource.indexOf('data-testid="assets-securities-entry"')
  const creditAt = assetsSource.indexOf('data-testid="assets-credit-entry"')
  assert.ok(securitiesAt < creditAt)
  assert.match(assetsSource, /\.summary-total\s*\{\s*\n\s*grid-column:\s*1\s*\/\s*-1;/)
  assert.doesNotMatch(
    assetsSource,
    /\.summary-total,\s*\n\.summary-securities,\s*\n\.summary-credit\s*\{/,
  )
})

test('assets and management exclude credit accounts from mother categories', () => {
  assert.match(assetsSource, /account_kind.*=== 'credit'/)
  assert.match(managementSource, /account_kind.*=== 'credit'/)
  assert.match(managementSource, /account\.credit_use_cards_page/)
  assert.doesNotMatch(managementSource, /value: 'credit'/)
})

test('buildGroupSummaries excludes credit accounts from category totals', () => {
  const summaries = buildGroupSummaries(
    [{ id: 'g1', name: '現金' }],
    [
      { id: 'a1', group_id: 'g1', account_kind: 'cash', include_in_group_statistics: 1, currency_code: 'TWD' },
      { id: 'c1', group_id: 'g1', account_kind: 'credit', include_in_group_statistics: 1, currency_code: 'TWD' },
    ],
    [
      { id: 'a1', balance_minor: 10000 },
      { id: 'c1', balance_minor: -5000 },
    ],
    { targetCurrencyCode: 'TWD', rates: {} },
  )
  assert.equal(summaries[0].totalMinor, 10000)
  assert.equal(summaries[0].accountCount, 1)
})

test('bookkeeping groups put credit under synthetic 信用卡 section not cash groups', () => {
  assert.match(accountStoreSource, /__credit_cards__/)
  assert.match(accountStoreSource, /includeCredit: true/)
  assert.match(accountStoreSource, /includeCredit: false/)
  assert.match(accountStoreSource, /isCreditAccount/)
})

test('credit cards page can add cards; purchases go via normal bookkeeping', () => {
  assert.match(creditPageSource, /data-testid="credit-add-open"/)
  assert.match(creditPageSource, /data-testid="credit-add-submit"/)
  assert.match(creditPageSource, /creditStore\.createCard/)
  assert.match(creditPageSource, /data-testid="credit-bookkeeping-hint"/)
  assert.match(creditPageSource, /data-testid="credit-goto-quick-add"/)
  assert.match(creditPageSource, /\/transactions\/quick-add\?type=expense/)
  assert.doesNotMatch(creditPageSource, /data-testid="credit-purchase-open"/)
  assert.doesNotMatch(creditPageSource, /creditStore\.purchase/)
  assert.match(creditStoreSource, /createCreditCardAccount/)
  assert.match(creditServiceSource, /export async function createCreditCardAccount/)
  assert.match(creditServiceSource, /includeInGroupStatistics: false/)
  assert.match(creditServiceSource, /accountKind: 'credit'/)
})

test('createExpense routes credit accounts to createCreditPurchase', () => {
  const txSource = read('src/core/services/transaction.service.js')
  assert.match(txSource, /account_kind\) === 'credit'/)
  assert.match(txSource, /createCreditPurchase/)
})
