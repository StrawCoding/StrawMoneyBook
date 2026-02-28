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
        <h3>{{ t('analysis_page.scope_type_analysis', { type: activeTypeLabel, scope: activeScopeLabel }) }}</h3>
        <div class="header-metrics">
          <span class="count-chip">{{ t('analysis_page.items_count', { count: activeCount }) }}</span>
          <MoneyText :value-minor="activeTotalMinor" />
        </div>
      </header>

      <div class="type-tabs">
        <button class="btn" :class="{ primary: analysisType === 'income' }" @click="analysisType = 'income'">{{ t('analysis_page.type.income') }}</button>
        <button class="btn" :class="{ primary: analysisType === 'expense' }" @click="analysisType = 'expense'">{{ t('analysis_page.type.expense') }}</button>
      </div>

      <div class="scope-tabs">
        <button class="btn" :class="{ primary: analysisScope === 'category' }" @click="analysisScope = 'category'">
          {{ t('analysis_page.scope.category') }}
        </button>
        <button class="btn" :class="{ primary: analysisScope === 'account' }" @click="analysisScope = 'account'">
          {{ t('analysis_page.scope.account') }}
        </button>
      </div>

      <transition name="fade-scale" mode="out-in">
        <div :key="`${analysisType}-${analysisScope}`">
          <template v-if="activeBreakdown.length">
            <div class="chart-wrap">
              <h4 class="chart-subtitle">{{ t('analysis_page.chart.bar') }}</h4>
            </div>
            <ul class="bar-chart-list">
              <li v-for="item in activeBarRows" :key="`${analysisType}-${item.id}-bar`">
                <button type="button" class="bar-chart-item-btn" @click="openBreakdownDetail(item)">
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
const analysisScope = ref('category')
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

const incomeCategoryBreakdown = computed(() => buildBreakdown('income', 'category'))
const expenseCategoryBreakdown = computed(() => buildBreakdown('expense', 'category'))
const incomeAccountBreakdown = computed(() => buildBreakdown('income', 'account'))
const expenseAccountBreakdown = computed(() => buildBreakdown('expense', 'account'))

const incomeTotalMinor = computed(() => activeBreakdownBy('income').reduce((total, item) => total + item.amountMinor, 0))
const expenseTotalMinor = computed(() => activeBreakdownBy('expense').reduce((total, item) => total + item.amountMinor, 0))
const incomeCount = computed(() => activeBreakdownBy('income').reduce((total, item) => total + item.count, 0))
const expenseCount = computed(() => activeBreakdownBy('expense').reduce((total, item) => total + item.count, 0))

const activeBreakdown = computed(() => activeBreakdownBy(analysisType.value))
const activeTotalMinor = computed(() => (analysisType.value === 'income' ? incomeTotalMinor.value : expenseTotalMinor.value))
const activeCount = computed(() => (analysisType.value === 'income' ? incomeCount.value : expenseCount.value))
const activeBarRows = computed(() => buildBarRows(activeBreakdown.value))
const activeTypeLabel = computed(() => (analysisType.value === 'income' ? t('analysis_page.type.income') : t('analysis_page.type.expense')))
const activeScopeLabel = computed(() => (analysisScope.value === 'account' ? t('analysis_page.scope.account') : t('analysis_page.scope.category')))

function pickYear(value) {
  selectedYear.value = Number(value)
}

function pickMonth(value) {
  selectedMonth.value = value
}

function activeBreakdownBy(type) {
  if (analysisScope.value === 'account') {
    return type === 'income' ? incomeAccountBreakdown.value : expenseAccountBreakdown.value
  }
  return type === 'income' ? incomeCategoryBreakdown.value : expenseCategoryBreakdown.value
}

function openBreakdownDetail(item) {
  if (!item?.id) return
  if (analysisScope.value === 'account') {
    if (String(item.id).startsWith('__')) return
    void router.push({ name: 'account-detail', params: { id: String(item.id) } })
    return
  }
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

  const maxAmount = source.reduce((max, item) => Math.max(max, Number(item?.amountMinor ?? 0) || 0), 0)
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    return source.map((item) => ({ ...item, barWidthPercent: 0 }))
  }

  return source.map((item) => {
    const amount = Number(item?.amountMinor ?? 0) || 0
    const ratio = amount > 0 ? (amount / maxAmount) * 100 : 0
    const barWidthPercent = amount > 0 ? Math.max(8, Math.min(100, ratio)) : 0
    return {
      ...item,
      barWidthPercent: Number(barWidthPercent.toFixed(2)),
    }
  })
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
.scope-tabs {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
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
.placeholder {
  min-height: 120px
}</style>
