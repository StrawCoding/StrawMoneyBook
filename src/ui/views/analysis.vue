<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('analysis_page.title') }}</h2>
        <div class="header-actions">
          <RouterLink class="btn icon-btn" :to="printLink">
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

    <article class="card panel">
      <header class="row">
        <h3>{{ t('analysis_page.type_analysis', { type: activeTypeLabel }) }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: activeCount }) }}</span>
          <MoneyText :value-minor="activeTotalMinor" />
        </div>
      </header>

      <div class="type-tabs">
        <button class="btn" :class="{ primary: analysisType === 'income' }" @click="analysisType = 'income'">{{ t('analysis_page.type.income') }}</button>
        <button class="btn" :class="{ primary: analysisType === 'expense' }" @click="analysisType = 'expense'">{{ t('analysis_page.type.expense') }}</button>
      </div>

      <transition name="fade-scale" mode="out-in">
        <div :key="analysisType">
          <template v-if="activeBreakdown.length">
            <div class="chart-wrap">
              <h4 class="chart-subtitle">{{ t('analysis_page.chart.pie') }}</h4>
            </div>
            <div class="chart-wrap">
              <div class="pie" :style="activePieStyle">
                <div class="pie-hole">
                  <div class="pie-total">{{ t('analysis_page.type_total', { type: activeTypeLabel }) }}</div>
                  <MoneyText :value-minor="activeTotalMinor" />
                </div>
              </div>
            </div>
            <div class="chart-wrap">
              <h4 class="chart-subtitle">{{ t('analysis_page.chart.bar') }}</h4>
            </div>
            <ul class="bar-chart-list">
              <li v-for="item in activeBarRows" :key="`${analysisType}-${item.id}-bar`">
                <button type="button" class="bar-chart-item-btn" @click="openCategoryBreakdownDetail(item)">
                  <div class="bar-chart-head">
                    <div class="bar-chart-label">
                      <span class="legend-dot" :style="{ background: item.color }"></span>
                      <span class="legend-icon-wrap">
                        <font-awesome-icon
                          v-if="item.icon"
                          :icon="item.icon"
                          class="legend-icon"
                        />
                      </span>
                      <span class="bar-chart-name">{{ item.name }}</span>
                    </div>
                    <span class="bar-chart-percent">{{ item.percent }}%</span>
                  </div>
                  <div class="bar-chart-track">
                    <span class="bar-chart-fill" :style="{ width: `${item.barWidthPercent}%`, background: item.color }"></span>
                  </div>
                  <div class="bar-chart-stats">
                    <MoneyText :value-minor="item.amountMinor" />
                    <span class="bar-chart-count">{{ t('analysis_page.items_count', { count: item.count }) }}</span>
                  </div>
                </button>
              </li>
            </ul>
          </template>
          <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: activeTypeLabel.toLowerCase() }) }}</p>
        </div>
      </transition>
    </article>

    <article class="card panel">
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

      <transition name="fade-scale" mode="out-in">
        <div :key="`account-${accountAnalysisType}`">
          <template v-if="accountActiveBreakdown.length">
            <div class="chart-wrap">
              <h4 class="chart-subtitle">{{ t('analysis_page.chart.pie') }}</h4>
            </div>
            <div class="chart-wrap">
              <div class="pie" :style="accountActivePieStyle">
                <div class="pie-hole">
                  <div class="pie-total">{{ t('analysis_page.type_total', { type: accountActiveTypeLabel }) }}</div>
                  <MoneyText :value-minor="accountActiveTotalMinor" />
                </div>
              </div>
            </div>
            <div class="chart-wrap">
              <h4 class="chart-subtitle">{{ t('analysis_page.chart.bar') }}</h4>
            </div>
            <ul class="bar-chart-list">
              <li v-for="item in accountActiveBarRows" :key="`account-${accountAnalysisType}-${item.id}-bar`">
                <button type="button" class="bar-chart-item-btn" @click="openAccountBreakdownDetail(item)">
                  <div class="bar-chart-head">
                    <div class="bar-chart-label">
                      <span class="legend-dot" :style="{ background: item.color }"></span>
                      <span class="legend-icon-wrap">
                        <font-awesome-icon
                          v-if="item.icon"
                          :icon="item.icon"
                          class="legend-icon"
                        />
                      </span>
                      <span class="bar-chart-name">{{ item.name }}</span>
                    </div>
                    <span class="bar-chart-percent">{{ item.percent }}%</span>
                  </div>
                  <div class="bar-chart-track">
                    <span class="bar-chart-fill" :style="{ width: `${item.barWidthPercent}%`, background: item.color }"></span>
                  </div>
                  <div class="bar-chart-stats">
                    <MoneyText :value-minor="item.amountMinor" />
                    <span class="bar-chart-count">{{ t('analysis_page.items_count', { count: item.count }) }}</span>
                  </div>
                </button>
              </li>
            </ul>
          </template>
          <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: accountActiveTypeLabel.toLowerCase() }) }}</p>
        </div>
      </transition>
    </article>

    <article v-if="showTimeBarChart" class="card panel">
      <header class="row">
        <h3>{{ timeBarTitle }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: timeBarCount }) }}</span>
          <MoneyText :value-minor="timeBarTotalMinor" />
        </div>
      </header>

      <div class="time-bar-chart">
        <div
          v-for="item in timeBarRows"
          :key="`${mode}-${analysisType}-${item.id}`"
          class="time-bar-col"
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
        </div>
      </div>
    </article>

  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listAllTransactions, listTransactionsByMonth, listTransactionsByYear } from '@/core/repositories/transaction.repo'
import { useI18n } from '@/ui/services/i18n.service'

const accountStore = useAccountStore()
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
const CHART_MULTI_COLOR_SWATCHES = [
  'color-mix(in srgb, #ff6b6b 82%, var(--card) 18%)',
  'color-mix(in srgb, #ffa94d 82%, var(--card) 18%)',
  'color-mix(in srgb, #ffd43b 82%, var(--card) 18%)',
  'color-mix(in srgb, #69db7c 82%, var(--card) 18%)',
  'color-mix(in srgb, #38d9a9 82%, var(--card) 18%)',
  'color-mix(in srgb, #4dabf7 82%, var(--card) 18%)',
  'color-mix(in srgb, #748ffc 82%, var(--card) 18%)',
  'color-mix(in srgb, #9775fa 82%, var(--card) 18%)',
  'color-mix(in srgb, #cc5de8 82%, var(--card) 18%)',
  'color-mix(in srgb, #f06595 82%, var(--card) 18%)',
  'color-mix(in srgb, #a9e34b 82%, var(--card) 18%)',
  'color-mix(in srgb, #66d9e8 82%, var(--card) 18%)',
]

const categoryNameMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) {
    map.set(category.id, category.name)
  }
  return map
})

const categoryIconMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) {
    map.set(category.id, String(category.icon ?? '').trim())
  }
  return map
})

const accountNameMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) {
    map.set(account.id, account.name)
  }
  return map
})

const accountIconMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) {
    map.set(account.id, String(account.icon ?? '').trim())
  }
  return map
})

const accountBalanceMap = computed(() => {
  const map = new Map()
  for (const item of accountStore.balances) {
    map.set(item.id, Number(item.balance_minor ?? 0))
  }
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

const incomeBreakdown = computed(() => buildBreakdown('income', 'category'))
const expenseBreakdown = computed(() => buildBreakdown('expense', 'category'))
const incomeAccountBreakdown = computed(() => buildBreakdown('income', 'account'))
const expenseAccountBreakdown = computed(() => buildBreakdown('expense', 'account'))
const totalAccountBreakdown = computed(() => buildAccountBalanceBreakdown())

const incomeTotalMinor = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const expenseTotalMinor = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const incomeCount = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.count, 0))
const expenseCount = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.count, 0))
const accountIncomeTotalMinor = computed(() => incomeAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountExpenseTotalMinor = computed(() => expenseAccountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountIncomeCount = computed(() => incomeAccountBreakdown.value.reduce((total, item) => total + item.count, 0))
const accountExpenseCount = computed(() => expenseAccountBreakdown.value.reduce((total, item) => total + item.count, 0))

const incomePieStyle = computed(() => buildPieStyle(incomeBreakdown.value))
const expensePieStyle = computed(() => buildPieStyle(expenseBreakdown.value))
const activeBreakdown = computed(() => (analysisType.value === 'income' ? incomeBreakdown.value : expenseBreakdown.value))
const activeTotalMinor = computed(() => (analysisType.value === 'income' ? incomeTotalMinor.value : expenseTotalMinor.value))
const activeCount = computed(() => (analysisType.value === 'income' ? incomeCount.value : expenseCount.value))
const activePieStyle = computed(() => (analysisType.value === 'income' ? incomePieStyle.value : expensePieStyle.value))
const activeBarRows = computed(() => buildBarRows(activeBreakdown.value))
const activeTypeLabel = computed(() => (analysisType.value === 'income' ? t('analysis_page.type.income') : t('analysis_page.type.expense')))
const timeBarRows = computed(() => buildTimeBarRows(
  statsTransactions.value,
  analysisType.value,
  mode.value,
  selectedYear.value,
  selectedMonth.value,
))
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
const accountActivePieStyle = computed(() => buildPieStyle(accountActiveBreakdown.value))
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

function openCategoryBreakdownDetail(item) {
  if (!item?.id) return
  const query = {
    type: analysisType.value,
    categoryId: String(item.id),
    mode: mode.value,
    label: String(item.name ?? ''),
  }
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

async function loadStatsTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    statsTransactions.value = []
    return
  }

  try {
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
    uiStore.pushToast(error.message ?? t('analysis_page.toast.load_failed'), 'error')
  }
}

function buildBreakdown(type, scope = 'category') {
  const map = new Map()
  for (const tx of statsTransactions.value) {
    if (!Number(tx.include_in_analysis ?? 1)) continue
    if (tx.type !== type || tx.origin_type === 'loan_payment') continue
    const key = scope === 'account'
      ? (tx.account_id || '__unassigned_account__')
      : (tx.category_id || '__uncategorized__')
    const amount = type === 'expense' ? Math.abs(Number(tx.amount_minor ?? 0)) : Number(tx.amount_minor ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const current = map.get(key) || { amountMinor: 0, count: 0 }
    current.amountMinor += amount
    current.count += 1
    map.set(key, current)
  }

  const rows = Array.from(map.entries())
    .map(([id, aggregate]) => ({
      id,
      amountMinor: aggregate.amountMinor,
      count: aggregate.count,
      name: resolveBreakdownName(id, scope),
      icon: resolveBreakdownIcon(id, scope),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor)

  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)
  if (!total) return []
  const palette = buildThemePalette(rows.length)

  return rows.map((row, index) => ({
    ...row,
    color: palette[index],
    percent: Math.round((row.amountMinor / total) * 100),
  }))
}

function buildAccountBalanceBreakdown() {
  const rows = accountStore.accounts
    .map((account) => {
      const balanceMinor = accountBalanceMap.value.get(account.id) ?? Number(account.opening_balance_minor ?? 0)
      return {
        id: account.id,
        amountMinor: Number(balanceMinor) || 0,
        magnitudeMinor: Math.abs(Number(balanceMinor) || 0),
        count: 1,
        name: account.name,
        icon: String(account.icon ?? '').trim(),
      }
    })
    .sort((a, b) => b.amountMinor - a.amountMinor)

  if (!rows.length) return []

  const totalMagnitude = rows.reduce((sum, row) => sum + row.magnitudeMinor, 0)
  const palette = buildThemePalette(rows.length)

  return rows.map((row, index) => ({
    ...row,
    color: palette[index],
    percent: totalMagnitude > 0 ? Math.round((row.magnitudeMinor / totalMagnitude) * 100) : 0,
  }))
}

function resolveBreakdownName(id, scope) {
  if (scope === 'account') {
    if (id === '__unassigned_account__') return t('analysis_page.unassigned_account')
    return accountNameMap.value.get(id) || t('analysis_page.unassigned_account')
  }
  if (id === '__uncategorized__') return t('analysis_page.uncategorized')
  return categoryNameMap.value.get(id) || t('analysis_page.uncategorized')
}

function resolveBreakdownIcon(id, scope) {
  if (scope === 'account') {
    if (id === '__unassigned_account__') return ''
    return accountIconMap.value.get(id) || ''
  }
  if (id === '__uncategorized__') return ''
  return categoryIconMap.value.get(id) || ''
}

function buildPieStyle(items) {
  if (!items.length) {
    return { background: 'conic-gradient(var(--chart-track) 0deg 360deg)' }
  }

  const total = items.reduce((sum, item) => sum + item.amountMinor, 0)
  let cursor = 0
  const segments = []

  for (const item of items) {
    const deg = (item.amountMinor / total) * 360
    const start = cursor
    const end = cursor + deg
    segments.push(`${item.color} ${start}deg ${end}deg`)
    cursor = end
  }

  return { background: `conic-gradient(${segments.join(', ')})` }
}

function buildThemePalette(count) {
  const safeCount = Math.max(1, Number(count) || 1)
  const palette = CHART_MULTI_COLOR_SWATCHES.slice(0, safeCount)
  if (palette.length >= safeCount) return palette

  for (let index = palette.length; index < safeCount; index += 1) {
    const hue = (index * 137.508) % 360
    palette.push(`color-mix(in srgb, hsl(${hue.toFixed(2)}deg 82% 62%) 82%, var(--card) 18%)`)
  }

  return palette
}

function buildBarRows(items) {
  const source = Array.isArray(items) ? items : []
  if (!source.length) return []

  const maxAmount = source.reduce((max, item) => {
    const value = Math.abs(Number(item?.magnitudeMinor ?? item?.amountMinor ?? 0) || 0)
    return Math.max(max, value)
  }, 0)
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    return source.map((item) => ({ ...item, barWidthPercent: 0 }))
  }

  return source.map((item) => {
    const amount = Math.abs(Number(item?.magnitudeMinor ?? item?.amountMinor ?? 0) || 0)
    const ratio = amount > 0 ? (amount / maxAmount) * 100 : 0
    const barWidthPercent = amount > 0 ? Math.max(8, Math.min(100, ratio)) : 0
    return {
      ...item,
      barWidthPercent: Number(barWidthPercent.toFixed(2)),
    }
  })
}

function buildTimeBarRows(transactions, type, modeValue, yearValue, monthValue) {
  if (!Array.isArray(transactions) || !transactions.length) return []
  if (modeValue !== 'all' && modeValue !== 'year' && modeValue !== 'month') return []

  const bucketSeed = modeValue === 'year'
    ? Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1).padStart(2, '0'),
      label: `${index + 1}月`,
    }))
    : modeValue === 'month'
      ? buildDaySeeds(monthValue)
    : buildYearSeeds(transactions)

  if (!bucketSeed.length) return []

  const bucketMap = new Map(
    bucketSeed.map((item) => [item.id, { ...item, amountMinor: 0, count: 0 }]),
  )

  for (const tx of transactions) {
    if (!Number(tx?.include_in_analysis ?? 1)) continue
    if (tx?.type !== type || tx?.origin_type === 'loan_payment') continue
    const amountMinor = type === 'expense' ? Math.abs(Number(tx?.amount_minor ?? 0)) : Number(tx?.amount_minor ?? 0)
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) continue

    const date = new Date(tx?.occurred_at ?? '')
    if (Number.isNaN(date.getTime())) continue

    const bucketId = modeValue === 'year'
      ? String(date.getMonth() + 1).padStart(2, '0')
      : modeValue === 'month'
        ? String(date.getDate()).padStart(2, '0')
      : String(date.getFullYear())
    const current = bucketMap.get(bucketId)
    if (!current) continue
    current.amountMinor += amountMinor
    current.count += 1
  }

  const rows = bucketSeed.map((item) => bucketMap.get(item.id) || { ...item, amountMinor: 0, count: 0 })
  const maxAmount = rows.reduce((max, item) => Math.max(max, item.amountMinor), 0)
  return rows.map((item) => ({
    ...item,
    year: modeValue === 'year' ? yearValue : undefined,
    month: modeValue === 'month' ? monthValue : undefined,
    barHeightPercent: maxAmount > 0
      ? Number(Math.max(item.amountMinor > 0 ? 12 : 0, (item.amountMinor / maxAmount) * 100).toFixed(2))
      : 0,
  }))
}

function buildYearSeeds(transactions) {
  const years = Array.from(new Set(
    transactions
      .map((tx) => {
        const date = new Date(tx?.occurred_at ?? '')
        return Number.isNaN(date.getTime()) ? null : date.getFullYear()
      })
      .filter((value) => Number.isFinite(value)),
  )).sort((left, right) => left - right)

  if (!years.length) return []
  const first = years[0]
  const last = years[years.length - 1]
  const seed = []
  for (let year = first; year <= last; year += 1) {
    seed.push({
      id: String(year),
      label: String(year),
    })
  }
  return seed
}

function buildDaySeeds(monthValue) {
  const text = String(monthValue ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{2})$/)
  if (!match) return []
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return []
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    return {
      id: String(day).padStart(2, '0'),
      label: `${day}日`,
    }
  })
}

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
</script>

<style scoped>
.stack {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: clip;
}

.stack > * {
  min-width: 0;
  max-width: 100%;
}

.panel {
  padding: 14px;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}
h2, h3 {
  margin: 0
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
  justify-content: center
}
.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}
.ai-btn {
  padding-inline: 12px;
}
.mode-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px
}
.picker-wrap {
  margin-top: 10px
}
.type-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.account-type-tabs {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.chart-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: center
}
.chart-subtitle {
  font-size: 14px;
  color: var(--muted);
  margin: 0
}
.pie {
  width: 220px;
  height: 220px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 8%, transparent)
}
.pie-hole {
  width: 128px;
  height: 128px;
  border-radius: 50%;
  background: var(--surface-popover);
  display: grid;
  place-items: center;
  text-align: center;
  gap: 2px
}
.pie-total {
  font-size: 12px;
  color: var(--muted)
}
.header-metrics {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.count-chip {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  max-width: 100%;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%
}
.legend-icon-wrap {
  width: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0
}
.legend-icon {
  font-size: 18px;
  color: var(--primary-soft)
}
.bar-chart-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.bar-chart-item-btn {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  display: grid;
  gap: 8px;
  text-align: left
}
.bar-chart-item-btn:hover {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border) 70%);
  background: color-mix(in srgb, var(--primary) 8%, transparent)
}
.bar-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px
}
.bar-chart-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0
}
.bar-chart-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--muted)
}
.bar-chart-percent {
  min-width: 42px;
  text-align: right;
  font-weight: 700
}
.bar-chart-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: var(--chart-track);
  overflow: hidden
}
.bar-chart-fill {
  height: 100%;
  display: block;
  border-radius: 999px;
  transition: width 220ms ease
}
.bar-chart-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px
}
.bar-chart-count {
  min-width: 36px;
  text-align: right
}
.no-data-tip {
  margin: 16px 0 0
}
.time-bar-chart {
  margin-top: 14px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.time-bar-col {
  min-width: 68px;
  flex: 0 0 68px;
  max-width: 68px;
  display: grid;
  gap: 8px;
  justify-items: center;
}
.time-bar-value {
  font-size: 11px;
  color: var(--muted);
  min-height: 32px;
  width: 100%;
  max-width: 100%;
  display: grid;
  align-items: end;
  text-align: center;
  overflow: hidden;
}
.time-bar-track {
  width: 100%;
  height: 180px;
  border-radius: 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--chart-track) 60%, transparent) 0%, var(--chart-track) 100%);
  display: flex;
  align-items: flex-end;
  padding: 6px;
}
.time-bar-fill {
  width: 100%;
  border-radius: 10px;
  min-height: 0;
  transition: height 220ms ease;
}
.time-bar-label {
  font-size: 12px;
  font-weight: 700;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time-bar-count {
  font-size: 11px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.placeholder {
  min-height: 120px
}</style>
