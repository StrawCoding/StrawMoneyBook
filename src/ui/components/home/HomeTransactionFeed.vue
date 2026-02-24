<template>
  <article class="card summary-card">
    <header class="row">
      <div class="title-row">
        <h3>{{ t('home_tx.title') }}</h3>
        <RouterLink class="btn icon-btn" to="/transactions/search">
          <font-awesome-icon icon="fa-solid fa-magnifying-glass" />
        </RouterLink>
        <RouterLink class="btn icon-btn" to="/transactions/calendar">
          <font-awesome-icon icon="fa-solid fa-calendar" />
        </RouterLink>
      </div>
      <span class="badge">{{ t('home_tx.badge_count', { month: monthLabel, count: visibleHomeTransactions.length }) }}</span>
    </header>

    <ul class="tx-list">
      <li v-for="group in groupedRecentTransactions" :key="group.dateKey" class="tx-date-group">
        <div class="tx-date-head">
          <span>{{ group.label }}</span>
          <span class="tx-date-total">
            <small>收 <MoneyText :value-minor="group.incomeMinor" tone="income" /></small>
            <small>支 <MoneyText :value-minor="group.expenseMinor" tone="expense" /></small>
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
              <small class="muted">{{ formatTime(tx.occurred_at) }}</small>
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
      <li v-if="visibleHomeTransactions.length === 0" class="muted empty-item">{{ t('home_tx.empty_this_month') }}</li>
    </ul>

  </article>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { addonDeltaMajorFromNote, addonDeltaTagText } from '@/ui/utils/addon-note'
import { useI18n } from '@/ui/services/i18n.service'

const transactionStore = useTransactionStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const router = useRouter()
const { t } = useI18n()

function isCountableForAnalysis(tx) {
  return Number(tx?.include_in_analysis ?? 1) !== 0
}

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

const groupedRecentTransactions = computed(() => {
  const grouped = []
  const groupMap = new Map()
  for (const tx of visibleHomeTransactions.value.slice(0, 12)) {
    const key = dateKeyOf(tx.occurred_at)
    if (!groupMap.has(key)) {
      const group = { dateKey: key, label: dateLabelOf(tx.occurred_at), items: [], incomeMinor: 0, expenseMinor: 0 }
      groupMap.set(key, group)
      grouped.push(group)
    }
    const group = groupMap.get(key)
    group.items.push(tx)
    if (!isCountableForAnalysis(tx)) continue
    if (tx.type === 'income') {
      group.incomeMinor += Math.abs(Math.round(Number(tx.amount_minor ?? 0)))
    } else if (tx.type === 'expense') {
      group.expenseMinor += Math.abs(Math.round(Number(tx.amount_minor ?? 0)))
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
  if (type === 'expense') return '支出'
  if (type === 'income') return '收入'
  if (type === 'transfer') return '轉帳'
  return '調整'
}

function labelOfTransaction(tx) {
  if (!tx) return '調整'
  if (tx.origin_type === 'reimbursement') return '報銷'
  if (tx.origin_type === 'loan_payment') {
    return loanTransactionLabel(tx)
  }
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  if (tx.type === 'transfer') return '轉帳'
  if (tx.type === 'adjustment') return '調整'
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
  if (!tx || tx.type === 'adjustment') return ''
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
  if (!tx?.account_id) return '未知帳戶'
  return accountStore.accounts.find((item) => item.id === tx.account_id)?.name ?? '未知帳戶'
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
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
.title-row {
  display: flex;
  align-items: center;
  gap: 8px
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
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 90%, transparent);
  cursor: pointer;
  outline: none
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
  align-items: flex-start;
  justify-content: center;
  align-items: center;
  display: flex;
  flex-shrink: 0
}
.tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 0;
  text-align: right;
  min-width: 104px
}
.amount-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px
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
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
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
  padding: 8px
}
.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center
}</style>
