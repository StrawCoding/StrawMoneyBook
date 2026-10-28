<template>
  <div class="home-modern-overview">
    <section class="overview-hero" data-testid="home-budget-summary">
      <div class="hero-top">
        <div
          ref="modeSwitchEl"
          class="mode-switch"
          role="tablist"
          :style="modeGliderStyle"
        >
          <span class="mode-switch-glider" aria-hidden="true" />
          <button
            v-for="mode in displayModes"
            :key="mode.key"
            type="button"
            class="mode-chip"
            :class="{ active: displayMode === mode.key }"
            role="tab"
            :aria-selected="displayMode === mode.key"
            @click="setDisplayMode(mode.key)"
          >
            {{ mode.label }}
          </button>
        </div>
        <RouterLink class="hero-link" to="/budget">{{ t('home_budget_summary.view') }}</RouterLink>
      </div>

      <p v-if="isPayCycleMode && displayMode === 'monthly'" class="muted period-copy">
        {{ t('budgeting.period.pay_cycle_range', { start: budgetStore.period?.startDate, end: budgetStore.period?.endDate }) }}
      </p>

      <div class="hero-body" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <MoneyText class="hero-amount" :value-minor="activeMetrics.remainMinor" />
        <p class="hero-caption muted">
          {{ t('home_budget_summary.remain') }}
          · {{ t('home_budget_summary.used') }} {{ activeMetrics.usedPercentLabel }}
        </p>
        <div class="hero-progress" :class="{ over: activeMetrics.isOverBudget }">
          <span :style="{ width: `${Math.min(100, Math.round(activeMetrics.usedRatio * 100))}%` }" />
        </div>
        <div class="hero-meta muted">
          <span>{{ t('home_budget_summary.budget') }} <MoneyText :value-minor="activeMetrics.budgetMinor" /></span>
          <span>{{ t('home_budget_summary.used') }} <MoneyText :value-minor="activeMetrics.spentMinor" /></span>
        </div>
      </div>
    </section>

    <section class="overview-flow" data-testid="home-asset-summary">
      <div class="flow-row" data-testid="home-income-expense-split">
        <button
          type="button"
          class="flow-chip income"
          data-testid="home-income-block"
          :class="{ active: transactionStore.homeTypeFilter === 'income' }"
          @click="toggleTypeFilter('income')"
        >
          <span class="flow-label split-label">{{ t('transaction_search.label.income') }}</span>
          <span class="split-value flow-value"><MoneyText :value-minor="incomeMinor" /></span>
        </button>
        <button
          type="button"
          class="flow-chip expense"
          data-testid="home-expense-block"
          :class="{ active: transactionStore.homeTypeFilter === 'expense' }"
          @click="toggleTypeFilter('expense')"
        >
          <span class="flow-label split-label">{{ t('transaction_search.label.expense') }}</span>
          <span class="split-value flow-value"><MoneyText :value-minor="expenseMinor" /></span>
        </button>
      </div>
      <div class="drill-row">
        <RouterLink class="drill-link" to="/assets">
          {{ t('nav.assets') }}
          <span class="drill-value"><MoneyText :value-minor="netFlowMinor" /></span>
        </RouterLink>
        <RouterLink
          v-if="creditVisible"
          class="drill-link"
          to="/credit-cards"
          data-testid="home-credit-summary"
        >
          {{ t('credit_cards_page.home_card') }}
          <span v-if="creditNearLimit" class="warn-dot" :title="t('credit_cards_page.near_limit')" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useHomeBudgetSummaryMetrics } from '@/ui/composables/useHomeBudgetSummaryMetrics.js'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useCreditStore } from '@/ui/stores/credit.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
const {
  budgetStore,
  displayModes,
  displayMode,
  isPayCycleMode,
  modeMetrics,
  setDisplayMode,
  onTouchStart,
  onTouchEnd,
  t,
} = useHomeBudgetSummaryMetrics()

const transactionStore = useTransactionStore()
const creditStore = useCreditStore()
const ledgerStore = useLedgerStore()

const activeMetrics = computed(() => (
  displayMode.value === 'daily' ? modeMetrics.value.daily : modeMetrics.value.monthly
))

const incomeMinor = computed(() => transactionStore.homeIncomeMinor)
const expenseMinor = computed(() => transactionStore.homeExpenseMinor)
const netFlowMinor = computed(() => incomeMinor.value - expenseMinor.value)

const creditLoaded = ref(false)
const creditVisible = computed(() => creditStore.homeCardEnabled && creditLoaded.value)
const creditNearLimit = computed(() => (creditStore.cards || []).some((card) => card.nearLimit))

async function refreshCredit() {
  if (!ledgerStore.activeLedgerId) return
  await creditStore.load()
  creditLoaded.value = true
}

function toggleTypeFilter(type) {
  if (transactionStore.homeTypeFilter === type) {
    transactionStore.setHomeTypeFilter('all')
    return
  }
  transactionStore.setHomeTypeFilter(type)
}

const modeSwitchEl = ref(null)
const modeGliderX = ref(0)
const modeGliderW = ref(0)

const modeGliderStyle = computed(() => ({
  '--mode-glider-x': `${modeGliderX.value}px`,
  '--mode-glider-w': `${modeGliderW.value}px`,
}))

function syncModeGlider() {
  const root = modeSwitchEl.value
  if (!root) return
  const active = root.querySelector('.mode-chip.active')
  if (!active) return
  const rootRect = root.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  modeGliderX.value = activeRect.left - rootRect.left
  modeGliderW.value = activeRect.width
}

let modeGliderResizeObserver = null

onMounted(async () => {
  await refreshCredit()
  await nextTick(syncModeGlider)
  if (typeof ResizeObserver !== 'undefined' && modeSwitchEl.value) {
    modeGliderResizeObserver = new ResizeObserver(() => syncModeGlider())
    modeGliderResizeObserver.observe(modeSwitchEl.value)
  }
})

onUnmounted(() => {
  modeGliderResizeObserver?.disconnect()
  modeGliderResizeObserver = null
})

watch(displayMode, () => nextTick(syncModeGlider))
watch(displayModes, () => nextTick(syncModeGlider), { deep: true })
watch(() => ledgerStore.activeLedgerId, refreshCredit)
</script>

<style scoped>
.home-modern-overview {
  display: grid;
  gap: 12px;
}

.overview-hero {
  padding: 4px 2px 8px;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.mode-switch {
  position: relative;
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--input-bg);
  border: 1px solid var(--border);
}

.mode-switch-glider {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  width: var(--mode-glider-w, 0);
  border-radius: var(--radius-pill);
  background: var(--btn-bg);
  border: 1px solid var(--border-strong);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 8%, transparent);
  transform: translateX(var(--mode-glider-x, 0));
  transition:
    transform 280ms cubic-bezier(0.34, 1.15, 0.64, 1),
    width 280ms cubic-bezier(0.34, 1.15, 0.64, 1);
  pointer-events: none;
  z-index: 0;
}

.mode-chip {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: color 220ms ease, transform 120ms ease;
}

.mode-chip:active:not(.active) {
  transform: scale(0.97);
}

.mode-chip.active {
  color: var(--primary);
}

.hero-link {
  font-size: 13px;
  color: var(--primary-soft);
  text-decoration: none;
}

.period-copy {
  margin: 0 0 8px;
  font-size: 12px;
}

.hero-body {
  display: grid;
  gap: 6px;
}

.hero-amount {
  font-size: clamp(32px, 9vw, 40px);
  font-weight: 750;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.hero-caption {
  margin: 0;
  font-size: 13px;
}

.hero-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--input-bg);
  overflow: hidden;
}

.hero-progress span {
  display: block;
  height: 100%;
  background: var(--primary);
  border-radius: inherit;
  transition: width 220ms ease;
}

.hero-progress.over span {
  background: var(--danger, #c97b7b);
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
}

.overview-flow {
  display: grid;
  gap: 10px;
  padding-bottom: 4px;
}

.flow-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.flow-chip {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--input-bg);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
  color: var(--text);
}

.flow-chip.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 35%, transparent);
}

.flow-chip.income.active {
  background: color-mix(in srgb, var(--ok) 12%, var(--input-bg));
}

.flow-chip.expense.active {
  background: color-mix(in srgb, var(--danger, #c97b7b) 10%, var(--input-bg));
}

.flow-label {
  font-size: 12px;
  color: var(--muted);
}

.drill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
}

.drill-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--primary-soft);
  text-decoration: none;
}

.drill-value {
  color: var(--text);
  font-weight: 600;
}

.warn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b45309;
}
</style>
