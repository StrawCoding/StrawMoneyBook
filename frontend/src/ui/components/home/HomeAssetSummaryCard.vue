<template>
  <article class="hero-card card">
    <!-- Header row -->
    <header class="card-head">
      <h3 class="card-title">{{ title }}</h3>
      <RouterLink class="view-link" to="/assets">
        {{ t('assets_page.view') }}
        <font-awesome-icon icon="fa-solid fa-arrow-right" class="view-arrow" />
      </RouterLink>
    </header>

    <!-- Income / Expense split — backgrounds follow theme tokens (Light / Dark) -->
    <div class="split-grid" data-testid="home-income-expense-split">
      <button
        type="button"
        class="split-card income"
        data-testid="home-income-block"
        :class="{ active: transactionStore.homeTypeFilter === 'income' }"
        @click="toggleTypeFilter('income')"
      >
        <div class="split-card-inner">
          <div class="split-icon income-icon">
            <font-awesome-icon icon="fa-solid fa-arrow-trend-up" />
          </div>
          <div class="split-info">
            <div class="split-label">{{ t('transaction_search.label.income') }}</div>
            <div class="split-value income-value">
              <MoneyText :value-minor="incomeMinor" />
            </div>
          </div>
        </div>
        <div v-if="transactionStore.homeTypeFilter === 'income'" class="active-ring" />
      </button>

      <button
        type="button"
        class="split-card expense"
        data-testid="home-expense-block"
        :class="{ active: transactionStore.homeTypeFilter === 'expense' }"
        @click="toggleTypeFilter('expense')"
      >
        <div class="split-card-inner">
          <div class="split-icon expense-icon">
            <font-awesome-icon icon="fa-solid fa-arrow-trend-down" />
          </div>
          <div class="split-info">
            <div class="split-label">{{ t('transaction_search.label.expense') }}</div>
            <div class="split-value expense-value">
              <MoneyText :value-minor="expenseMinor" />
            </div>
          </div>
        </div>
        <div v-if="transactionStore.homeTypeFilter === 'expense'" class="active-ring expense-ring" />
      </button>
    </div>

    <!-- Balance row -->
    <div class="balance-strip" :class="{ negative: balanceMinor < 0, positive: balanceMinor > 0 }">
      <div class="balance-left">
        <span class="balance-dot" />
        <span class="balance-label">{{ t('home_asset_summary.balance_label') }}</span>
      </div>
      <strong class="balance-value">
        <MoneyText :value-minor="balanceMinor" />
      </strong>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useI18n } from '@/ui/services/i18n.service'

const transactionStore = useTransactionStore()
const { t } = useI18n()

const title = computed(() => {
  if (transactionStore.homeFilterMode === 'all') return t('home_asset_summary.title_all')
  if (transactionStore.homeFilterMode === 'year') {
    return t('home_asset_summary.title_year', { year: transactionStore.homeFilterKey })
  }
  if (transactionStore.homeFilterMode === 'day') {
    return t('home_asset_summary.title_day', { day: transactionStore.homeFilterKey })
  }
  if (transactionStore.homeFilterMode === 'month') {
    const [year, month] = String(transactionStore.homeFilterKey).split('-')
    if (year && month) return t('home_asset_summary.title_month', { year, month })
  }
  return t('home_asset_summary.title_current')
})

const incomeMinor = computed(() => transactionStore.homeIncomeMinor)

const expenseMinor = computed(() => transactionStore.homeExpenseMinor)

const balanceMinor = computed(() => incomeMinor.value - expenseMinor.value)

function toggleTypeFilter(type) {
  if (transactionStore.homeTypeFilter === type) {
    transactionStore.setHomeTypeFilter('all')
    return
  }
  transactionStore.setHomeTypeFilter(type)
}
</script>

<style scoped>
.hero-card {
  padding: 16px;
  background:
    radial-gradient(ellipse at 0% 0%, color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 60%),
    radial-gradient(ellipse at 100% 100%, color-mix(in srgb, var(--ok) 8%, transparent) 0%, transparent 55%),
    var(--card);
  border-color: var(--border-strong);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-soft);
  letter-spacing: 0.01em;
}

.view-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  color: var(--primary-soft);
  font-size: 12px;
  font-weight: 600;
  transition: color var(--anim-fast) var(--anim-standard);
}

.view-link:active {
  color: var(--primary);
}

.view-arrow {
  font-size: 10px;
}

/* Split cards */
.split-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.split-card {
  appearance: none;
  width: 100%;
  font: inherit;
  border-radius: var(--radius-md);
  padding: 14px;
  border: 1.5px solid transparent;
  text-align: left;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    transform var(--anim-fast) var(--anim-bounce),
    box-shadow var(--anim-fast) ease,
    border-color var(--anim-fast) ease;
}

.split-card:active {
  transform: scale(0.97);
}

.split-card.income {
  /* Must use theme tokens — hard-coded dark greens break Light mode contrast. */
  background: var(--home-income-card-bg);
  border-color: color-mix(in srgb, var(--home-income-card-border) 50%, transparent);
}

.split-card.expense {
  background: var(--home-expense-card-bg);
  border-color: color-mix(in srgb, var(--home-expense-card-border) 40%, transparent);
}

.split-card.active {
  border-width: 1.5px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent);
}

.split-card.income.active {
  border-color: var(--home-income-card-border);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--home-income-card-border) 25%, transparent);
}

.split-card.expense.active {
  border-color: var(--home-expense-card-border);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--home-expense-card-border) 25%, transparent);
}

.split-card-inner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.split-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.income-icon {
  background: color-mix(in srgb, var(--home-income-card-border) 20%, transparent);
  color: var(--home-income-card-value);
}

.expense-icon {
  background: color-mix(in srgb, var(--home-expense-card-border) 18%, transparent);
  color: var(--home-expense-card-value);
}

.split-info {
  flex: 1;
  min-width: 0;
}

.split-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-bottom: 4px;
}

.split-card.income .split-label {
  color: color-mix(in srgb, var(--home-income-card-value) 58%, var(--muted) 42%);
}

.split-card.expense .split-label {
  color: color-mix(in srgb, var(--home-expense-card-value) 58%, var(--muted) 42%);
}

.split-value {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.income-value {
  color: var(--home-income-card-value);
}

.expense-value {
  color: var(--home-expense-card-value);
}

.active-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid var(--home-income-card-border);
  pointer-events: none;
  opacity: 0.6;
}

.active-ring.expense-ring {
  border-color: var(--home-expense-card-border);
}

/* Balance strip */
.balance-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--btn-bg) 60%, transparent);
  border: 1px solid var(--border);
  transition: background var(--anim-fast) ease, border-color var(--anim-fast) ease;
}

.balance-strip.positive {
  background: color-mix(in srgb, var(--home-income-card-bg) 80%, transparent);
  border-color: color-mix(in srgb, var(--home-income-card-border) 30%, transparent);
}

.balance-strip.negative {
  background: color-mix(in srgb, var(--home-expense-card-bg) 80%, transparent);
  border-color: color-mix(in srgb, var(--home-expense-card-border) 25%, transparent);
}

.balance-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.balance-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}

.balance-strip.positive .balance-dot {
  background: var(--home-income-card-value);
}

.balance-strip.negative .balance-dot {
  background: var(--home-expense-card-value);
}

.balance-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.balance-strip.positive .balance-label {
  color: color-mix(in srgb, var(--home-income-card-value) 70%, var(--text) 30%);
}

.balance-strip.negative .balance-label {
  color: color-mix(in srgb, var(--home-expense-card-value) 70%, var(--text) 30%);
}

.balance-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
}

.balance-strip.positive .balance-value {
  color: var(--home-income-card-value);
}

.balance-strip.negative .balance-value {
  color: var(--home-expense-card-value);
}
</style>
