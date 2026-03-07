<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>AI 綜合分析</h2>
        <RouterLink class="btn back-btn" to="/analysis">{{ t('common.back') }}</RouterLink>
      </header>
      <p class="muted subtitle">用動態摘要快速看懂收支、支出集中度、預算狀態與 AI 建議。</p>

      <div class="mode-grid">
        <button class="btn" :class="{ primary: mode === 'all' }" @click="mode = 'all'">全部</button>
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
        <template v-else-if="mode === 'custom'">
          <label class="field">
            起始日
            <input v-model="customStart" class="input" type="date" />
          </label>
          <label class="field">
            結束日
            <input v-model="customEnd" class="input" type="date" />
          </label>
        </template>
        <div v-else class="field full-width">
          <span>範圍</span>
          <div class="range-hint">全部資料</div>
        </div>
      </div>

      <button class="btn primary" :class="{ busy: loading }" :disabled="loading || blockedByMembership" @click="runAnalysis">
        {{ loading ? '分析中...' : '重新分析' }}
      </button>
      <p v-if="blockedByMembership" class="muted">免費版 AI 綜合分析每 7 天最多 1 次，會員可無限使用。</p>
    </article>

    <article v-if="analysisResult" class="card panel story-shell">
      <header class="row story-head">
        <div class="story-title-wrap">
          <h3>{{ storyStage === 'summary' ? 'AI 總和頁' : currentStoryPage.title }}</h3>
          <p class="muted story-subtitle">{{ storyStage === 'summary' ? summarySubtitle : currentStoryPage.subtitle }}</p>
        </div>
        <div class="story-actions">
          <button v-if="storyStage !== 'summary'" type="button" class="btn" @click="skipToSummary">跳過動畫</button>
          <button v-else type="button" class="btn" @click="restartStory">重播</button>
        </div>
      </header>

      <transition name="story-scene" mode="out-in">
        <section v-if="storyStage !== 'summary'" :key="currentStoryPage.key" class="story-scene">
          <template v-if="currentStoryPage.kind === 'top-expense'">
            <div class="hero-badge">支出集中度</div>
            <div class="hero-line">目前支出最高的前五名分類</div>
            <ul class="top-list">
              <li v-for="(item, index) in analysisResult.current.topExpenseRows" :key="`${currentStoryPage.key}-${item.id}`" class="top-item">
                <div class="top-item-head">
                  <span class="rank-chip">#{{ index + 1 }}</span>
                  <div class="top-item-label">
                    <strong>{{ item.name }}</strong>
                    <small class="muted">{{ item.percent }}%</small>
                  </div>
                  <small class="top-item-value">{{ formatMinorText(item.amountMinor) }}</small>
                </div>
                <div class="story-track">
                  <span class="story-fill expense" :style="{ width: `${item.barWidthPercent}%` }"></span>
                </div>
              </li>
            </ul>
          </template>

          <template v-else-if="currentStoryPage.kind === 'cashflow'">
            <div class="metric-grid">
              <article class="metric-card">
                <small class="muted">收入</small>
                <MoneyText :value-minor="analysisResult.current.incomeMinor" />
                <small class="delta" :class="toneClass(analysisResult.delta.incomeMinor)">{{ deltaText(analysisResult.delta.incomeMinor) }}</small>
              </article>
              <article class="metric-card">
                <small class="muted">支出</small>
                <MoneyText :value-minor="analysisResult.current.expenseMinor" />
                <small class="delta" :class="toneClass(analysisResult.delta.expenseMinor, true)">{{ deltaText(analysisResult.delta.expenseMinor) }}</small>
              </article>
              <article class="metric-card">
                <small class="muted">結餘</small>
                <MoneyText :value-minor="analysisResult.current.netMinor" />
                <small class="delta" :class="toneClass(analysisResult.delta.netMinor)">{{ deltaText(analysisResult.delta.netMinor) }}</small>
              </article>
            </div>

            <div class="compare-grid">
              <div class="compare-row">
                <span>收入</span>
                <div class="story-track"><span class="story-fill income" :style="{ width: `${analysisResult.bar.incomeCurrent}%` }"></span></div>
                <small>本期</small>
              </div>
              <div class="compare-row">
                <span>收入</span>
                <div class="story-track muted-track"><span class="story-fill previous" :style="{ width: `${analysisResult.bar.incomePrevious}%` }"></span></div>
                <small>上期</small>
              </div>
              <div class="compare-row">
                <span>支出</span>
                <div class="story-track"><span class="story-fill expense" :style="{ width: `${analysisResult.bar.expenseCurrent}%` }"></span></div>
                <small>本期</small>
              </div>
              <div class="compare-row">
                <span>支出</span>
                <div class="story-track muted-track"><span class="story-fill previous" :style="{ width: `${analysisResult.bar.expensePrevious}%` }"></span></div>
                <small>上期</small>
              </div>
            </div>
          </template>

          <template v-else-if="currentStoryPage.kind === 'budget'">
            <div v-if="analysisResult.budget.hasBudget" class="budget-hero">
              <div class="budget-usage-ring" :style="budgetRingStyle">
                <div class="budget-usage-hole">
                  <strong>{{ analysisResult.budget.usedPercentLabel }}</strong>
                  <small class="muted">已使用</small>
                </div>
              </div>
              <div class="budget-detail-grid">
                <div class="summary-item">
                  <small class="muted">預算總額</small>
                  <MoneyText :value-minor="analysisResult.budget.totalBudgetMinor" />
                </div>
                <div class="summary-item">
                  <small class="muted">目前已用</small>
                  <MoneyText :value-minor="analysisResult.budget.totalSpentMinor" />
                </div>
                <div class="summary-item">
                  <small class="muted">剩餘</small>
                  <MoneyText :value-minor="analysisResult.budget.remainMinor" />
                </div>
                <div class="summary-item">
                  <small class="muted">超支分類</small>
                  <strong>{{ analysisResult.budget.overBudgetCount }} 個</strong>
                </div>
              </div>
            </div>
            <div v-else class="empty-story-card">
              <strong>{{ analysisResult.budget.label }}</strong>
              <p class="muted">{{ analysisResult.budget.emptyMessage }}</p>
            </div>
          </template>

          <template v-else>
            <div class="signal-list">
              <article v-for="item in analysisResult.signalCards" :key="item.title" class="signal-card">
                <small class="muted">{{ item.kicker }}</small>
                <strong>{{ item.title }}</strong>
                <p>{{ item.body }}</p>
              </article>
            </div>
          </template>
        </section>

        <section v-else key="summary" class="summary-screen">
          <article class="final-hero">
            <small class="muted">分析區間</small>
            <h3>{{ analysisResult.label }}</h3>
            <p class="muted">對比 {{ analysisResult.previousLabel }}</p>
          </article>

          <div class="metric-grid final-metric-grid">
            <article class="metric-card">
              <small class="muted">收入</small>
              <MoneyText :value-minor="analysisResult.current.incomeMinor" />
            </article>
            <article class="metric-card">
              <small class="muted">支出</small>
              <MoneyText :value-minor="analysisResult.current.expenseMinor" />
            </article>
            <article class="metric-card">
              <small class="muted">結餘</small>
              <MoneyText :value-minor="analysisResult.current.netMinor" />
            </article>
          </div>

          <div class="summary-grid">
            <article v-for="page in storyPages" :key="`summary-${page.key}`" class="summary-card">
              <small class="muted">{{ page.title }}</small>
              <ul class="summary-lines">
                <li v-for="line in page.detailLines" :key="`${page.key}-${line}`">{{ line }}</li>
              </ul>
            </article>
          </div>

          <article class="summary-card ai-advice-card">
            <small class="muted">AI 建議</small>
            <ul class="summary-lines">
              <li v-for="item in analysisResult.insights" :key="item">{{ item }}</li>
            </ul>
          </article>
        </section>
      </transition>

      <footer class="story-footer">
        <div class="story-pager" role="tablist" aria-label="AI 分析進度">
          <button
            v-for="(page, index) in storyPages"
            v-show="storyStage !== 'summary'"
            :key="`pager-${page.key}`"
            type="button"
            class="pager-dot"
            :class="{ active: storyIndex === index }"
            @click="goStoryIndex(index)"
          >
            <span></span>
          </button>
          <button
            v-show="storyStage === 'summary'"
            type="button"
            class="pager-dot active"
            aria-label="summary"
          >
            <span></span>
          </button>
        </div>

        <div class="story-footer-actions">
          <button v-if="storyStage !== 'summary'" type="button" class="btn" :disabled="storyIndex <= 0" @click="previousStoryPage">
            上一頁
          </button>
          <button type="button" class="btn primary" @click="advanceStory">
            {{ storyStage === 'summary' ? '重新分析' : storyIndex >= storyPages.length - 1 ? '查看總和頁' : '下一頁' }}
          </button>
        </div>
      </footer>
    </article>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { loadBudgetSnapshot } from '@/core/services/budget.service'
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
const storyIndex = ref(0)
const storyStage = ref('story')
const STORY_AUTOPLAY_INTERVAL_MS = 2200
let storyTimerId = 0

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
    if (mode.value === 'year' && !selectedYear.value) {
      selectedYear.value = new Date().getFullYear()
    }
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

watch(
  () => analysisResult.value,
  (next) => {
    if (!next) {
      stopStoryAutoplay()
      return
    }
    restartStory()
  },
)

const currentStoryPage = computed(() => storyPages.value[storyIndex.value] ?? storyPages.value[0] ?? createEmptyStoryPage())
const summarySubtitle = computed(() => {
  if (!analysisResult.value) return ''
  return `${analysisResult.value.label} 的完整總和頁，包含前面動畫的所有訊息與 AI 建議。`
})
const budgetRingStyle = computed(() => {
  const ratio = Math.max(0, Math.min(100, Number(analysisResult.value?.budget.usedPercent ?? 0)))
  return {
    background: `conic-gradient(color-mix(in srgb, var(--primary) 65%, var(--ok) 35%) 0% ${ratio}%, color-mix(in srgb, var(--field-border) 65%, var(--card) 35%) ${ratio}% 100%)`,
  }
})

const storyPages = computed(() => {
  const result = analysisResult.value
  if (!result) return []

  return [
    {
      key: 'top-expense',
      kind: 'top-expense',
      title: '支出前五名',
      subtitle: `這段期間最花錢的分類都集中在這裡。`,
      detailLines: result.current.topExpenseRows.length
        ? result.current.topExpenseRows.map((item, index) => `#${index + 1} ${item.name} ${formatMinorText(item.amountMinor)}（${item.percent}%）`)
        : ['這段期間沒有有效支出資料。'],
    },
    {
      key: 'cashflow',
      kind: 'cashflow',
      title: '收支對比',
      subtitle: `本期對比 ${result.previousLabel} 的現金流變化。`,
      detailLines: [
        `收入 ${formatMinorText(result.current.incomeMinor)}，變化 ${deltaText(result.delta.incomeMinor)}`,
        `支出 ${formatMinorText(result.current.expenseMinor)}，變化 ${deltaText(result.delta.expenseMinor)}`,
        `結餘 ${formatMinorText(result.current.netMinor)}，變化 ${deltaText(result.delta.netMinor)}`,
      ],
    },
    {
      key: 'budget',
      kind: 'budget',
      title: result.budget.label,
      subtitle: result.budget.scopeHint,
      detailLines: result.budget.hasBudget
        ? [
            `預算 ${formatMinorText(result.budget.totalBudgetMinor)}，已用 ${formatMinorText(result.budget.totalSpentMinor)}`,
            `剩餘 ${formatMinorText(result.budget.remainMinor)}，使用率 ${result.budget.usedPercentLabel}`,
            `超支分類 ${result.budget.overBudgetCount} 個`,
          ]
        : [result.budget.emptyMessage],
    },
    {
      key: 'signals',
      kind: 'signals',
      title: 'AI 提醒重點',
      subtitle: '把這次分析最值得先注意的地方整理成重點訊號。',
      detailLines: result.signalCards.map((item) => `${item.title}：${item.body}`),
    },
  ]
})

function createEmptyStoryPage() {
  return {
    key: 'empty',
    kind: 'signals',
    title: 'AI 綜合分析',
    subtitle: '',
    detailLines: [],
  }
}

function resolveInitialMode(value) {
  const text = String(value ?? '').trim()
  if (['all', 'year', 'month', 'day', 'custom'].includes(text)) return text
  return 'month'
}

function resolveMonthInput(value) {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(text)) return text
  return monthKeyFromDate(new Date())
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
  return { start, end, label: monthKey }
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
  return {
    start,
    end,
    label: `${start.toISOString().slice(0, 10)} ~ ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`,
  }
}

function allRange(rows) {
  const occurredValues = rows
    .map((tx) => Date.parse(String(tx?.occurred_at ?? '')))
    .filter((value) => Number.isFinite(value))
  if (!occurredValues.length) {
    return dayRange(resolveDayInput(''))
  }
  const minOccurred = Math.min(...occurredValues)
  const maxOccurred = Math.max(...occurredValues)
  return {
    start: startOfDay(minOccurred),
    end: endExclusiveOfDay(maxOccurred),
    label: '全部資料',
  }
}

function resolveActiveRange() {
  if (mode.value === 'all') return allRange(allTransactions.value)
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

  const topIncomeRows = buildCategoryRows(incomeMap)
  const topExpenseRows = buildCategoryRows(expenseMap)

  return {
    incomeMinor,
    expenseMinor,
    netMinor: incomeMinor - expenseMinor,
    topIncomeName: topIncomeRows[0]?.name ?? '',
    topExpenseName: topExpenseRows[0]?.name ?? '',
    topExpenseMinor: Number(topExpenseRows[0]?.amountMinor ?? 0),
    topIncomeRows: buildBarRows(topIncomeRows.slice(0, 3)),
    topExpenseRows: buildBarRows(topExpenseRows.slice(0, 5)),
  }
}

function buildCategoryRows(map) {
  const rows = Array.from(map.entries())
    .map(([id, amountMinor]) => ({
      id,
      amountMinor: Number(amountMinor) || 0,
      name: categoryNameOf(id),
    }))
    .filter((item) => item.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor)

  const total = rows.reduce((sum, item) => sum + item.amountMinor, 0)
  return rows.map((item) => ({
    ...item,
    percent: total > 0 ? Math.round((item.amountMinor / total) * 100) : 0,
  }))
}

function buildBarRows(items) {
  const source = Array.isArray(items) ? items : []
  const maxAmount = source.reduce((max, item) => Math.max(max, Number(item.amountMinor ?? 0) || 0), 0)
  if (!source.length || maxAmount <= 0) return source
  return source.map((item) => ({
    ...item,
    barWidthPercent: Math.max(12, Math.min(100, Math.round((Number(item.amountMinor ?? 0) / maxAmount) * 100))),
  }))
}

function categoryNameOf(categoryId) {
  const targetId = String(categoryId ?? '').trim()
  if (!targetId) return '未分類'
  return categoryStore.categories.find((item) => item.id === targetId)?.name ?? '未分類'
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

function buildInsights(current, previous, budget) {
  const result = []
  const expenseRate = percentChange(current.expenseMinor, previous.expenseMinor)
  const incomeRate = percentChange(current.incomeMinor, previous.incomeMinor)
  const netRate = percentChange(current.netMinor, previous.netMinor)

  if (expenseRate > 10) {
    result.push(`本期支出比上期增加 ${expenseRate}% ，建議先檢查高金額分類與固定扣款。`)
  } else if (expenseRate < -10) {
    result.push(`本期支出比上期下降 ${Math.abs(expenseRate)}% ，支出控制有進步。`)
  }

  if (incomeRate > 10) {
    result.push(`本期收入比上期增加 ${incomeRate}% ，可評估提高儲蓄或投資比例。`)
  } else if (incomeRate < -10) {
    result.push(`本期收入比上期減少 ${Math.abs(incomeRate)}% ，建議留意現金流安全水位。`)
  }

  if (current.netMinor < 0) {
    result.push('本期結餘為負，代表支出已高於收入，建議優先縮減可延後消費。')
  } else if (netRate > 10) {
    result.push(`本期結餘比上期增加 ${netRate}% ，整體現金流更健康。`)
  }

  if (current.topExpenseName && current.expenseMinor > 0 && current.topExpenseMinor / current.expenseMinor >= 0.4) {
    result.push(`支出高度集中在「${current.topExpenseName}」，先優化這個分類最有效。`)
  }

  if (budget.hasBudget && budget.usedPercent >= 90) {
    result.push(`預算使用率已達 ${budget.usedPercentLabel} ，建議減少非必要支出。`)
  } else if (budget.hasBudget && budget.usedPercent <= 60) {
    result.push(`目前預算仍有空間，可維持現有節奏並留意月底支出。`)
  } else if (!budget.hasBudget) {
    result.push('這個區間對應月份尚未設定預算，補上預算後 AI 建議會更準。')
  }

  if (!result.length) {
    result.push('本期收支變化平穩，建議持續觀察固定支出與高頻分類。')
  }

  return result
}

function buildSignalCards(current, previous, budget, insights) {
  return [
    {
      kicker: '現金流',
      title: current.netMinor < 0 ? '結餘轉負' : '結餘仍為正',
      body: current.netMinor < 0
        ? `本期結餘 ${formatMinorText(current.netMinor)}，需要優先收斂支出。`
        : `本期結餘 ${formatMinorText(current.netMinor)}，現金流仍維持正向。`,
    },
    {
      kicker: '支出焦點',
      title: current.topExpenseName || '尚未形成主要分類',
      body: current.topExpenseName
        ? `最大支出分類是 ${current.topExpenseName}，金額 ${formatMinorText(current.topExpenseMinor)}。`
        : '這段期間沒有有效支出資料。',
    },
    {
      kicker: '預算訊號',
      title: budget.hasBudget ? `${budget.usedPercentLabel} 已使用` : '尚未設定預算',
      body: budget.hasBudget
        ? `目前剩餘 ${formatMinorText(budget.remainMinor)}，超支分類 ${budget.overBudgetCount} 個。`
        : budget.emptyMessage,
    },
    {
      kicker: 'AI 建議',
      title: '先做這件事',
      body: insights[0] ?? '目前沒有明顯異常，持續觀察即可。',
    },
    {
      kicker: '對比上期',
      title: previous.netMinor ? '已有對比基準' : '上期資料偏少',
      body: previous.netMinor
        ? `收入、支出與結餘都已完成對比，可用來觀察變化趨勢。`
        : '上一期資料不足，這次建議以本期結構為主要觀察基準。',
    },
  ].slice(0, 4)
}

function toneClass(deltaMinor, inverse = false) {
  const numeric = Number(deltaMinor) || 0
  if (!numeric) return ''
  const positive = inverse ? numeric < 0 : numeric > 0
  return positive ? 'good' : 'bad'
}

function deltaText(value) {
  const numeric = Number(value) || 0
  if (!numeric) return '與上期持平'
  return `${numeric > 0 ? '+' : ''}${formatMinorText(numeric)}`
}

function formatMinorText(valueMinor) {
  const major = (Number(valueMinor) || 0) / 100
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(major)
}

function resolveBudgetMonthKey() {
  if (mode.value === 'month') return selectedMonth.value
  if (mode.value === 'day') return String(selectedDay.value ?? '').slice(0, 7)
  if (mode.value === 'custom') return String(customEnd.value ?? '').slice(0, 7) || String(customStart.value ?? '').slice(0, 7)
  if (mode.value === 'year') {
    const now = new Date()
    const month = selectedYear.value === now.getFullYear() ? now.getMonth() + 1 : 12
    return `${selectedYear.value}-${String(month).padStart(2, '0')}`
  }
  return monthKeyFromDate(new Date())
}

async function loadBudgetInsight(ledgerId) {
  const monthKey = resolveBudgetMonthKey()
  const scopeHint = mode.value === 'month' || mode.value === 'day'
    ? `${monthKey} 的預算使用情況`
    : `月預算資料以 ${monthKey} 作為代表月份`
  if (!monthKey) {
    return {
      label: '預算使用情況',
      scopeHint,
      hasBudget: false,
      emptyMessage: '目前沒有可用的月份預算資料。',
      totalBudgetMinor: 0,
      totalSpentMinor: 0,
      remainMinor: 0,
      usedPercent: 0,
      usedPercentLabel: '0%',
      overBudgetCount: 0,
    }
  }

  const snapshot = await loadBudgetSnapshot(ledgerId, monthKey).catch(() => null)
  const items = Array.isArray(snapshot?.items) ? snapshot.items : []
  if (!items.length) {
    return {
      label: `${monthKey} 預算`,
      scopeHint,
      hasBudget: false,
      emptyMessage: '這個月份尚未設定預算，所以目前無法評估預算使用情況。',
      totalBudgetMinor: 0,
      totalSpentMinor: 0,
      remainMinor: 0,
      usedPercent: 0,
      usedPercentLabel: '0%',
      overBudgetCount: 0,
    }
  }

  const budgetedCategoryIds = new Set(items.map((item) => String(item.category_id ?? '')).filter(Boolean))
  const budgetByCategory = new Map(
    items
      .map((item) => [String(item.category_id ?? ''), Number(item.resolved_amount_minor ?? item.amount_minor ?? 0) || 0]),
  )

  let totalBudgetMinor = 0
  let totalSpentMinor = 0
  let overBudgetCount = 0

  for (const item of items) {
    totalBudgetMinor += Number(item.resolved_amount_minor ?? item.amount_minor ?? 0) || 0
  }

  for (const row of snapshot?.spentRows ?? []) {
    const categoryId = String(row.category_id ?? '')
    if (!budgetedCategoryIds.has(categoryId)) continue
    const spentMinor = Math.abs(Number(row.spent_minor ?? 0) || 0)
    totalSpentMinor += spentMinor
    if (spentMinor > (budgetByCategory.get(categoryId) ?? 0)) {
      overBudgetCount += 1
    }
  }

  const remainMinor = totalBudgetMinor - totalSpentMinor
  const usedPercent = totalBudgetMinor > 0 ? Math.max(0, Math.round((totalSpentMinor / totalBudgetMinor) * 100)) : 0

  return {
    label: `${monthKey} 預算`,
    scopeHint,
    hasBudget: true,
    emptyMessage: '',
    totalBudgetMinor,
    totalSpentMinor,
    remainMinor,
    usedPercent,
    usedPercentLabel: `${usedPercent}%`,
    overBudgetCount,
  }
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
  stopStoryAutoplay()
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
    const budget = await loadBudgetInsight(ledgerId)
    const insights = buildInsights(current, previous, budget)

    analysisResult.value = {
      label: currentRange.label,
      previousLabel: previousRange.label,
      current,
      previous,
      budget,
      delta: {
        incomeMinor: current.incomeMinor - previous.incomeMinor,
        expenseMinor: current.expenseMinor - previous.expenseMinor,
        netMinor: current.netMinor - previous.netMinor,
      },
      bar: buildBarMetrics(current, previous),
      insights,
      signalCards: buildSignalCards(current, previous, budget, insights),
    }
  } catch (error) {
    uiStore.pushToast(error.message ?? '載入 AI 分析失敗', 'error')
  } finally {
    loading.value = false
  }
}

function stopStoryAutoplay() {
  if (storyTimerId) {
    window.clearTimeout(storyTimerId)
    storyTimerId = 0
  }
}

function scheduleStoryAutoplay() {
  stopStoryAutoplay()
  if (storyStage.value !== 'story' || !storyPages.value.length) return
  storyTimerId = window.setTimeout(() => {
    if (storyIndex.value >= storyPages.value.length - 1) {
      storyStage.value = 'summary'
      stopStoryAutoplay()
      return
    }
    storyIndex.value += 1
    scheduleStoryAutoplay()
  }, STORY_AUTOPLAY_INTERVAL_MS)
}

function restartStory() {
  storyStage.value = 'story'
  storyIndex.value = 0
  scheduleStoryAutoplay()
}

function skipToSummary() {
  stopStoryAutoplay()
  storyStage.value = 'summary'
}

function goStoryIndex(index) {
  const normalizedIndex = Math.max(0, Math.min(storyPages.value.length - 1, Number(index) || 0))
  storyStage.value = 'story'
  storyIndex.value = normalizedIndex
  scheduleStoryAutoplay()
}

function previousStoryPage() {
  if (storyStage.value !== 'story' || storyIndex.value <= 0) return
  storyIndex.value -= 1
  scheduleStoryAutoplay()
}

function advanceStory() {
  if (storyStage.value === 'summary') {
    void runAnalysis()
    return
  }
  if (storyIndex.value >= storyPages.value.length - 1) {
    skipToSummary()
    return
  }
  storyIndex.value += 1
  scheduleStoryAutoplay()
}

function monthKeyFromDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

onBeforeUnmount(() => {
  stopStoryAutoplay()
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

.subtitle,
.story-subtitle {
  margin: 0;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
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

.full-width {
  grid-column: 1 / -1;
}

.range-hint {
  min-height: 42px;
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  background: var(--input-bg);
  color: var(--text);
}

.story-shell {
  gap: 14px;
}

.story-head {
  align-items: flex-start;
}

.story-title-wrap {
  display: grid;
  gap: 4px;
}

.story-actions {
  display: inline-flex;
  gap: 8px;
}

.story-scene {
  display: grid;
  gap: 14px;
}

.hero-badge {
  display: inline-flex;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--primary) 38%, transparent);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary-soft);
  font-size: 12px;
}

.hero-line {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.35;
}

.top-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.top-item,
.signal-card,
.summary-card,
.metric-card,
.summary-item,
.empty-story-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  padding: 12px;
}

.top-item-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.rank-chip {
  min-width: 36px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-soft);
  font-size: 12px;
  font-weight: 700;
}

.top-item-label {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.top-item-value {
  font-weight: 700;
}

.story-track {
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 72%, var(--card) 28%);
  overflow: hidden;
  margin-top: 10px;
}

.story-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.story-fill.expense {
  background: linear-gradient(90deg, #ff6b6b 0%, #ff922b 100%);
}

.story-fill.income {
  background: linear-gradient(90deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 58%, #9be15d 42%) 100%);
}

.story-fill.previous {
  background: color-mix(in srgb, var(--primary) 56%, var(--card) 44%);
}

.muted-track {
  opacity: 0.82;
}

.metric-grid,
.summary-grid,
.budget-detail-grid,
.signal-list {
  display: grid;
  gap: 10px;
}

.metric-grid,
.summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.final-metric-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-card {
  display: grid;
  gap: 6px;
}

.delta {
  font-size: 12px;
}

.delta.good {
  color: var(--ok);
}

.delta.bad {
  color: var(--danger-text);
}

.compare-grid {
  display: grid;
  gap: 10px;
}

.compare-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 34px;
  gap: 8px;
  align-items: center;
}

.budget-hero {
  display: grid;
  grid-template-columns: 152px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.budget-usage-ring {
  width: 152px;
  height: 152px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.budget-usage-hole {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: var(--surface-popover);
  display: grid;
  place-items: center;
  text-align: center;
}

.summary-item {
  display: grid;
  gap: 4px;
}

.empty-story-card {
  display: grid;
  gap: 6px;
}

.signal-card {
  display: grid;
  gap: 6px;
}

.signal-card p {
  margin: 0;
  line-height: 1.5;
}

.final-hero {
  border-radius: 18px;
  padding: 16px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 18%, transparent), transparent 42%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--ok) 16%, transparent), transparent 44%),
    color-mix(in srgb, var(--card) 84%, var(--surface-soft-accent) 16%);
  border: 1px solid var(--field-border);
}

.final-hero p {
  margin: 4px 0 0;
}

.summary-lines {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 8px;
}

.ai-advice-card {
  background: color-mix(in srgb, var(--card) 82%, var(--surface-ok) 18%);
}

.story-footer {
  display: grid;
  gap: 12px;
}

.story-pager {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.pager-dot {
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
}

.pager-dot span {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 45%, transparent);
  transition: width var(--anim-fast) ease, background-color var(--anim-fast) ease;
}

.pager-dot.active span {
  width: 22px;
  background: var(--primary);
}

.story-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.story-scene-enter-active,
.story-scene-leave-active {
  transition: opacity var(--anim-mid) ease, transform var(--anim-mid) var(--anim-spring);
}

.story-scene-enter-from,
.story-scene-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.985);
}

@media (max-width: 720px) {
  .mode-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .range-grid,
  .metric-grid,
  .summary-grid,
  .final-metric-grid,
  .budget-hero {
    grid-template-columns: 1fr;
  }

  .budget-usage-ring {
    margin: 0 auto;
  }

  .story-footer-actions {
    justify-content: stretch;
  }

  .story-footer-actions .btn {
    flex: 1;
  }
}
</style>
