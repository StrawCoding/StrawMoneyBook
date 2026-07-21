<template>
  <section class="stack analysis-page">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('analysis_page.title') }}</h2>
        <div class="header-actions">
          <RouterLink class="btn icon-btn" :to="printLink" data-testid="analysis-print-link">
            <font-awesome-icon icon="fa-solid fa-print" />
          </RouterLink>
        </div>
      </header>

      <div class="mode-tabs">
        <button class="btn" :class="{ primary: mode === 'all' }" @click="mode = 'all'">{{ t('analysis_page.mode.all') }}</button>
        <button class="btn" :class="{ primary: mode === 'year' }" @click="mode = 'year'">{{ t('analysis_page.mode.year') }}</button>
        <button class="btn" :class="{ primary: mode === 'month' }" @click="mode = 'month'">{{ t('analysis_page.mode.month') }}</button>
      </div>

      <transition name="collapse-fade">
        <div v-if="mode !== 'all'" class="picker-wrap">
          <transition name="fade-scale" mode="out-in">
            <HomeRangePicker v-if="mode === 'year'" key="year" mode="year" :year="selectedYear" @update:year="pickYear" />
            <HomeRangePicker v-else key="month" mode="month" :month="selectedMonth" @update:month="pickMonth" />
          </transition>
        </div>
      </transition>
    </article>

    <article class="card panel" data-testid="analysis-big-numbers">
      <div class="big-numbers">
        <div class="big-card income">
          <small>{{ t('analysis_page.type.income') }}</small>
          <MoneyText :value-minor="incomeTotalMinor" tone="income" />
        </div>
        <div class="big-card expense">
          <small>{{ t('analysis_page.type.expense') }}</small>
          <MoneyText :value-minor="expenseTotalMinor" tone="expense" />
        </div>
        <div class="big-card balance">
          <small>{{ t('analysis_print.summary.balance') }}</small>
          <MoneyText :value-minor="balanceMinor" :tone="balanceMinor >= 0 ? 'income' : 'expense'" />
        </div>
      </div>
    </article>

    <article class="card panel" data-testid="analysis-income-section">
      <AnalysisIconizedChartPair
        v-if="incomeBarRows.length"
        :title="t('analysis_page.type_analysis', { type: t('analysis_page.type.income') })"
        :total-label="t('analysis_page.type_total', { type: t('analysis_page.type.income') })"
        :total-minor="incomeTotalMinor"
        :count="incomeCount"
        :items="incomeBarRows"
        tone="income"
        interactive
        test-id="analysis-income-charts"
        @select="(item) => openCategoryBreakdownDetail(item, 'income')"
      />
      <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: t('analysis_page.type.income').toLowerCase() }) }}</p>
    </article>

    <article class="card panel" data-testid="analysis-expense-section">
      <AnalysisIconizedChartPair
        v-if="expenseBarRows.length"
        :title="t('analysis_page.type_analysis', { type: t('analysis_page.type.expense') })"
        :total-label="t('analysis_page.type_total', { type: t('analysis_page.type.expense') })"
        :total-minor="expenseTotalMinor"
        :count="expenseCount"
        :items="expenseBarRows"
        tone="expense"
        interactive
        test-id="analysis-expense-charts"
        @select="(item) => openCategoryBreakdownDetail(item, 'expense')"
      />
      <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: t('analysis_page.type.expense').toLowerCase() }) }}</p>
    </article>

    <article
      v-if="budgetCards.length"
      class="card panel"
      data-testid="analysis-budget-cards"
    >
      <header class="row">
        <h3>{{ t('analysis_print.budget_achievement') }}</h3>
      </header>
      <div class="budget-grid">
        <article
          v-for="card in budgetCards"
          :key="card.id"
          class="budget-card"
          :class="{ over: card.isOver }"
        >
          <div class="budget-card-head">
            <span class="icon-swatch" :style="{ background: card.isOver ? '#fa5252' : '#4dabf7' }">
              <font-awesome-icon v-if="card.icon" :icon="card.icon" class="swatch-icon" />
            </span>
            <strong>{{ card.name }}</strong>
            <span class="muted">{{ card.percent }}%</span>
          </div>
          <div class="budget-track">
            <span class="budget-fill" :style="{ width: `${Math.min(100, card.percent)}%` }" />
          </div>
          <div class="budget-stats">
            <span>{{ t('analysis_print.budget_spent') }} <MoneyText :value-minor="card.spentMinor" tone="expense" /></span>
            <span>{{ t('analysis_print.budget_limit') }} <MoneyText :value-minor="card.budgetMinor" /></span>
          </div>
        </article>
      </div>
    </article>

    <article class="card panel" data-testid="analysis-account-section">
      <header class="row">
        <h3>{{ t('analysis_page.scope.account') }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: accountActiveCount }) }}</span>
          <MoneyText :value-minor="accountActiveTotalMinor" />
        </div>
      </header>

      <div class="type-tabs account-type-tabs">
        <button class="btn" :class="{ primary: accountAnalysisType === 'total' }" @click="accountAnalysisType = 'total'">
          {{ t('analysis_page.type.total') }}
        </button>
        <button class="btn" :class="{ primary: accountAnalysisType === 'income' }" @click="accountAnalysisType = 'income'">
          {{ t('analysis_page.type.income') }}
        </button>
        <button class="btn" :class="{ primary: accountAnalysisType === 'expense' }" @click="accountAnalysisType = 'expense'">
          {{ t('analysis_page.type.expense') }}
        </button>
      </div>

      <AnalysisIconizedChartPair
        v-if="accountActiveBarRows.length"
        :title="t('analysis_page.scope_type_analysis', { type: accountActiveTypeLabel, scope: '' })"
        :total-label="t('analysis_page.type_total', { type: accountActiveTypeLabel })"
        :total-minor="accountActiveTotalMinor"
        :count="accountActiveCount"
        :items="accountActiveBarRows"
        interactive
        test-id="analysis-account-charts"
        @select="openAccountBreakdownDetail"
      />
      <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: accountActiveTypeLabel.toLowerCase() }) }}</p>
    </article>

    <article v-if="showTimeBarChart" class="card panel">
      <header class="row">
        <h3>{{ timeBarTitle }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: timeBarCount }) }}</span>
          <MoneyText :value-minor="timeBarTotalMinor" />
        </div>
      </header>

      <div class="type-tabs">
        <button class="btn" :class="{ primary: analysisType === 'income' }" @click="analysisType = 'income'">{{ t('analysis_page.type.income') }}</button>
        <button class="btn" :class="{ primary: analysisType === 'expense' }" @click="analysisType = 'expense'">{{ t('analysis_page.type.expense') }}</button>
      </div>

      <div class="time-bar-chart">
        <button
          v-for="item in timeBarRows"
          :key="`${mode}-${analysisType}-${item.id}`"
          type="button"
          class="time-bar-col"
          @click="openTimeBarSearch(item)"
        >
          <div class="time-bar-value">
            <MoneyText :value-minor="item.amountMinor" />
          </div>
          <div class="time-bar-track">
            <div
              class="time-bar-fill"
              :style="{ height: `${item.barHeightPercent}%`, background: timeBarColor }"
            ></div>
          </div>
          <div class="time-bar-label">{{ item.label }}</div>
          <div class="time-bar-count muted">{{ t('analysis_page.items_count', { count: item.count }) }}</div>
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import AnalysisIconizedChartPair from '@/ui/components/analysis/AnalysisIconizedChartPair.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listTransactionsForAnalysis } from '@/core/services/transaction-query.service'
import { useI18n } from '@/ui/services/i18n.service'
import { isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  buildAccountBalanceBreakdown,
  buildBarRows,
  buildBreakdownRows,
  buildTimeBarRows,
  isAddonBreakdownId,
  resolveTimeBarSearchRange,
} from '@/core/utils/analysis-breakdown'
import {
  ANALYSIS_CHART_SWATCHES,
  buildBudgetAchievementCards,
} from '@/core/utils/analysis-report'

const accountStore = useAccountStore()
const budgetStore = useBudgetStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const router = useRouter()
const { t } = useI18n()

const mode = ref('month')
const analysisType = ref('expense')
const accountAnalysisType = ref('expense')
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(monthKeyFromDate(new Date()))
const statsTransactions = ref([])

const categoryNameMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) map.set(category.id, category.name)
  return map
})

const categoryIconMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) map.set(category.id, String(category.icon ?? '').trim())
  return map
})

const accountNameMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) map.set(account.id, account.name)
  return map
})

const accountIconMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) map.set(account.id, String(account.icon ?? '').trim())
  return map
})

const accountBalanceMap = computed(() => {
  const map = new Map()
  for (const item of accountStore.balances) map.set(item.id, Number(item.balance_minor ?? 0))
  return map
})

const printLink = computed(() => {
  if (mode.value === 'year') {
    return { path: '/analysis/print', query: { mode: 'year', year: String(selectedYear.value) } }
  }
  if (mode.value === 'month') {
    return { path: '/analysis/print', query: { mode: 'month', month: selectedMonth.value } }
  }
  return { path: '/analysis/print', query: { mode: 'all' } }
})

watch(
  () => [ledgerStore.activeLedgerId, mode.value, selectedYear.value, selectedMonth.value],
  () => {
    void loadStatsTransactions()
  },
  { immediate: true },
)

const incomeBreakdown = computed(() => buildBreakdownRows({
  transactions: statsTransactions.value,
  type: 'income',
  scope: 'category',
  shouldIncludeTransaction: isCountableForIncomeExpense,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
  accountNameMap: accountNameMap.value,
  accountIconMap: accountIconMap.value,
  getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
  getUncategorizedLabel: () => t('analysis_page.uncategorized'),
  getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const expenseBreakdown = computed(() => buildBreakdownRows({
  transactions: statsTransactions.value,
  type: 'expense',
  scope: 'category',
  shouldIncludeTransaction: isCountableForIncomeExpense,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
  accountNameMap: accountNameMap.value,
  accountIconMap: accountIconMap.value,
  getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
  getUncategorizedLabel: () => t('analysis_page.uncategorized'),
  getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const incomeAccountBreakdown = computed(() => buildBreakdownRows({
  transactions: statsTransactions.value,
  type: 'income',
  scope: 'account',
  shouldIncludeTransaction: isCountableForIncomeExpense,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
  accountNameMap: accountNameMap.value,
  accountIconMap: accountIconMap.value,
  getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
  getUncategorizedLabel: () => t('analysis_page.uncategorized'),
  getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const expenseAccountBreakdown = computed(() => buildBreakdownRows({
  transactions: statsTransactions.value,
  type: 'expense',
  scope: 'account',
  shouldIncludeTransaction: isCountableForIncomeExpense,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
  accountNameMap: accountNameMap.value,
  accountIconMap: accountIconMap.value,
  getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
  getUncategorizedLabel: () => t('analysis_page.uncategorized'),
  getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const totalAccountBreakdown = computed(() => buildAccountBalanceBreakdown({
  accounts: accountStore.accounts,
  accountBalanceMap: accountBalanceMap.value,
  swatches: ANALYSIS_CHART_SWATCHES,
}))

const incomeTotalMinor = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const expenseTotalMinor = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const balanceMinor = computed(() => incomeTotalMinor.value - expenseTotalMinor.value)
const incomeCount = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.count, 0))
const expenseCount = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.count, 0))
const incomeBarRows = computed(() => buildBarRows(incomeBreakdown.value))
const expenseBarRows = computed(() => buildBarRows(expenseBreakdown.value))
const accountIncomeTotalMinor = computed(() => incomeAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountExpenseTotalMinor = computed(() => expenseAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountIncomeCount = computed(() => incomeAccountBreakdown.value.reduce((total, item) => total + item.count, 0))
const accountExpenseCount = computed(() => expenseAccountBreakdown.value.reduce((total, item) => total + item.count, 0))
const budgetCards = computed(() => buildBudgetAchievementCards({
  items: budgetStore.items,
  containers: budgetStore.containersWithStats,
  spentMap: budgetStore.spentMap,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
}))

const timeBarRows = computed(() => buildTimeBarRows({
  transactions: statsTransactions.value,
  type: analysisType.value,
  mode: mode.value,
  year: selectedYear.value,
  monthKey: selectedMonth.value,
  shouldIncludeTransaction: isCountableForIncomeExpense,
}))
const timeBarTitle = computed(() => {
  if (mode.value === 'year') return t('analysis_page.chart.month_bar')
  if (mode.value === 'all') return t('analysis_page.chart.year_bar')
  if (mode.value === 'month') return t('analysis_page.chart.day_bar')
  return ''
})
const timeBarTotalMinor = computed(() => timeBarRows.value.reduce((total, item) => total + item.amountMinor, 0))
const timeBarCount = computed(() => timeBarRows.value.reduce((total, item) => total + item.count, 0))
const showTimeBarChart = computed(() => (mode.value === 'all' || mode.value === 'year' || mode.value === 'month') && timeBarRows.value.length > 0)
const timeBarColor = computed(() =>
  analysisType.value === 'income'
    ? 'color-mix(in srgb, #40c057 82%, var(--card) 18%)'
    : 'color-mix(in srgb, #fa5252 82%, var(--card) 18%)',
)
const accountActiveBreakdown = computed(() => {
  if (accountAnalysisType.value === 'income') return incomeAccountBreakdown.value
  if (accountAnalysisType.value === 'expense') return expenseAccountBreakdown.value
  return totalAccountBreakdown.value
})
const accountTotalBalanceMinor = computed(() => totalAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountActiveTotalMinor = computed(() => {
  if (accountAnalysisType.value === 'income') return accountIncomeTotalMinor.value
  if (accountAnalysisType.value === 'expense') return accountExpenseTotalMinor.value
  return accountTotalBalanceMinor.value
})
const accountActiveCount = computed(() => {
  if (accountAnalysisType.value === 'income') return accountIncomeCount.value
  if (accountAnalysisType.value === 'expense') return accountExpenseCount.value
  return totalAccountBreakdown.value.length
})
const accountActiveBarRows = computed(() => buildBarRows(accountActiveBreakdown.value))
const accountActiveTypeLabel = computed(() =>
  accountAnalysisType.value === 'income'
    ? t('analysis_page.type.income')
    : accountAnalysisType.value === 'expense'
      ? t('analysis_page.type.expense')
      : t('analysis_page.type.total'),
)

function pickYear(value) {
  selectedYear.value = Number(value)
}

function pickMonth(value) {
  selectedMonth.value = value
}

function openCategoryBreakdownDetail(item, type = analysisType.value) {
  if (!item?.id) return
  const isAddon = isAddonBreakdownId(item.id)
  const query = {
    type,
    categoryId: isAddon ? '__addon__' : String(item.id),
    mode: mode.value,
    label: String(item.name ?? ''),
  }
  if (isAddon) query.addonId = String(item.id)
  if (mode.value === 'year') {
    query.year = String(selectedYear.value)
  } else if (mode.value === 'month') {
    query.month = String(selectedMonth.value)
  }
  void router.push({ name: 'analysis-category-detail', query })
}

function openAccountBreakdownDetail(item) {
  if (!item?.id) return
  if (String(item.id).startsWith('__')) return
  void router.push({ name: 'account-detail', params: { id: String(item.id) } })
}

function openTimeBarSearch(item) {
  const range = resolveTimeBarSearchRange({
    mode: mode.value,
    bucketId: item?.id,
    year: selectedYear.value,
    monthKey: selectedMonth.value,
  })
  if (!range) return
  void router.push({
    name: 'transaction-search',
    query: {
      startDay: range.startDay,
      endDay: range.endDay,
    },
  })
}

async function loadStatsTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    statsTransactions.value = []
    return
  }

  try {
    statsTransactions.value = await listTransactionsForAnalysis(ledgerId, {
      mode: mode.value,
      key: mode.value === 'year'
        ? String(selectedYear.value)
        : mode.value === 'month'
          ? selectedMonth.value
          : '',
    })
    const budgetMonthKey = mode.value === 'month' ? selectedMonth.value : monthKeyFromDate(new Date())
    await budgetStore.loadMonth(budgetMonthKey)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('analysis_page.toast.load_failed'), 'error')
  }
}
</script>

<style scoped>
.stack {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.analysis-page > *,
.analysis-page .row,
.analysis-page .picker-row,
.analysis-page .period-tabs,
.analysis-page .ledger-switcher-wrap {
  animation: none;
}

.stack > * {
  min-width: 0;
  max-width: 100%;
}

.panel {
  padding: 14px;
  min-width: 0;
  max-width: 100%;
}

h2, h3 {
  margin: 0;
}

.row {
  min-width: 0;
  flex-wrap: wrap;
}

.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-actions,
.header-metrics,
.budget-card-head,
.budget-stats {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-metrics,
.budget-stats {
  justify-content: space-between;
  width: 100%;
}

.mode-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.picker-wrap {
  margin-top: 10px;
}

.type-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.account-type-tabs {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.big-numbers,
.budget-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.budget-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
}

.big-card,
.budget-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 8px;
  background: color-mix(in srgb, var(--card) 90%, var(--surface-soft-accent) 10%);
}

.big-card.income {
  background: color-mix(in srgb, #40c057 10%, var(--card) 90%);
}

.big-card.expense {
  background: color-mix(in srgb, #fa5252 10%, var(--card) 90%);
}

.budget-card.over {
  border-color: color-mix(in srgb, #fa5252 45%, var(--field-border));
}

.budget-track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--chart-track);
}

.budget-fill {
  display: block;
  height: 100%;
  background: #4dabf7;
}

.budget-card.over .budget-fill {
  background: #fa5252;
}

.icon-swatch {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex: 0 0 auto;
}

.swatch-icon {
  width: 12px;
  height: 12px;
}

.count-chip {
  border: 1px solid var(--field-border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--muted);
}

.no-data-tip {
  margin: 12px 0 0;
}

.time-bar-chart {
  margin-top: 12px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(52px, 1fr);
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.time-bar-col {
  border: 0;
  background: transparent;
  color: inherit;
  display: grid;
  grid-template-rows: auto 120px auto auto;
  gap: 6px;
  align-items: end;
  min-width: 52px;
  cursor: pointer;
  padding: 0;
}

.time-bar-value {
  font-size: 11px;
  text-align: center;
  min-height: 1.2em;
}

.time-bar-track {
  height: 120px;
  border-radius: 12px 12px 8px 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 8%, var(--chart-track) 92%) 0%, var(--chart-track) 100%);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.time-bar-fill {
  width: 100%;
  border-radius: 10px 10px 6px 6px;
  min-height: 4px;
}

.time-bar-label,
.time-bar-count {
  text-align: center;
  font-size: 12px;
}

@media (max-width: 720px) {
  .big-numbers,
  .budget-grid {
    grid-template-columns: 1fr;
  }
}
</style>
