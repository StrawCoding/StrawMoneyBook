import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAccountOptionGroups,
  withLeadingAccountOption,
} from '../src/ui/utils/account-option-groups.js'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(resolve(root, rel), 'utf8')

const aiSource = read('src/ui/views/AiAutoBookkeepingPage.vue')
const quickAddSource = read('src/ui/views/QuickAddPage.vue')
const homeEditSource = read('src/ui/components/home/HomeTransactionEditSheet.vue')
const customSelectSource = read('src/ui/components/common/CustomSelect.vue')
const globalCss = read('src/ui/assets/css/global.css')
const loanListSource = read('src/ui/views/loans/LoanListPage.vue')
const reimbursementSource = read('src/ui/views/reimbursements/ReimbursementListPage.vue')
const subscriptionSource = read('src/ui/views/subscriptions/SubscriptionListPage.vue')
const savingsJarSource = read('src/ui/views/savings-jars/SavingsJarListPage.vue')
const carrierSource = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
const einvoiceStep4Source = read('src/ui/views/einvoice/EInvoiceStep4Confirm.vue')
const amountCalcSource = read('src/ui/components/common/AmountCalculatorInput.vue')
const securitiesListSource = read('src/ui/views/securities/SecuritiesListPage.vue')
const securitiesDetailSource = read('src/ui/views/securities/SecurityDetailPage.vue')
const qnaSource = read('src/ui/views/QnaBookkeepingPage.vue')

test('AI bookkeeping and quick add use grouped account selectors', () => {
  assert.match(aiSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(aiSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(aiSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(aiSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)

  assert.match(quickAddSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(quickAddSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(quickAddSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(quickAddSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
})

test('home transaction edit sheet uses grouped account selectors', () => {
  assert.match(homeEditSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(homeEditSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(homeEditSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(homeEditSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
  assert.doesNotMatch(homeEditSource, /<CustomSelect v-model="model\.accountId" :options="directAccountOptions"/)
})

test('secondary account pickers use groupedRegularAccounts', () => {
  assert.match(loanListSource, /:groups="accountStore\.groupedRegularAccounts"/)
  assert.match(reimbursementSource, /:groups="accountStore\.groupedRegularAccounts"/)
  const reimbursementAdvanceSource = read('src/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue')
  const reimbursementEditSource = read('src/ui/views/reimbursements/ReimbursementEditPage.vue')
  assert.match(reimbursementAdvanceSource, /:groups="accountStore\.groupedRegularAccounts"/)
  assert.doesNotMatch(reimbursementAdvanceSource, /:options="accountStore\.accounts"/)
  assert.match(reimbursementEditSource, /:groups="accountStore\.groupedRegularAccounts"/)
  assert.doesNotMatch(reimbursementEditSource, /:options="accountStore\.accounts"/)
  assert.match(subscriptionSource, /:groups="accountOptionGroups"/)
  assert.match(subscriptionSource, /const accountOptionGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(savingsJarSource, /:groups="flowAccountGroups"/)
  assert.match(savingsJarSource, /:groups="autoSaveAccountGroups"/)
  assert.match(carrierSource, /<CustomSelect/)
  assert.match(carrierSource, /accountSelectGroups/)
  assert.match(carrierSource, /categorySelectGroups/)
  assert.match(carrierSource, /buildCategorySelectGroups\(categoryStore, 'expense'\)/)
  assert.match(carrierSource, /withLeadingAccountOption/)
  assert.doesNotMatch(carrierSource, /<optgroup/)
  assert.match(einvoiceStep4Source, /<CustomSelect/)
  assert.match(einvoiceStep4Source, /accountSelectGroups/)
  assert.match(einvoiceStep4Source, /categorySelectGroups/)
  assert.match(einvoiceStep4Source, /buildCategorySelectGroups\(categoryStore, 'expense'\)/)
  assert.match(einvoiceStep4Source, /withLeadingAccountOption/)
  assert.doesNotMatch(einvoiceStep4Source, /<optgroup/)
})

test('securities settlement pickers use grouped CustomSelect', () => {
  assert.match(securitiesListSource, /:groups="settlementAccountGroups"/)
  assert.match(securitiesListSource, /buildAccountOptionGroups\(/)
  assert.doesNotMatch(securitiesListSource, /:options="settlementOptions"/)
  assert.match(securitiesDetailSource, /:groups="settlementAccountGroups"/)
  assert.match(securitiesDetailSource, /buildAccountOptionGroups\(/)
  assert.doesNotMatch(securitiesDetailSource, /:options="settlementOptions"/)
})

test('qna bookkeeping account pickers use grouped CustomSelect', () => {
  assert.match(qnaSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(qnaSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(qnaSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(qnaSource, /<CustomSelect v-model="model\.accountId" :groups="transferAccountGroups"/)
  assert.match(qnaSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
  assert.doesNotMatch(qnaSource, /:options="directAccountOptions"/)
  assert.doesNotMatch(qnaSource, /:options="transferAccountOptions"/)
})

test('credit card repay source uses grouped CustomSelect without credit accounts', () => {
  const creditCardsSource = read('src/ui/views/credit-cards/CreditCardsPage.vue')
  assert.match(creditCardsSource, /<CustomSelect[\s\S]*data-testid="credit-repay-source"/)
  assert.match(creditCardsSource, /:groups="cashAccountGroups"/)
  assert.match(creditCardsSource, /const cashAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.doesNotMatch(creditCardsSource, /<select v-model="repayForm\.sourceAccountId"/)
})

test('CustomSelect keeps selected option group context visible', () => {
  assert.match(customSelectSource, /selectedOption\?\.groupName/)
  assert.match(customSelectSource, /normalizeOptions\(group\.options \?\? group\.categories \?\? \[\], groupName\)/)
  assert.match(customSelectSource, /v-if="String\(group\.name \?\? ''\)\.trim\(\)"/)
})

test('surface aliases and input field backgrounds are defined', () => {
  assert.match(globalCss, /--surface:\s*var\(--input-bg\)/)
  assert.match(globalCss, /--surface-soft:\s*var\(--input-bg\)/)
  assert.match(globalCss, /--text-secondary:\s*var\(--text-soft\)/)
  assert.match(carrierSource, /background:\s*var\(--input-bg\)/)
  assert.match(einvoiceStep4Source, /background:\s*var\(--input-bg\)/)
  assert.match(amountCalcSource, /\.calc-trigger[\s\S]*background:\s*var\(--input-bg\)/)
})

test('buildAccountOptionGroups and withLeadingAccountOption behave', () => {
  const groups = buildAccountOptionGroups(
    [{ id: 'g1', name: '現金' }, { id: 'g2', name: '銀行' }],
    [
      { id: 'a1', name: '錢包', group_id: 'g1', currency_code: 'TWD' },
      { id: 'a2', name: '玉山', group_id: 'g2', currency_code: 'TWD' },
      { id: 'a3', name: 'USD 卡', group_id: 'g2', currency_code: 'USD' },
    ],
    { currencyCode: 'TWD' },
  )
  assert.equal(groups.length, 2)
  assert.equal(groups[0].name, '現金')
  assert.deepEqual(groups[0].options.map((item) => item.value), ['a1'])
  assert.deepEqual(groups[1].options.map((item) => item.value), ['a2'])

  const withNone = withLeadingAccountOption(groups, { value: '__none__', label: '不對應' })
  assert.equal(withNone[0].options[0].value, '__none__')
  assert.equal(withNone.length, 3)
})
