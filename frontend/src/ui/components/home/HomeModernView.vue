<template>
  <div class="view-root home-modern" data-testid="home-modern-view">
    <section class="stack">
      <article class="card ledger-card">
        <header class="row">
          <h3>{{ t('home_page.current_ledger') }}</h3>
        </header>
        <LedgerSwitcher class="ledger-switcher-wrap" />
        <div class="period-tabs">
          <button
            v-for="mode in filterModes"
            :key="mode.value"
            class="btn tab-btn"
            :class="{ primary: filterMode === mode.value }"
            @click="switchFilterMode(mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>
        <div class="row month-row">
          <span class="muted">{{ t('home_page.range_label') }}</span>
          <div class="all-range">{{ filterMode === 'all' ? t('home_page.all_transactions') : displayRange }}</div>
        </div>
        <transition name="collapse-fade">
          <div v-if="filterMode !== 'all'" class="picker-row">
            <transition name="fade-scale" mode="out-in">
              <HomeRangePicker
                v-if="filterMode === 'month'"
                key="month"
                mode="month"
                :month="selectedMonth"
                class="picker-input"
                @update:month="pickMonth"
              />
              <HomeRangePicker
                v-else-if="filterMode === 'day'"
                key="day"
                mode="day"
                :day="selectedDay"
                class="picker-input"
                @update:day="pickDay"
              />
              <HomeRangePicker
                v-else
                key="year"
                mode="year"
                :year="selectedYear"
                class="picker-input"
                @update:year="pickYear"
              />
            </transition>
            <button class="btn quick-btn" :disabled="budgetStore.loading" @click="goCurrentRange">
              {{ currentRangeLabel }}
            </button>
          </div>
        </transition>
      </article>

      <article class="card hero-card" data-testid="home-modern-hero">
        <p class="hero-label muted">{{ t('home_modern.disposable_balance') }}</p>
        <div class="hero-amount">
          <MoneyText :value-minor="monthlyNetMinor" />
        </div>
        <div class="kpi-chips">
          <span class="kpi-chip income">
            {{ t('transaction_search.label.income') }}
            <MoneyText :value-minor="incomeMinor" tone="income" />
          </span>
          <span class="kpi-chip expense">
            {{ t('transaction_search.label.expense') }}
            <MoneyText :value-minor="expenseMinor" tone="expense" />
          </span>
          <span class="kpi-chip budget">{{ t('home_modern.budget_kpi', { percent: budgetUsedPercent }) }}</span>
        </div>
      </article>

      <HomeAssetSummaryCard />
      <HomeBudgetSummaryCard />

      <article class="card budget-ring-card">
        <header class="row budget-ring-head">
          <h3>{{ t('home_modern.budget_progress') }}</h3>
          <RouterLink class="jump" to="/budget">{{ t('home_budget_summary.view') }}</RouterLink>
        </header>
        <div class="budget-ring-row">
          <BudgetMiniPie
            :ratio="budgetUsedRatio"
            :over="budgetOver"
            :percent-label="`${budgetUsedPercent}%`"
            :subtitle="t('home_budget_summary.used')"
            :size="84"
          />
          <div class="budget-remain">
            <small class="muted">{{ t('home_budget_summary.remain') }}</small>
            <div class="remain-value">
              <MoneyText :value-minor="budgetRemainMinor" />
            </div>
          </div>
        </div>
      </article>

      <div class="quick-row">
        <RouterLink class="quick-btn" :to="AI_BOOKKEEPING_PATH">
          <font-awesome-icon icon="fa-solid fa-wand-magic-sparkles" />
          <span>{{ t('bookkeeping.mode.ai') }}</span>
        </RouterLink>
        <RouterLink class="quick-btn" to="/einvoice-import">
          <font-awesome-icon icon="fa-solid fa-file-invoice" />
          <span>{{ t('home_modern.quick_einvoice') }}</span>
        </RouterLink>
        <RouterLink class="quick-btn" :to="transferQuickAddPath">
          <font-awesome-icon icon="fa-solid fa-arrow-right-arrow-left" />
          <span>{{ t('home_modern.quick_transfer') }}</span>
        </RouterLink>
        <RouterLink class="quick-btn" to="/analysis">
          <font-awesome-icon icon="fa-solid fa-chart-pie" />
          <span>{{ t('nav.analysis') }}</span>
        </RouterLink>
      </div>

      <article class="card asset-snapshot-card">
        <button type="button" class="snapshot-toggle row" @click="assetSnapshotOpen = !assetSnapshotOpen">
          <span>
            {{ t('home_modern.asset_snapshot') }}
            <strong><MoneyText :value-minor="totalAssetMinor" /></strong>
          </span>
          <font-awesome-icon
            icon="fa-solid fa-chevron-down"
            class="snapshot-chevron"
            :class="{ open: assetSnapshotOpen }"
          />
        </button>
        <div v-if="assetSnapshotOpen" class="snapshot-body">
          <div class="snapshot-line">
            <small class="muted">{{ t('assets_page.disposable') }}</small>
            <MoneyText :value-minor="disposableMinor" />
          </div>
          <div class="snapshot-line">
            <small class="muted">{{ t('assets_page.liability') }}</small>
            <MoneyText :value-minor="liabilityMinor" />
          </div>
          <RouterLink class="btn" to="/assets">{{ t('assets_page.view') }}</RouterLink>
        </div>
      </article>

      <HomeTransactionFeed />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import HomeAssetSummaryCard from '@/ui/components/home/HomeAssetSummaryCard.vue'
import HomeBudgetSummaryCard from '@/ui/components/home/HomeBudgetSummaryCard.vue'
import HomeTransactionFeed from '@/ui/components/home/HomeTransactionFeed.vue'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useHomePeriodFilter } from '@/ui/composables/useHomePeriodFilter'
import { AI_BOOKKEEPING_PATH } from '@/ui/services/bookkeeping-mode.service'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { calculateAssetSummary } from '@/core/utils/assets-summary'
import { getEffectiveTransactionAmountMinor, isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'

const ledgerStore = useLedgerStore()
const budgetStore = useBudgetStore()
const transactionStore = useTransactionStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const reimbursementStore = useReimbursementStore()
const uiStore = useUiStore()
const { t } = useI18n()

const {
  filterMode,
  selectedMonth,
  selectedDay,
  selectedYear,
  filterModes,
  displayRange,
  currentRangeLabel,
  switchFilterMode,
  goCurrentRange,
  pickMonth,
  pickDay,
  pickYear,
} = useHomePeriodFilter()

const assetSnapshotOpen = ref(false)
const transferQuickAddPath = '/transactions/quick-add?type=transfer'

const incomeMinor = computed(() => transactionStore.homeRecent
  .filter((tx) => isCountableForIncomeExpense(tx) && tx.type === 'income' && tx.origin_type !== 'loan_payment')
  .reduce((total, tx) => total + getEffectiveTransactionAmountMinor(tx), 0))

const expenseMinor = computed(() => transactionStore.homeRecent
  .filter((tx) => isCountableForIncomeExpense(tx) && tx.type === 'expense' && tx.origin_type !== 'loan_payment')
  .reduce((total, tx) => total + Math.abs(getEffectiveTransactionAmountMinor(tx)), 0))

const monthlyNetMinor = computed(() => incomeMinor.value - expenseMinor.value)

const budgetRemainMinor = computed(() => Number(budgetStore.remainMinor ?? 0))
const budgetUsedRatio = computed(() => {
  const budget = Math.max(0, Number(budgetStore.totalBudgetMinor ?? 0))
  if (budget <= 0) return 0
  const spent = Math.max(0, Number(budgetStore.totalSpentMinor ?? 0))
  return Math.min(1, spent / budget)
})
const budgetUsedPercent = computed(() => Math.round(budgetUsedRatio.value * 100))
const budgetOver = computed(() => budgetRemainMinor.value < 0)

const balanceMetrics = computed(() => calculateAssetSummary({
  balances: accountStore.balances,
  receivableMinor: loanStore.summary.totalReceivable,
  payableMinor: loanStore.summary.totalPayable,
  unreimbursedMinor: reimbursementStore.pendingTotalMinor,
}))
const disposableMinor = computed(() => balanceMetrics.value.disposableMinor)
const liabilityMinor = computed(() => balanceMetrics.value.liabilityMinor)
const totalAssetMinor = computed(() => balanceMetrics.value.totalAssetMinor)

watch(
  () => ledgerStore.activeLedgerId,
  (ledgerId) => {
    if (!ledgerId) return
    void syncModernHomeAssets()
  },
  { immediate: true },
)

async function syncModernHomeAssets() {
  try {
    await Promise.all([
      loanStore.load().catch(() => null),
      reimbursementStore.load().catch(() => null),
      accountStore.accounts.length ? Promise.resolve() : accountStore.load().catch(() => null),
    ])
  } catch (error) {
    uiStore.pushToast(error.message ?? t('home_page.toast.load_failed'), 'error')
  }
}
</script>

<style scoped>
.ledger-card {
  padding: 16px;
  background:
    radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 55%),
    var(--card);
}
.ledger-switcher-wrap {
  margin-top: 12px;
  position: relative;
  z-index: 20;
}
.month-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.period-tabs {
  margin-top: 14px;
  position: relative;
  z-index: 1;
  display: flex;
  gap: 6px;
  padding: 4px;
  background: var(--input-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.tab-btn {
  flex: 1;
  padding: 7px 0;
  border-radius: var(--radius-xs);
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: all var(--anim-fast) var(--anim-standard);
}
.tab-btn.primary {
  background: var(--btn-bg);
  color: var(--primary);
  border: 1px solid var(--border-strong);
  box-shadow: none;
}
.all-range {
  font-weight: 700;
  font-size: 15px;
}
.picker-row {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.picker-input {
  flex: 1;
}
.quick-btn {
  white-space: nowrap;
}
.hero-card {
  padding: 18px 16px;
  background:
    radial-gradient(ellipse at 0% 0%, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 60%),
    var(--card);
}
.hero-label {
  margin: 0;
  font-size: 13px;
}
.hero-amount {
  margin-top: 6px;
  font-size: clamp(28px, 7vw, 36px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.kpi-chips {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.kpi-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: var(--input-bg);
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
}
.kpi-chip.income {
  color: var(--income-dark);
}
.kpi-chip.expense {
  color: var(--expense-dark);
}
.budget-ring-card {
  padding: 14px 16px;
}
.budget-ring-head h3 {
  margin: 0;
  font-size: 15px;
}
.jump {
  color: var(--primary-soft);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}
.budget-ring-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.budget-remain .remain-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 700;
}
.quick-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.quick-row .quick-btn {
  display: grid;
  gap: 6px;
  justify-items: center;
  text-align: center;
  text-decoration: none;
  color: var(--text);
  padding: 12px 6px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  font-size: 11px;
  font-weight: 600;
}
.quick-row .quick-btn svg {
  font-size: 18px;
  color: var(--primary);
}
.asset-snapshot-card {
  padding: 0;
  overflow: hidden;
}
.snapshot-toggle {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
}
.snapshot-toggle strong {
  margin-left: 8px;
}
.snapshot-chevron {
  transition: transform var(--anim-fast) var(--anim-standard);
}
.snapshot-chevron.open {
  transform: rotate(180deg);
}
.snapshot-body {
  padding: 0 16px 14px;
  display: grid;
  gap: 10px;
}
.snapshot-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-soft);
}
</style>
