<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('analysis_page.title') }}</h2>
        <RouterLink class="btn icon-btn" :to="printLink">
          <font-awesome-icon icon="fa-solid fa-print" />
        </RouterLink>
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
          <div class="chart-wrap">
            <div class="pie" :style="activePieStyle">
              <div class="pie-hole">
                <div class="pie-total">{{ t('analysis_page.type_total', { type: activeTypeLabel }) }}</div>
                <MoneyText :value-minor="activeTotalMinor" />
              </div>
            </div>
          </div>

          <ul class="legend-list">
            <li v-for="item in activeBreakdown" :key="`${analysisType}-${item.id}`">
              <button type="button" class="legend-item legend-btn" @click="openCategoryDetail(item)">
                <span class="legend-dot" :style="{ background: item.color }"></span>
                <span class="legend-icon-wrap">
                  <font-awesome-icon v-if="item.icon" :icon="item.icon" class="legend-icon" />
                </span>
                <span class="legend-label">{{ item.name }}</span>
                <MoneyText :value-minor="item.amountMinor" />
                <span class="legend-count">{{ t('analysis_page.items_count', { count: item.count }) }}</span>
                <span class="legend-percent">{{ item.percent }}%</span>
              </button>
            </li>
            <li v-if="activeBreakdown.length === 0" class="muted">{{ t('analysis_page.no_data_for_type', { type: activeTypeLabel.toLowerCase() }) }}</li>
          </ul>
        </div>
      </transition>
    </article>

  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listAllTransactions, listTransactionsByMonth, listTransactionsByYear } from '@/core/repositories/transaction.repo'
import { useI18n } from '@/ui/services/i18n.service'

const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const router = useRouter()
const { t } = useI18n()

const mode = ref('month')
const analysisType = ref('expense')
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(monthKeyFromDate(new Date()))
const statsTransactions = ref([])

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

const incomeBreakdown = computed(() => buildBreakdown('income'))
const expenseBreakdown = computed(() => buildBreakdown('expense'))

const incomeTotalMinor = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const expenseTotalMinor = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const incomeCount = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.count, 0))
const expenseCount = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.count, 0))

const incomePieStyle = computed(() => buildPieStyle(incomeBreakdown.value))
const expensePieStyle = computed(() => buildPieStyle(expenseBreakdown.value))
const activeBreakdown = computed(() => (analysisType.value === 'income' ? incomeBreakdown.value : expenseBreakdown.value))
const activeTotalMinor = computed(() => (analysisType.value === 'income' ? incomeTotalMinor.value : expenseTotalMinor.value))
const activeCount = computed(() => (analysisType.value === 'income' ? incomeCount.value : expenseCount.value))
const activePieStyle = computed(() => (analysisType.value === 'income' ? incomePieStyle.value : expensePieStyle.value))
const activeTypeLabel = computed(() => (analysisType.value === 'income' ? t('analysis_page.type.income') : t('analysis_page.type.expense')))

function pickYear(value) {
  selectedYear.value = Number(value)
}

function pickMonth(value) {
  selectedMonth.value = value
}

function openCategoryDetail(item) {
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

function buildBreakdown(type) {
  const map = new Map()
  for (const tx of statsTransactions.value) {
    if (!Number(tx.include_in_analysis ?? 1)) continue
    if (tx.type !== type || tx.origin_type === 'loan_payment') continue
    const key = tx.category_id || '__uncategorized__'
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
      name: id === '__uncategorized__' ? t('analysis_page.uncategorized') : categoryNameMap.value.get(id) || t('analysis_page.uncategorized'),
      icon: id === '__uncategorized__' ? '' : categoryIconMap.value.get(id) || '',
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

function buildThemePalette(count) {
  const safeCount = Math.max(1, Number(count) || 1)
  const darkVar = 'color-mix(in srgb, var(--primary) 88%, var(--text) 12%)'
  const lightVar = 'color-mix(in srgb, var(--primary) 20%, var(--card) 80%)'
  if (safeCount === 1) {
    return [darkVar]
  }

  const startDarkRatio = 92
  const endDarkRatio = 16
  const step = (startDarkRatio - endDarkRatio) / (safeCount - 1)

  return Array.from({ length: safeCount }, (_, index) => {
    const darkRatio = Math.max(
      endDarkRatio,
      Math.min(startDarkRatio, startDarkRatio - step * index),
    )
    const lightRatio = 100 - darkRatio
    return `color-mix(in srgb, ${darkVar} ${darkRatio.toFixed(2)}%, ${lightVar} ${lightRatio.toFixed(2)}%)`
  })
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

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center
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
.chart-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: center
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
.legend-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.legend-item {
  display: grid;
  grid-template-columns: auto 22px 1fr auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px
}
.legend-btn {
  width: 100%;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left
}
.legend-btn:hover {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--border) 70%);
  background: color-mix(in srgb, var(--primary) 8%, transparent)
}
.header-metrics {
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.count-chip {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border)
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
.legend-label {
  color: var(--muted)
}
.legend-percent {
  min-width: 42px;
  text-align: right;
  font-weight: 700
}
.legend-count {
  min-width: 36px;
  text-align: right;
  color: var(--muted);
  font-size: 12px
}
.placeholder {
  min-height: 120px
}</style>
