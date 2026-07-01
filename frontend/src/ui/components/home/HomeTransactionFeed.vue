<template>
  <article class="card summary-card">
    <header class="row summary-head">
      <div class="title-row">
        <h3>{{ t('home_tx.title') }}</h3>
        <RouterLink class="btn icon-btn" to="/transactions/search">
          <font-awesome-icon icon="fa-solid fa-magnifying-glass" />
        </RouterLink>
        <RouterLink class="btn icon-btn" to="/transactions/calendar">
          <font-awesome-icon icon="fa-solid fa-calendar" />
        </RouterLink>
      </div>
      <span class="badge tx-count-badge">{{ t('home_tx.badge_count', { month: monthLabel, count: transactionStore.homeTotal }) }}</span>
    </header>

    <ul class="tx-list">
      <li v-for="group in groupedRecentTransactions" :key="group.dateKey" class="tx-date-group">
        <div class="tx-date-head">
          <span>{{ group.label }}</span>
          <span class="tx-date-total">
            <small>{{ t('home_tx.date_income_short') }} <MoneyText :value-minor="group.incomeMinor" tone="income" /></small>
            <small>{{ t('home_tx.date_expense_short') }} <MoneyText :value-minor="group.expenseMinor" tone="expense" /></small>
          </span>
        </div>
        <ul class="tx-day-list">
          <li
            v-for="tx in group.items"
            :key="tx.id"
            class="tx-item"
            role="button"
            tabindex="0"
            @click="openEdit(tx)"
          >
            <div class="tx-icon-col">
              <font-awesome-icon v-if="categoryIconOfTransaction(tx)" :icon="categoryIconOfTransaction(tx)" class="tx-icon" />
            </div>
            <div class="tx-main">
              <div class="tx-type">
                <span>{{ labelOfTransaction(tx) }}</span>
              </div>
              <div class="tx-meta-row muted">
                <small class="tx-time">{{ formatTime(tx?.occurred_at) }}</small>
                <small class="tx-note">{{ noteText(tx) }}</small>
              </div>
            </div>
            <div class="tx-side">
              <div class="amount-line">
                <small
                  v-if="showAddonDeltaTag(tx)"
                  class="addon-delta"
                  :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
                >
                  {{ addonDeltaTag(tx.note) }}
                </small>
                <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
              </div>
              <small class="muted tx-account-side">{{ accountNameOfTransaction(tx) }}</small>
            </div>
          </li>
        </ul>
      </li>
      <li v-if="visibleHomeTransactions.length === 0" class="empty-item">
        <div class="empty-state">
          <span class="empty-state-icon" aria-hidden="true">
            <font-awesome-icon icon="fa-solid fa-receipt" />
          </span>
          <strong>{{ t('home_tx.empty_this_month') }}</strong>
          <p class="muted empty-state-copy">{{ t('home_tx.empty_hint') }}</p>
          <RouterLink class="btn primary empty-state-action" to="/transactions/quick-add">{{ t('home_tx.empty_action') }}</RouterLink>
        </div>
      </li>
    </ul>

    <nav v-if="transactionStore.homeTotal > 0" class="pagination-bar" aria-label="首頁交易分頁">
      <button class="btn" :disabled="!canGoPreviousHomePage" @click="goPreviousHomePage">
        {{ t('common.previous_page') }}
      </button>
      <span class="muted page-status">
        {{ t('common.page_status', { page: transactionStore.homePage, totalPages: transactionStore.homeTotalPages }) }}
        ・{{ t('common.page_range', { start: homePageStart, end: homePageEnd, total: transactionStore.homeTotal }) }}
      </span>
      <button class="btn" :disabled="!canGoNextHomePage" @click="goNextHomePage">
        {{ t('common.next_page') }}
      </button>
    </nav>

  </article>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { HOME_TRANSACTION_PAGE_SIZE } from '@/core/repositories/transaction.repo'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { addonDeltaMajorFromNote, addonDeltaTagText, stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { useI18n } from '@/ui/services/i18n.service'
import { getEffectiveTransactionAmountMinor, isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'

const transactionStore = useTransactionStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const router = useRouter()
const { t } = useI18n()

const monthLabel = computed(() => {
  if (transactionStore.homeFilterMode === 'all') return t('home_page.all_transactions')
  if (transactionStore.homeFilterMode === 'year') return t('home_tx.range_year', { year: transactionStore.homeFilterKey })
  if (transactionStore.homeFilterMode === 'day') return transactionStore.homeFilterKey
  if (transactionStore.homeFilterMode === 'month') {
    const [year, month] = String(transactionStore.homeFilterKey).split('-')
    if (year && month) return `${year}/${month}`
  }
  return t('home_tx.range_current')
})

const visibleHomeTransactions = computed(() => {
  const typeFilter = transactionStore.homeTypeFilter
  if (typeFilter === 'income' || typeFilter === 'expense') {
    return transactionStore.homeRecent.filter((tx) => tx.type === typeFilter)
  }
  return transactionStore.homeRecent
})

const homePageStart = computed(() => {
  if (transactionStore.homeTotal <= 0) return 0
  return ((transactionStore.homePage - 1) * HOME_TRANSACTION_PAGE_SIZE) + 1
})

const homePageEnd = computed(() => {
  return Math.min(transactionStore.homeTotal, transactionStore.homePage * HOME_TRANSACTION_PAGE_SIZE)
})

const canGoPreviousHomePage = computed(() => transactionStore.homePage > 1)
const canGoNextHomePage = computed(() => transactionStore.homePage < transactionStore.homeTotalPages)

async function goPreviousHomePage() {
  if (!canGoPreviousHomePage.value) return
  await transactionStore.loadHomePage(transactionStore.homePage - 1)
}

async function goNextHomePage() {
  if (!canGoNextHomePage.value) return
  await transactionStore.loadHomePage(transactionStore.homePage + 1)
}

const groupedRecentTransactions = computed(() => {
  const grouped = []
  const groupMap = new Map()
  for (const tx of visibleHomeTransactions.value) {
    const key = dateKeyOf(tx.occurred_at)
    if (!groupMap.has(key)) {
      const group = { dateKey: key, label: dateLabelOf(tx.occurred_at), items: [], incomeMinor: 0, expenseMinor: 0 }
      groupMap.set(key, group)
      grouped.push(group)
    }
    const group = groupMap.get(key)
    group.items.push(tx)
    if (!isCountableForIncomeExpense(tx)) continue
    const effectiveAmountMinor = getEffectiveTransactionAmountMinor(tx)
    if (tx.type === 'income') {
      group.incomeMinor += Math.abs(effectiveAmountMinor)
    } else if (tx.type === 'expense') {
      group.expenseMinor += Math.abs(effectiveAmountMinor)
    }
  }
  return grouped
})

function dateKeyOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'invalid-date'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function labelOf(type) {
  if (type === 'expense') return t('home_tx.type.expense')
  if (type === 'income') return t('home_tx.type.income')
  if (type === 'transfer') return t('home_tx.type.transfer')
  return t('home_tx.type.balance')
}

function labelOfTransaction(tx) {
  if (!tx) return '結餘'
  if (tx.origin_type === 'reimbursement') return '報銷'
  if (tx.origin_type === 'loan_payment') {
    return loanTransactionLabel(tx)
  }
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  if (tx.type === 'transfer') return '轉帳'
  if (tx.type === 'adjustment') return '結餘'
  const kind = category?.kind
  if (kind === 'income') return '收入'
  if (kind === 'expense') return '支出'
  return labelOf(tx.type)
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') {
    return tx.type === 'income' ? '收回' : '借出'
  }
  if (loanDirection === 'borrow') {
    return tx.type === 'expense' ? '歸還' : '借入'
  }
  return tx.type === 'income' ? '收回' : '借出'
}

function categoryIconOfTransaction(tx) {
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx.category_icon ?? '').trim()
  if (directIcon) return directIcon
  if (tx.type === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  if (tx.origin_type === 'reimbursement') return 'fa-solid fa-receipt'
  if (tx.origin_type === 'loan_payment') return loanTransactionIcon(tx)
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  return category?.icon ?? ''
}

function loanTransactionIcon(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
  if (loanDirection === 'borrow') return tx.type === 'expense' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-arrow-down'
  return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
}

function accountNameOfTransaction(tx) {
  if (!tx?.account_id) return t('home_tx.unknown_account')
  return accountStore.accounts.find((item) => item.id === tx.account_id)?.name ?? t('home_tx.unknown_account')
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function noteText(tx) {
  return stripAddonSummaryFromNote(tx?.note).trim() || '-'
}

function addonDeltaMajor(note) {
  return addonDeltaMajorFromNote(note)
}

function addonDeltaTag(note) {
  return addonDeltaTagText(note)
}

function showAddonDeltaTag(tx) {
  if (!tx) return false
  if (tx.type === 'transfer' && Number(tx.amount_minor ?? 0) > 0) return false
  return Boolean(addonDeltaTag(tx.note))
}

function openEdit(tx) {
  if (!tx) return
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}
</script>

<style scoped>.summary-card {
  padding: 14px
}
h3 {
  margin: 0;
  font-size: 16px
}
.summary-head {
  align-items: flex-start;
  flex-wrap: wrap
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0
}
.tx-count-badge {
  margin-left: auto;
  max-width: 100%;
  white-space: normal;
  text-align: right;
  line-height: 1.35
}
.tx-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 10px
}
.tx-date-group {
  display: grid;
  gap: 6px
}
.tx-date-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 15px;
  color: var(--muted);
  font-weight: 700;
  padding: 0 2px 2px
}

.tx-date-total {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.tx-date-total small {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.tx-day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.tx-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  cursor: pointer;
  outline: none;
  min-width: 0;
  overflow: hidden;
}
.tx-item:focus, .tx-item:focus-visible {
  outline: none;
  box-shadow: none
}
.tx-main {
  flex: 1;
  min-width: 0
}
.tx-icon-col {
  height: 100%;
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0
}
.tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 1;
  text-align: right;
  min-width: 0;
  max-width: 42%;
}
.amount-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.addon-delta {
  font-size: 12px;
  line-height: 1.2
}
.addon-delta.plus {
  color: var(--delta-plus)
}
.addon-delta.minus {
  color: var(--delta-minus)
}
.tx-type {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  font-weight: 700;
  margin-bottom: 4px;
  min-width: 0;
  max-width: 100%
}
.tx-type span {
  min-width: 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden
}
.tx-main .muted {
  min-width: 0;
}
.tx-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.tx-time {
  flex-shrink: 0;
}
.tx-note {
  display: block;
  min-width: 0;
  flex: 1;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tx-account-side {
  max-width: 120px
}
.tx-icon {
  font-size: 22px;
  margin-top: 1px;
  color: var(--primary-soft);
  flex-shrink: 0
}
.empty-item {
  text-align: center;
  padding: 0
}
.empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 22px 16px;
  border: 1px dashed color-mix(in srgb, var(--primary) 26%, var(--border) 74%);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-highlight) 64%, transparent);
}
.empty-state strong {
  font-size: var(--text-md);
}
.empty-state-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--primary-soft);
  font-size: 20px;
}
.empty-state-copy {
  margin: 0;
  max-width: 22rem;
  line-height: 1.5;
}
.empty-state-action {
  min-width: 108px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center
}
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.page-status {
  flex: 1;
  text-align: center;
  min-width: 10rem;
  line-height: 1.4;
}</style>
