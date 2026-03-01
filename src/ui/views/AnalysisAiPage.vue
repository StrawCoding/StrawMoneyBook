<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>AI 綜合分析</h2>
        <RouterLink class="btn back-btn" to="/analysis">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted subtitle">用自動比較方式整理收入、支出與趨勢提醒。</p>

      <div class="mode-grid">
        <button class="btn" :class="{ primary: mode === 'year' }" @click="mode = 'year'">年</button>
        <button class="btn" :class="{ primary: mode === 'month' }" @click="mode = 'month'">月</button>
        <button class="btn" :class="{ primary: mode === 'day' }" @click="mode = 'day'">日</button>
        <button class="btn" :class="{ primary: mode === 'custom' }" @click="mode = 'custom'">自訂</button>
      </div>

      <div class="range-grid">
        <label v-if="mode === 'year'" class="field">
          年
          <input v-model.number="selectedYear" class="input" type="number" min="2000" max="2100" />
        </label>
        <label v-else-if="mode === 'month'" class="field">
          月
          <input v-model="selectedMonth" class="input" type="month" />
        </label>
        <label v-else-if="mode === 'day'" class="field">
          日
          <input v-model="selectedDay" class="input" type="date" />
        </label>
        <template v-else>
          <label class="field">
            起始日
            <input v-model="customStart" class="input" type="date" />
          </label>
          <label class="field">
            結束日
            <input v-model="customEnd" class="input" type="date" />
          </label>
        </template>
      </div>

      <button class="btn primary" :class="{ busy: loading }" :disabled="loading || blockedByMembership" @click="runAnalysis">
        {{ loading ? '分析中...' : '重新分析' }}
      </button>
      <p v-if="blockedByMembership" class="muted">免費版 AI 綜合分析每 7 天最多 1 次，會員可無限使用。</p>
    </article>

    <article v-if="analysisResult" class="card panel">
      <header class="row">
        <h3>{{ analysisResult.label }}</h3>
        <small class="muted">對比 {{ analysisResult.previousLabel }}</small>
      </header>

      <div class="metric-grid">
        <article class="metric-card">
          <small class="muted">收入</small>
          <MoneyText :value-minor="analysisResult.current.incomeMinor" />
          <small class="delta" :class="toneClass(analysisResult.delta.incomeMinor)">
            {{ formatDelta(analysisResult.delta.incomeMinor) }}
          </small>
        </article>
        <article class="metric-card">
          <small class="muted">支出</small>
          <MoneyText :value-minor="analysisResult.current.expenseMinor" />
          <small class="delta" :class="toneClass(analysisResult.delta.expenseMinor, true)">
            {{ formatDelta(analysisResult.delta.expenseMinor) }}
          </small>
        </article>
        <article class="metric-card">
          <small class="muted">結餘</small>
          <MoneyText :value-minor="analysisResult.current.netMinor" />
          <small class="delta" :class="toneClass(analysisResult.delta.netMinor)">
            {{ formatDelta(analysisResult.delta.netMinor) }}
          </small>
        </article>
      </div>

      <div class="chart-block">
        <div class="chart-row">
          <span>收入</span>
          <div class="track">
            <span class="fill income" :style="{ width: `${analysisResult.bar.incomeCurrent}%` }"></span>
          </div>
          <small class="muted">本期</small>
        </div>
        <div class="chart-row">
          <span>收入</span>
          <div class="track muted-track">
            <span class="fill previous" :style="{ width: `${analysisResult.bar.incomePrevious}%` }"></span>
          </div>
          <small class="muted">上期</small>
        </div>
        <div class="chart-row">
          <span>支出</span>
          <div class="track">
            <span class="fill expense" :style="{ width: `${analysisResult.bar.expenseCurrent}%` }"></span>
          </div>
          <small class="muted">本期</small>
        </div>
        <div class="chart-row">
          <span>支出</span>
          <div class="track muted-track">
            <span class="fill previous" :style="{ width: `${analysisResult.bar.expensePrevious}%` }"></span>
          </div>
          <small class="muted">上期</small>
        </div>
      </div>

      <div class="summary-block">
        <div class="summary-item">
          <small class="muted">本期最大支出分類</small>
          <strong>{{ analysisResult.current.topExpenseName || '無' }}</strong>
        </div>
        <div class="summary-item">
          <small class="muted">本期最大收入分類</small>
          <strong>{{ analysisResult.current.topIncomeName || '無' }}</strong>
        </div>
      </div>
    </article>

    <article v-if="analysisResult" class="card panel">
      <header class="row">
        <h3>AI 提醒</h3>
      </header>
      <ul class="insight-list">
        <li v-for="item in analysisResult.insights" :key="item">{{ item }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { listAllTransactions } from '@/core/repositories/transaction.repo'
import { assertCanUseAiAnalysis, recordAiAnalysisUsage } from '@/core/services/membership.service'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t } = useI18n()

const mode = ref(resolveInitialMode(route.query.mode))
const selectedYear = ref(Number(route.query.year) || new Date().getFullYear())
const selectedMonth = ref(resolveMonthInput(route.query.month))
const selectedDay = ref(resolveDayInput(route.query.day))
const customStart = ref(resolveDayInput(route.query.start))
const customEnd = ref(resolveDayInput(route.query.end))
const loading = ref(false)
const blockedByMembership = ref(false)
const analysisResult = ref(null)
const allTransactions = ref([])
const usageGranted = ref(false)

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    usageGranted.value = false
    blockedByMembership.value = false
    void runAnalysis()
  },
  { immediate: true },
)

watch(
  () => mode.value,
  () => {
    if (mode.value === 'month' && !selectedMonth.value) {
      selectedMonth.value = resolveMonthInput('')
    }
    if (mode.value === 'day' && !selectedDay.value) {
      selectedDay.value = resolveDayInput('')
    }
    if (mode.value === 'custom') {
      if (!customStart.value) customStart.value = resolveDayInput('')
      if (!customEnd.value) customEnd.value = customStart.value
    }
  },
)

function resolveInitialMode(value) {
  const text = String(value ?? '').trim()
  if (['year', 'month', 'day', 'custom'].includes(text)) return text
  return 'month'
}

function resolveMonthInput(value) {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(text)) return text
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function resolveDayInput(value) {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return new Date().toISOString().slice(0, 10)
}

function startOfDay(dateLike) {
  const date = new Date(dateLike)
  date.setHours(0, 0, 0, 0)
  return date
}

function endExclusiveOfDay(dateLike) {
  const date = startOfDay(dateLike)
  date.setDate(date.getDate() + 1)
  return date
}

function monthRange(monthKey) {
  const [year, month] = String(monthKey).split('-').map((item) => Number(item))
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  return { start, end, label: `${monthKey}` }
}

function yearRange(year) {
  const normalizedYear = Number(year) || new Date().getFullYear()
  const start = new Date(normalizedYear, 0, 1)
  const end = new Date(normalizedYear + 1, 0, 1)
  return { start, end, label: `${normalizedYear}年` }
}

function dayRange(dayKey) {
  const start = startOfDay(dayKey)
  const end = endExclusiveOfDay(dayKey)
  return { start, end, label: dayKey }
}

function customRange(startKey, endKey) {
  const rawStart = startOfDay(startKey)
  const rawEnd = endExclusiveOfDay(endKey)
  const start = rawStart.getTime() <= rawEnd.getTime() ? rawStart : startOfDay(endKey)
  const end = rawStart.getTime() <= rawEnd.getTime() ? rawEnd : endExclusiveOfDay(startKey)
  return { start, end, label: `${start.toISOString().slice(0, 10)} ~ ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}` }
}

function resolveActiveRange() {
  if (mode.value === 'year') return yearRange(selectedYear.value)
  if (mode.value === 'day') return dayRange(selectedDay.value)
  if (mode.value === 'custom') return customRange(customStart.value, customEnd.value)
  return monthRange(selectedMonth.value)
}

function resolvePreviousRange(currentRange) {
  const startMs = currentRange.start.getTime()
  const endMs = currentRange.end.getTime()
  const duration = Math.max(86400000, endMs - startMs)
  const previousEnd = new Date(startMs)
  const previousStart = new Date(startMs - duration)
  return {
    start: previousStart,
    end: previousEnd,
    label: `${previousStart.toISOString().slice(0, 10)} ~ ${new Date(previousEnd.getTime() - 1).toISOString().slice(0, 10)}`,
  }
}

function isInRange(tx, range) {
  const occurredMs = Date.parse(String(tx?.occurred_at ?? ''))
  if (!Number.isFinite(occurredMs)) return false
  return occurredMs >= range.start.getTime() && occurredMs < range.end.getTime()
}

function summarizeTransactions(rows) {
  let incomeMinor = 0
  let expenseMinor = 0
  const incomeMap = new Map()
  const expenseMap = new Map()

  for (const tx of rows) {
    if (!Number(tx.include_in_analysis ?? 1)) continue
    if (String(tx.origin_type ?? '') === 'loan_payment') continue
    const amountMinor = Number(tx.amount_minor ?? 0)
    if (tx.type === 'income' && amountMinor > 0) {
      incomeMinor += amountMinor
      const categoryId = String(tx.category_id ?? '')
      incomeMap.set(categoryId, (incomeMap.get(categoryId) ?? 0) + amountMinor)
    } else if (tx.type === 'expense' && amountMinor < 0) {
      const magnitude = Math.abs(amountMinor)
      expenseMinor += magnitude
      const categoryId = String(tx.category_id ?? '')
      expenseMap.set(categoryId, (expenseMap.get(categoryId) ?? 0) + magnitude)
    }
  }

  return {
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    topIncomeName: resolveTopCategoryName(incomeMap),
    topExpenseName: resolveTopCategoryName(expenseMap),
    topExpenseMinor: Math.max(...expenseMap.values(), 0),
  }
}

function resolveTopCategoryName(map) {
  let bestId = ''
  let bestValue = 0
  for (const [id, amount] of map.entries()) {
    if (amount > bestValue) {
      bestId = id
      bestValue = amount
    }
  }
  if (!bestId) return ''
  return categoryStore.categories.find((item) => item.id === bestId)?.name ?? '未分類'
}

function percentChange(current, previous) {
  const currentValue = Number(current) || 0
  const previousValue = Number(previous) || 0
  if (!previousValue) {
    if (!currentValue) return 0
    return 100
  }
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 100)
}

function buildBarMetrics(current, previous) {
  const maxValue = Math.max(
    1,
    Number(current.incomeMinor) || 0,
    Number(current.expenseMinor) || 0,
    Number(previous.incomeMinor) || 0,
    Number(previous.expenseMinor) || 0,
  )

  return {
    incomeCurrent: Math.max(8, Math.round((current.incomeMinor / maxValue) * 100)),
    incomePrevious: Math.max(8, Math.round((previous.incomeMinor / maxValue) * 100)),
    expenseCurrent: Math.max(8, Math.round((current.expenseMinor / maxValue) * 100)),
    expensePrevious: Math.max(8, Math.round((previous.expenseMinor / maxValue) * 100)),
  }
}

function buildInsights(current, previous) {
  const result = []
  const expenseRate = percentChange(current.expenseMinor, previous.expenseMinor)
  const incomeRate = percentChange(current.incomeMinor, previous.incomeMinor)
  const netRate = percentChange(current.netMinor, previous.netMinor)

  if (expenseRate > 10) {
    result.push(`本期支出比上期增加 ${expenseRate}% ，建議檢查大額支出與固定扣款。`)
  } else if (expenseRate < -10) {
    result.push(`本期支出比上期下降 ${Math.abs(expenseRate)}% ，控制支出有進步。`)
  }

  if (incomeRate > 10) {
    result.push(`本期收入比上期增加 ${incomeRate}% ，可考慮提高儲蓄或投資比例。`)
  } else if (incomeRate < -10) {
    result.push(`本期收入比上期減少 ${Math.abs(incomeRate)}% ，建議留意現金流。`)
  }

  if (current.netMinor < 0) {
    result.push('本期結餘為負，代表支出已高於收入，建議優先檢查可延後的消費。')
  } else if (netRate > 10) {
    result.push(`本期結餘比上期增加 ${netRate}% ，整體現金流更健康。`)
  }

  if (current.topExpenseName && current.expenseMinor > 0 && current.topExpenseMinor / current.expenseMinor >= 0.4) {
    result.push(`支出集中在「${current.topExpenseName}」，建議先從這個分類優化。`)
  }

  if (!result.length) {
    result.push('本期收支變化平穩，建議持續觀察固定支出與回饋收入。')
  }

  return result
}

function toneClass(deltaMinor, inverse = false) {
  const numeric = Number(deltaMinor) || 0
  if (!numeric) return ''
  const positive = inverse ? numeric < 0 : numeric > 0
  return positive ? 'good' : 'bad'
}

function formatDelta(value) {
  const numeric = Number(value) || 0
  if (!numeric) return '與上期持平'
  return `${numeric > 0 ? '+' : ''}${Math.round(numeric / 100) / 100}`
}

async function ensureUsageGranted() {
  if (usageGranted.value) return true
  try {
    assertCanUseAiAnalysis()
    recordAiAnalysisUsage()
    usageGranted.value = true
    blockedByMembership.value = false
    return true
  } catch (error) {
    blockedByMembership.value = true
    uiStore.pushToast(error.message ?? '目前無法使用 AI 綜合分析', 'error')
    return false
  }
}

async function runAnalysis() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || loading.value) return
  if (!await ensureUsageGranted()) return

  loading.value = true
  try {
    if (!categoryStore.categories.length) {
      await categoryStore.load().catch(() => null)
    }
    allTransactions.value = await listAllTransactions(ledgerId)

    const currentRange = resolveActiveRange()
    const previousRange = resolvePreviousRange(currentRange)
    const currentRows = allTransactions.value.filter((tx) => isInRange(tx, currentRange))
    const previousRows = allTransactions.value.filter((tx) => isInRange(tx, previousRange))
    const current = summarizeTransactions(currentRows)
    const previous = summarizeTransactions(previousRows)

    analysisResult.value = {
      label: currentRange.label,
      previousLabel: previousRange.label,
      current,
      previous,
      delta: {
        incomeMinor: current.incomeMinor - previous.incomeMinor,
        expenseMinor: current.expenseMinor - previous.expenseMinor,
        netMinor: current.netMinor - previous.netMinor,
      },
      bar: buildBarMetrics(current, previous),
      insights: buildInsights(current, previous),
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? '載入 AI 分析失敗', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await runAnalysis()
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

h2,
h3 {
  margin: 0;
}

.subtitle {
  margin: 0;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.metric-card {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 6px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
}

.delta {
  font-size: 12px;
}

.delta.good {
  color: var(--ok, #2f9e44);
}

.delta.bad {
  color: var(--danger-text);
}

.chart-block {
  display: grid;
  gap: 8px;
}

.chart-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: center;
}

.track {
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 72%, var(--card) 28%);
  overflow: hidden;
}

.muted-track {
  opacity: 0.8;
}

.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.fill.income {
  background: color-mix(in srgb, var(--ok, #2f9e44) 76%, var(--card) 24%);
}

.fill.expense {
  background: color-mix(in srgb, #fa5252 76%, var(--card) 24%);
}

.fill.previous {
  background: color-mix(in srgb, var(--primary) 56%, var(--card) 44%);
}

.summary-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 4px;
}

.insight-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}
</style>
