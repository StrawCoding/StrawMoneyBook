<template>
  <HabitatPageShell
    :title="t('analysis_page.title')"
    :kicker="t('analysis_page.habitat_hello')"
    test-id="analysis-view"
    hello-test-id="analysis-hello-block"
    root-class="analysis-modern"
    stack-class="analysis-page"
    stack-test-id="analysis-page"
    :stack-theme-aware="true"
  >
    <template #toolbar>
      <div class="analysis-toolbar toolbar-cluster" data-testid="analysis-toolbar">
        <button
          type="button"
          class="btn icon-btn toolbar-icon"
          :class="{ primary: exportingPdf, busy: exportingPdf }"
          data-testid="analysis-export-direct-btn"
          :disabled="exportingPdf"
          :aria-label="exportingPdf ? t('analysis_print.exporting') : t('analysis_print.export_pdf')"
          :title="exportingPdf ? t('analysis_print.exporting') : t('analysis_print.export_pdf')"
          @click="exportPdfDirect"
        >
          <font-awesome-icon icon="fa-solid fa-file-invoice-dollar" />
        </button>
        <RouterLink
          class="btn icon-btn toolbar-icon"
          data-testid="analysis-print-link"
          :to="reportPageTo"
          :aria-label="t('analysis_page.open_report')"
          :title="t('analysis_page.open_report')"
        >
          <font-awesome-icon icon="fa-solid fa-chart-column" />
        </RouterLink>
      </div>
    </template>

    <PeriodChrome
      chrome-test-id="analysis-period-chrome"
      id-prefix="analysis-period"
      :title="chromePeriodTitle"
      :can-step="canStepAnalysisPeriod"
      :sheet-title="t('home_page.period_filter', '調整期間')"
      :prev-label="t('home_page.period_prev')"
      :next-label="t('home_page.period_next')"
      @step="stepAnalysisPeriod"
    >
      <template #sheet>
        <div class="period-chrome-sheet-tabs" data-testid="analysis-period-filter">
          <button type="button" class="btn tab-btn" :class="{ primary: mode === 'all' }" @click="setAnalysisMode('all')">{{ t('analysis_page.mode.all') }}</button>
          <button type="button" class="btn tab-btn" :class="{ primary: mode === 'year' }" @click="setAnalysisMode('year')">{{ t('analysis_page.mode.year') }}</button>
          <button type="button" class="btn tab-btn" :class="{ primary: mode === 'month' }" @click="setAnalysisMode('month')">{{ t('analysis_page.mode.month') }}</button>
        </div>
        <div v-if="mode !== 'all'" class="period-chrome-sheet-picker">
          <HomeRangePicker v-if="mode === 'year'" mode="year" :year="selectedYear" class="picker-input" @update:year="pickYear" />
          <HomeRangePicker v-else mode="month" :month="selectedMonth" class="picker-input" @update:month="pickMonth" />
          <button type="button" class="btn quick-btn" @click="goCurrentAnalysisRange">
            {{ currentAnalysisRangeLabel }}
          </button>
        </div>
      </template>
      <template #below>
        <p
          v-if="exportedFilename"
          class="muted export-result"
          data-testid="analysis-export-result"
          :data-filename="exportedFilename"
          :data-page-count="String(exportedPageCount || '')"
          :data-light-pdf="exportedLightPdf ? '1' : '0'"
        >
          {{ t('analysis_print.file_label', { filename: exportedFilename }) }}
        </p>
        <div v-if="exportedUrl && exportedFilename" class="export-open-row">
          <button
            type="button"
            class="btn"
            data-testid="analysis-direct-open-file-btn"
            @click="openExportLink"
          >
            {{ t('analysis_print.open_link') }}
          </button>
        </div>
        <p
          v-if="lastExportError"
          class="muted export-result"
          data-testid="analysis-export-error"
        >
          {{ lastExportError }}
        </p>
      </template>
    </PeriodChrome>

    <PeriodContentTransition
      :content-key="analysisPeriodContentKey"
      :direction="periodShiftDirection"
      class="analysis-period-body"
    >
      <section class="analysis-flow-hero" data-testid="analysis-big-numbers">
        <div class="split-grid">
          <div class="split-card income">
            <small class="split-label">{{ t('analysis_page.type.income') }}</small>
            <MoneyText class="split-value" :value-minor="incomeTotalMinor" tone="income" />
          </div>
          <div class="split-card expense">
            <small class="split-label">{{ t('analysis_page.type.expense') }}</small>
            <MoneyText class="split-value" :value-minor="expenseTotalMinor" tone="expense" />
          </div>
        </div>
        <div class="balance-strip" :class="{ negative: balanceMinor < 0, positive: balanceMinor > 0 }">
          <span class="balance-label">{{ t('analysis_print.summary.balance') }}</span>
          <MoneyText :value-minor="balanceMinor" :tone="balanceMinor >= 0 ? 'income' : 'expense'" />
        </div>
      </section>

    <section class="analysis-flow-section" data-testid="analysis-income-section">
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
    </section>

    <section class="analysis-flow-section" data-testid="analysis-expense-section">
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
    </section>

    <section
      v-if="budgetCards.length"
      class="analysis-flow-section"
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
    </section>

    <section
      v-if="creditUtilRows.length"
      class="analysis-flow-section"
      data-testid="analysis-credit-section"
    >
      <header class="row analysis-section-head">
        <h3>{{ t('analysis_page.credit_title') }}</h3>
      </header>
      <div class="securities-summary-grid" role="list">
        <div class="securities-metric-row" role="listitem">
          <small class="muted metric-label">{{ t('analysis_page.credit_total_debt') }}</small>
          <MoneyText class="metric-value" :value-minor="creditTotalDebtMinor" tone="expense" />
        </div>
        <div class="securities-metric-row" role="listitem">
          <small class="muted metric-label">{{ t('analysis_page.credit_avg_util') }}</small>
          <span class="metric-value">{{ creditAvgUtilLabel }}</span>
        </div>
      </div>
      <ul class="securities-alloc-list">
        <li v-for="row in creditUtilRows" :key="row.id">
          <strong>{{ row.name }}</strong>
          <span class="muted">{{ row.utilLabel }}</span>
          <MoneyText :value-minor="row.debtMinor" tone="expense" />
        </li>
      </ul>
    </section>

    <section class="analysis-flow-section" data-testid="analysis-securities-section">
      <header class="row analysis-section-head">
        <h3>{{ t('analysis_page.securities_title') }}</h3>
        <span class="count-chip">{{ t('analysis_page.items_count', { count: securityStore.summary.count }) }}</span>
      </header>
      <div class="securities-summary-grid" role="list">
        <div class="securities-metric-row" role="listitem">
          <small class="muted metric-label">{{ displayValueLabel }}</small>
          <MoneyText class="metric-value" :value-minor="securityStore.summary.totalDisplayValueMinor" />
        </div>
        <div class="securities-metric-row" role="listitem">
          <small class="muted metric-label">{{ t('securities_page.invested') }}</small>
          <MoneyText class="metric-value" :value-minor="securityStore.summary.totalInvestedMinor" />
        </div>
        <div class="securities-metric-row" role="listitem">
          <small class="muted metric-label">{{ t('securities_page.delta') }}</small>
          <MoneyText class="metric-value" :value-minor="securityStore.summary.totalDeltaMinor" />
        </div>
      </div>
      <ul v-if="securityAllocationRows.length" class="securities-alloc-list">
        <li v-for="row in securityAllocationRows" :key="row.id" class="securities-alloc-row">
          <span>{{ row.label }}</span>
          <span class="row">
            <small class="muted">{{ row.percent }}%</small>
            <MoneyText :value-minor="row.amountMinor" />
          </span>
        </li>
      </ul>
      <p v-else class="muted no-data-tip">{{ t('analysis_page.securities_empty') }}</p>
    </section>

    <section class="analysis-flow-section" data-testid="analysis-account-section">
      <header class="row">
        <h3>{{ t('analysis_page.scope.account') }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: accountActiveCount }) }}</span>
          <MoneyText :value-minor="accountActiveTotalMinor" />
        </div>
      </header>

      <div class="segment-pills account-type-tabs" data-testid="analysis-account-type-filter">
        <button type="button" class="btn tab-btn" :class="{ primary: accountAnalysisType === 'total' }" @click="selectAccountAnalysisType('total')">
          {{ t('analysis_page.type.total') }}
        </button>
        <button type="button" class="btn tab-btn" :class="{ primary: accountAnalysisType === 'income' }" @click="selectAccountAnalysisType('income')">
          {{ t('analysis_page.type.income') }}
        </button>
        <button type="button" class="btn tab-btn" :class="{ primary: accountAnalysisType === 'expense' }" @click="selectAccountAnalysisType('expense')">
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
    </section>

    <section v-if="showTimeBarChart" class="analysis-flow-section" data-testid="analysis-time-section">
      <header class="row">
        <h3>{{ timeBarTitle }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: timeBarCount }) }}</span>
          <MoneyText :value-minor="timeBarTotalMinor" />
        </div>
      </header>

      <div class="segment-pills" data-testid="analysis-time-type-filter">
        <button type="button" class="btn tab-btn" :class="{ primary: analysisType === 'income' }" @click="analysisType = 'income'">{{ t('analysis_page.type.income') }}</button>
        <button type="button" class="btn tab-btn" :class="{ primary: analysisType === 'expense' }" @click="analysisType = 'expense'">{{ t('analysis_page.type.expense') }}</button>
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
    </section>
    </PeriodContentTransition>

    <div
      v-if="showExportCapture"
      class="analysis-export-capture-host"
      aria-hidden="true"
      data-testid="analysis-export-capture-host"
    >
      <AnalysisReportDocument
        ref="reportDocumentRef"
        :title="t('analysis_print.export_pdf')"
        :ledger-name="exportLedgerName"
        :period-label="exportPeriodLabel"
        :exported-at-label="exportedAtLabel"
        :currency-code="exportCurrencyCode"
        :filter-label="exportFilterLabel"
        :income-items="incomeBarRows"
        :expense-items="expenseBarRows"
        :account-items="exportAccountBarRows"
        :budget-cards="budgetCards"
        :detail-rows="exportDetailRows"
        :income-total-minor="incomeTotalMinor"
        :expense-total-minor="expenseTotalMinor"
        :income-count="incomeCount"
        :expense-count="expenseCount"
        :account-total-minor="exportAccountTotalMinor"
        :account-count="exportAccountCount"
      />
    </div>
  </HabitatPageShell>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import PeriodChrome from '@/ui/components/layout/PeriodChrome.vue'
import PeriodContentTransition from '@/ui/components/layout/PeriodContentTransition.vue'
import { usePeriodShiftDirection } from '@/ui/composables/usePeriodShiftDirection.js'
import { shiftMonthKey } from '@/ui/utils/home-period-shift.js'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import AnalysisIconizedChartPair from '@/ui/components/analysis/AnalysisIconizedChartPair.vue'
import AnalysisReportDocument from '@/ui/components/analysis/AnalysisReportDocument.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useSecurityStore } from '@/ui/stores/security.store'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useAnalysisCacheStore } from '@/ui/stores/analysis-cache.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { loadAnalysisStats } from '@/core/services/transaction-query.service'
import {
  createPdfBlobUrl,
  getLedgerTransactionsExportData,
  openFileUrl,
  revokeBlobUrl,
  savePdfFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import { buildAnalysisReportPdfFromElement } from '@/core/services/analysis-report-pdf.service'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import {
  getAnalysisAccountAnalysisType,
  setAnalysisAccountAnalysisType,
} from '@/ui/services/analysis-account-analysis-type.service.js'
import { isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  buildAccountBalanceBreakdown,
  buildBarRows,
  decorateBreakdownRows,
  mergeAddonSplitsIntoCategoryExpense,
  buildTimeBarRows,
  isAddonBreakdownId,
  resolveTimeBarSearchRange,
} from '@/core/utils/analysis-breakdown'
import {
  ANALYSIS_CHART_SWATCHES,
  buildAnalysisDetailRows,
  buildAnalysisReportPdfFilename,
  buildBudgetAchievementCards,
} from '@/core/utils/analysis-report'

const accountStore = useAccountStore()
const budgetStore = useBudgetStore()
const securityStore = useSecurityStore()
const creditStore = useCreditStore()

const creditUtilRows = computed(() => (creditStore.cards || [])
  .filter((c) => !c.account?.is_archived)
  .map((c) => ({
    id: c.account.id,
    name: c.account.name,
    debtMinor: c.debtMinor ?? 0,
    utilLabel: `${Math.round(Number(c.utilization ?? 0) * 100)}%`,
  })))

const creditTotalDebtMinor = computed(() => creditUtilRows.value.reduce((sum, row) => sum + Number(row.debtMinor ?? 0), 0))

const creditAvgUtilLabel = computed(() => {
  const cards = creditUtilRows.value
  if (!cards.length) return '0%'
  const totalLimit = (creditStore.cards || []).reduce((sum, c) => sum + Number(c.creditLimitMinor ?? 0), 0)
  if (totalLimit <= 0) return '—'
  return `${Math.round((creditTotalDebtMinor.value / totalLimit) * 100)}%`
})
const analysisCacheStore = useAnalysisCacheStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const router = useRouter()
const { t } = useI18n()

function formatDateTime(date) {
  return date.toLocaleString(resolveIntlLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const mode = ref('month')
const analysisType = ref('expense')
const accountAnalysisType = ref(getAnalysisAccountAnalysisType())

function selectAccountAnalysisType(type) {
  accountAnalysisType.value = setAnalysisAccountAnalysisType(type)
}
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(monthKeyFromDate(new Date()))
const analysisStats = ref({
  incomeCategory: [],
  expenseCategory: [],
  incomeAccount: [],
  expenseAccount: [],
  timeBarFacts: [],
  addonExpenseFacts: [],
})
const exportingPdf = ref(false)
const showExportCapture = ref(false)
const exportedFilename = ref('')
const exportedPageCount = ref(0)
const exportedUrl = ref('')
const exportedLightPdf = ref(false)
const lastExportError = ref('')
const exportedAtLabel = ref(formatDateTime(new Date()))
const exportDetailRows = ref([])
const reportDocumentRef = ref(null)

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

const exportLedgerName = computed(() => ledgerStore.activeLedger?.name || '')
const exportCurrencyCode = computed(() => String(ledgerStore.activeLedger?.currency_code ?? 'TWD'))
const exportPeriodLabel = computed(() => {
  if (mode.value === 'year') return `${t('analysis_print.mode.year')}｜${selectedYear.value}`
  if (mode.value === 'month') return `${t('analysis_print.mode.month')}｜${selectedMonth.value}`
  return t('analysis_print.all_hint')
})
const periodTitle = computed(() => exportPeriodLabel.value)
const chromePeriodTitle = computed(() => {
  if (mode.value === 'all') return t('home_page.all_transactions')
  if (mode.value === 'year') return t('home_page.year_display', { year: selectedYear.value })
  const [year, month] = String(selectedMonth.value ?? '').split('-')
  if (!year || !month) return '-'
  return t('home_page.month_display', { year, month })
})
const canStepAnalysisPeriod = computed(() => mode.value !== 'all')
const currentAnalysisRangeLabel = computed(() => (
  mode.value === 'year' ? t('home_page.current_year') : t('home_page.current_month')
))

const {
  periodShiftDirection,
  markPeriodShift,
  markPeriodShiftNeutral,
} = usePeriodShiftDirection()

const analysisPeriodContentKey = computed(() => {
  if (mode.value === 'all') return 'all'
  if (mode.value === 'year') return `year:${selectedYear.value}`
  return `month:${selectedMonth.value}`
})

function setAnalysisMode(nextMode) {
  markPeriodShiftNeutral()
  mode.value = nextMode
}

function stepAnalysisPeriod(delta) {
  const step = Number(delta)
  if (!Number.isFinite(step) || step === 0) return
  markPeriodShift(step)
  if (mode.value === 'year') {
    selectedYear.value += step
    return
  }
  if (mode.value === 'month') {
    selectedMonth.value = shiftMonthKey(selectedMonth.value, step)
  }
}

function goCurrentAnalysisRange() {
  markPeriodShiftNeutral()
  const now = new Date()
  selectedMonth.value = monthKeyFromDate(now)
  selectedYear.value = now.getFullYear()
}

function pickMonth(value) {
  markPeriodShiftNeutral()
  selectedMonth.value = value
}

function pickYear(value) {
  markPeriodShiftNeutral()
  selectedYear.value = Number(value)
}

const exportFilterLabel = computed(() => (mode.value === 'all' ? '' : exportPeriodLabel.value))
const reportPageTo = computed(() => {
  const query = { mode: mode.value === 'year' ? 'year' : mode.value === 'all' ? 'all' : 'month' }
  if (query.mode === 'year') query.year = String(selectedYear.value)
  if (query.mode === 'month') query.month = selectedMonth.value
  return { path: '/analysis/print', query }
})

watch(
  () => [ledgerStore.activeLedgerId, mode.value, selectedYear.value, selectedMonth.value],
  () => {
    void loadStatsTransactions()
  },
  { immediate: true },
)

const breakdownDecorateOptions = computed(() => ({
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
  accountNameMap: accountNameMap.value,
  accountIconMap: accountIconMap.value,
  getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
  getUncategorizedLabel: () => t('analysis_page.uncategorized'),
  getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
  swatches: ANALYSIS_CHART_SWATCHES,
}))

const incomeBreakdown = computed(() => decorateBreakdownRows(analysisStats.value.incomeCategory, {
  ...breakdownDecorateOptions.value,
  scope: 'category',
}))
const expenseBreakdown = computed(() => decorateBreakdownRows(
  mergeAddonSplitsIntoCategoryExpense(
    analysisStats.value.expenseCategory,
    analysisStats.value.addonExpenseFacts,
    (label) => t('analysis_page.addon_item', { label }),
  ),
  {
    ...breakdownDecorateOptions.value,
    scope: 'category',
  },
))
const incomeAccountBreakdown = computed(() => decorateBreakdownRows(analysisStats.value.incomeAccount, {
  ...breakdownDecorateOptions.value,
  scope: 'account',
}))
const expenseAccountBreakdown = computed(() => decorateBreakdownRows(analysisStats.value.expenseAccount, {
  ...breakdownDecorateOptions.value,
  scope: 'account',
}))
const totalAccountBreakdown = computed(() => buildAccountBalanceBreakdown({
  accounts: accountStore.accounts,
  accountBalanceMap: accountBalanceMap.value,
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const exportAccountBarRows = computed(() => buildBarRows(totalAccountBreakdown.value))
const exportAccountTotalMinor = computed(() => totalAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const exportAccountCount = computed(() => totalAccountBreakdown.value.length)

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

const securityAllocationRows = computed(() => {
  const rows = (securityStore.items ?? [])
    .map((item) => {
      const amountMinor = Math.max(0, Number(
        item?.position?.displayValueMinor
          ?? item?.position?.marketValueMinor
          ?? 0,
      ))
      return {
        id: item.id,
        label: `${item.symbol} ${item.name}`,
        amountMinor,
      }
    })
    .filter((row) => row.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor)
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)
  return rows.map((row) => ({
    ...row,
    percent: total > 0 ? Math.round((row.amountMinor / total) * 1000) / 10 : 0,
  }))
})

const displayValueLabel = computed(() => (
  securityStore.unrealizedMode === 'cost'
    ? t('securities_page.cost_value')
    : t('securities_page.market_value')
))

const timeBarRows = computed(() => buildTimeBarRows({
  transactions: analysisStats.value.timeBarFacts,
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

function resolveAnalysisFilterKey() {
  if (mode.value === 'year') return String(selectedYear.value)
  if (mode.value === 'month') return selectedMonth.value
  return ''
}

async function loadStatsTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    analysisStats.value = {
      incomeCategory: [],
      expenseCategory: [],
      incomeAccount: [],
      expenseAccount: [],
      timeBarFacts: [],
      addonExpenseFacts: [],
    }
    return
  }

  const filterKey = resolveAnalysisFilterKey()
  const cached = analysisCacheStore.takeStats(ledgerId, mode.value, filterKey)
  if (cached) {
    analysisStats.value = cached
  }

  try {
    analysisStats.value = await loadAnalysisStats(ledgerId, {
      mode: mode.value,
      key: filterKey,
    })
    analysisCacheStore.setStats(ledgerId, mode.value, filterKey, analysisStats.value)
    const budgetMonthKey = mode.value === 'month' ? selectedMonth.value : monthKeyFromDate(new Date())
    await Promise.all([
      budgetStore.loadMonth(budgetMonthKey),
      securityStore.load(),
      creditStore.load(),
    ])
  } catch (error) {
    if (!cached) {
      uiStore.pushToast(error.message ?? t('analysis_page.toast.load_failed'), 'error')
    }
  }
}

function buildExportOptions() {
  return {
    mode: mode.value,
    yearKey: String(selectedYear.value),
    monthKey: selectedMonth.value,
    dayKey: selectedMonth.value ? `${selectedMonth.value}-01` : monthKeyFromDate(new Date()),
    startDate: '',
    endDate: '',
  }
}

async function exportPdfDirect() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    uiStore.pushToast(t('analysis_print.toast.no_ledger'), 'error')
    return
  }

  exportingPdf.value = true
  lastExportError.value = ''
  exportedLightPdf.value = false
  exportedAtLabel.value = formatDateTime(new Date())
  showExportCapture.value = true

  try {
    const options = buildExportOptions()
    const reportData = await getLedgerTransactionsExportData(ledgerId, options)
    exportDetailRows.value = buildAnalysisDetailRows(reportData.records ?? [], {
      typeLabel: (type) => {
        if (type === 'income') return t('analysis_page.type.income')
        if (type === 'expense') return t('analysis_page.type.expense')
        if (type === 'transfer') return t('transaction_about.type.transfer')
        return t('transaction_about.type.adjustment')
      },
      uncategorizedLabel: t('analysis_page.uncategorized'),
      unassignedAccountLabel: t('analysis_page.unassigned_account'),
    })

    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const element = reportDocumentRef.value?.getElement?.()
      || document.querySelector('[data-testid="analysis-export-capture-host"] [data-testid="analysis-report-document"]')
      || document.getElementById('analysis-report-document')
    if (!element) {
      throw new Error(t('analysis_print.toast.preview_missing'))
    }
    const usedLightScheme = element.getAttribute('data-export-color-scheme') === 'light'

    const filename = buildAnalysisReportPdfFilename(options)
    const pdfFile = await buildAnalysisReportPdfFromElement(element, {
      ...options,
      filename,
      pageLabel: (page, total) => t('analysis_print.page_label', { page, total }),
    })

    exportedFilename.value = pdfFile.filename
    exportedPageCount.value = Number(pdfFile.pageCount ?? 0)
    exportedLightPdf.value = usedLightScheme

    const deviceSave = await savePdfFileToDevice(pdfFile.filename, pdfFile.blob, { category: 'analysis' })
    if (deviceSave.saved) {
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = String(deviceSave.uri ?? '').trim()
        || String(deviceSave.openUrl ?? '').trim()
        || createPdfBlobUrl(pdfFile.blob)
      uiStore.pushToast(t('analysis_print.toast.pdf_saved', {
        filename: exportedFilename.value,
        location: deviceSave.location || t('analysis_print.device_location_default'),
      }))
      return
    }

    revokeBlobUrl(exportedUrl.value)
    exportedUrl.value = createPdfBlobUrl(pdfFile.blob)
    triggerDownloadFromUrl(exportedUrl.value, pdfFile.filename)
    uiStore.pushToast(t('analysis_print.toast.pdf_downloaded', { filename: pdfFile.filename }))
  } catch (error) {
    lastExportError.value = String(error?.message ?? error ?? t('analysis_print.toast.export_failed'))
    uiStore.pushToast(lastExportError.value, 'error')
  } finally {
    showExportCapture.value = false
    exportingPdf.value = false
  }
}

function openExportLink() {
  if (!exportedUrl.value) return
  const opened = openFileUrl(exportedUrl.value)
  if (!opened && exportedFilename.value) {
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  }
}

onBeforeUnmount(() => {
  revokeBlobUrl(exportedUrl.value)
})
</script>

<style scoped>
.analysis-hello-block {
  display: grid;
  gap: 8px;
  padding: 2px 2px 4px;
}

.analysis-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.analysis-large-title {
  margin: 0;
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.12;
}

.analysis-habitat-hello {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}

.analysis-toolbar {
  flex-shrink: 0;
}

.toolbar-cluster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
}

.toolbar-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
}

.toolbar-icon.primary,
.toolbar-icon:hover {
  background: var(--habitat-selected-bg, color-mix(in srgb, var(--primary) 14%, var(--card) 86%));
  color: var(--text);
  border-color: var(--habitat-selected-line, transparent);
}

.analysis-period-chrome {
  display: grid;
  gap: 10px;
}

.analysis-period-body {
  display: grid;
  gap: 12px;
}

.period-title {
  margin: 0;
  text-align: center;
  font-size: clamp(20px, 5vw, 24px);
  font-weight: 700;
  letter-spacing: -0.03em;
}

.picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.picker-input {
  flex: 1;
  min-width: 0;
}

.analysis-hero-card {
  display: grid;
  gap: 10px;
}

.split-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.split-card {
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 6px;
}

.split-card.income {
  background: color-mix(in srgb, #40c057 10%, var(--card) 90%);
}

.split-card.expense {
  background: color-mix(in srgb, #fa5252 10%, var(--card) 90%);
}

.split-label {
  color: var(--muted);
  font-size: 12px;
}

.balance-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
}

.balance-label {
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}

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

.export-result {
  margin: 8px 0 0;
  font-size: 12px;
}

.export-open-row {
  margin-top: 8px;
}

.analysis-export-capture-host {
  position: fixed;
  left: -12000px;
  top: 0;
  width: 794px;
  pointer-events: none;
  opacity: 1;
  z-index: -1;
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

.budget-stats {
  justify-content: space-between;
  width: 100%;
}

.analysis-flow-section > header.row {
  flex-wrap: nowrap;
}

.analysis-flow-section > header.row h3 {
  flex: 1 1 auto;
  min-width: 0;
}

.analysis-flow-section > header.row .header-metrics,
.analysis-section-head .count-chip {
  width: auto;
  flex: 0 0 auto;
}

.analysis-flow-section > header.row .header-metrics {
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 8px;
}

.picker-wrap {
  margin-top: 0;
}

.segment-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.segment-pills .tab-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--bg-soft);
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
  box-shadow: none;
}

.segment-pills .tab-btn.primary {
  background: color-mix(in srgb, var(--primary) 16%, var(--card) 84%);
  color: var(--text);
  border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
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

.securities-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.securities-summary-grid > div {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: var(--input-bg);
  display: grid;
  gap: 4px;
}

.securities-alloc-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.securities-alloc-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--input-bg);
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
  background: var(--chart-track);
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
