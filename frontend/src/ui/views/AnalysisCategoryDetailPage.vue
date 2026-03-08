<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <div class="head-main">
          <h2>{{ t('analysis_category_detail.title') }}</h2>
          <small class="muted category-line">{{ activeTypeLabel }} / {{ activeCategoryLabel }}</small>
        </div>
        <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
      </header>

      <p class="muted range-line">{{ t('analysis_category_detail.range', { range: rangeLabel }) }}</p>

      <div class="summary-grid">
        <div class="summary-item">
          <small>{{ t('analysis_category_detail.amount', { type: activeTypeLabel }) }}</small>
          <strong>
            <MoneyText :value-minor="categoryTotalMinor" :currency="analysisCurrencyCode" />
          </strong>
        </div>
        <div class="summary-item">
          <small>{{ t('analysis_category_detail.ratio') }}</small>
          <strong>{{ categoryRatioText }}</strong>
        </div>
        <div class="summary-item">
          <small>{{ t('analysis_category_detail.count') }}</small>
          <strong>{{ categoryTransactions.length }}</strong>
        </div>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('analysis_category_detail.records_title', { range: rangeLabel }) }}</h3>
        <span class="count-chip">{{ t('analysis_page.items_count', { count: categoryTransactions.length }) }}</span>
      </header>

      <ul class="tx-list">
        <li v-for="group in groupedCategoryTransactions" :key="group.dateKey" class="tx-date-group">
          <div class="tx-date-head">{{ group.label }}</div>
          <ul class="tx-day-list">
            <li
              v-for="tx in group.items"
              :key="tx.id"
              class="tx-item"
              role="button"
              tabindex="0"
              @click="openTransaction(tx)"
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
                  <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
                </div>
                <small class="muted tx-account-side">{{ accountName(tx.account_id) }}</small>
              </div>
            </li>
          </ul>
        </li>
        <li v-if="!categoryTransactions.length" class="muted empty-item">{{ t('analysis_category_detail.no_records') }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { listAllTransactions, listTransactionsByMonth, listTransactionsByYear } from '@/core/repositories/transaction.repo'
import { useI18n } from '@/ui/services/i18n.service'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const loanStore = useLoanStore()
const uiStore = useUiStore()
const { t } = useI18n()

const statsTransactions = ref([])
const referenceLedgerId = ref('')

const analysisType = computed(() => (String(route.query.type ?? '') === 'income' ? 'income' : 'expense'))
const categoryId = computed(() => String(route.query.categoryId ?? '').trim())
const queryCategoryLabel = computed(() => String(route.query.label ?? '').trim())
const mode = computed(() => parseMode(String(route.query.mode ?? 'all')))
const selectedYear = computed(() => parseYear(route.query.year))
const selectedMonth = computed(() => parseMonthKey(String(route.query.month ?? monthKeyFromDate(new Date()))))

const categoryNameMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) {
    map.set(category.id, category.name)
  }
  return map
})

const activeTypeLabel = computed(() =>
  analysisType.value === 'income' ? t('analysis_page.type.income') : t('analysis_page.type.expense'),
)
const analysisCurrencyCode = computed(() => normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD'))
const activeCategoryLabel = computed(() => {
  if (categoryId.value === '__uncategorized__') return t('analysis_page.uncategorized')
  if (categoryNameMap.value.has(categoryId.value)) return categoryNameMap.value.get(categoryId.value) || t('analysis_page.uncategorized')
  if (queryCategoryLabel.value) return queryCategoryLabel.value
  return t('analysis_page.uncategorized')
})

const rangeLabel = computed(() => {
  if (mode.value === 'year') {
    return t('home_page.year_display', { year: selectedYear.value })
  }
  if (mode.value === 'month') {
    const [year, month] = selectedMonth.value.split('-')
    return t('home_page.month_display', { year, month })
  }
  return t('analysis_page.mode.all')
})

const typeTransactions = computed(() => {
  return statsTransactions.value.filter((tx) => {
    if (!Number(tx.include_in_analysis ?? 1)) return false
    if (tx.origin_type === 'loan_payment') return false
    if (tx.type !== analysisType.value) return false
    return normalizedAmountMinor(tx) > 0
  })
})
const categoryTransactions = computed(() => {
  return typeTransactions.value.filter((tx) => categoryKeyOf(tx) === categoryId.value)
})
const groupedCategoryTransactions = computed(() => {
  const grouped = []
  const groupMap = new Map()
  for (const tx of categoryTransactions.value) {
    const key = dateKeyOf(tx.occurred_at)
    if (!groupMap.has(key)) {
      const group = { dateKey: key, label: dateLabelOf(tx.occurred_at), items: [] }
      groupMap.set(key, group)
      grouped.push(group)
    }
    groupMap.get(key).items.push(tx)
  }
  return grouped
})
const typeTotalMinor = computed(() => typeTransactions.value.reduce((total, tx) => total + normalizedAmountMinor(tx), 0))
const categoryTotalMinor = computed(() => categoryTransactions.value.reduce((total, tx) => total + normalizedAmountMinor(tx), 0))
const categoryRatioText = computed(() => {
  if (!typeTotalMinor.value) return '0%'
  const ratio = (categoryTotalMinor.value / typeTotalMinor.value) * 100
  const rounded = Math.round(ratio * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
})

watch(
  () => [ledgerStore.activeLedgerId, categoryId.value, analysisType.value, mode.value, selectedYear.value, selectedMonth.value],
  () => {
    void loadStatsTransactions()
  },
  { immediate: true },
)

async function loadStatsTransactions() {
  if (!categoryId.value) {
    uiStore.pushToast(t('analysis_category_detail.invalid_query'), 'error')
    void router.replace({ name: 'analysis' })
    return
  }

  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    statsTransactions.value = []
    referenceLedgerId.value = ''
    return
  }

  try {
    await ensureReferenceData(ledgerId)
    if (mode.value === 'year') {
      statsTransactions.value = await listTransactionsByYear(ledgerId, String(selectedYear.value))
      return
    }
    if (mode.value === 'month') {
      statsTransactions.value = await listTransactionsByMonth(ledgerId, selectedMonth.value)
      return
    }
    statsTransactions.value = await listAllTransactions(ledgerId)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('analysis_category_detail.toast.load_failed'), 'error')
  }
}

async function ensureReferenceData(ledgerId) {
  const tasks = []
  if (referenceLedgerId.value !== ledgerId) {
    tasks.push(accountStore.load(), categoryStore.load(), loanStore.load())
  } else {
    if (!accountStore.accounts.length) tasks.push(accountStore.load())
    if (!categoryStore.categories.length) tasks.push(categoryStore.load())
    if (!loanStore.items.length) tasks.push(loanStore.load())
  }
  if (!tasks.length) return
  await Promise.all(tasks)
  referenceLedgerId.value = ledgerId
}

function goBack() {
  void goBackOrFallback(router, { name: 'analysis' })
}

function openTransaction(tx) {
  if (!tx?.id) return
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}

function normalizedAmountMinor(tx) {
  const raw = Number(tx?.amount_minor ?? 0)
  if (!Number.isFinite(raw)) return 0
  return analysisType.value === 'expense' ? Math.abs(raw) : raw
}

function categoryKeyOf(tx) {
  return String(tx?.category_id ?? '').trim() || '__uncategorized__'
}

function accountName(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name || t('transaction_search.unknown_account')
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
  if (tx.origin_type === 'loan_payment') return loanTransactionLabel(tx)
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
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

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

function parseMode(value) {
  return ['all', 'year', 'month'].includes(value) ? value : 'all'
}

function parseYear(value) {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 1900 && parsed < 3000) return parsed
  return new Date().getFullYear()
}

function parseMonthKey(value) {
  const source = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(source)) return monthKeyFromDate(new Date())
  const month = Number(source.slice(5))
  if (month < 1 || month > 12) return monthKeyFromDate(new Date())
  return source
}

function monthKeyFromDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}
</script>

<style scoped>
.panel {
  padding: 14px
}
h2,
h3 {
  margin: 0
}
.head-main {
  min-width: 0;
  display: grid;
  gap: 3px
}
.category-line {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
}
.range-line {
  margin: 10px 0 0
}
.summary-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px
}
.summary-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 4px
}
.summary-item small {
  font-size: 12px;
  color: var(--muted)
}
.summary-item strong {
  font-size: 19px;
  line-height: 1.2
}
.count-chip {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border)
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
  font-size: 15px;
  color: var(--muted);
  font-weight: 700;
  padding: 0 2px 2px
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
.tx-item:focus,
.tx-item:focus-visible {
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
  line-clamp: 2;
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
@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: 1fr
  }
}
</style>
