<template>
  <article class="card summary-card">
    <header class="row">
      <h3>{{ title }}</h3>
      <RouterLink class="jump" to="/assets">{{ t('assets_page.view') }}</RouterLink>
    </header>

    <div class="split-grid">
      <button
        type="button"
        class="split-card income"
        :class="{ active: transactionStore.homeTypeFilter === 'income' }"
        @click="toggleTypeFilter('income')"
      >
        <div v-if="transactionStore.homeTypeFilter === 'income'" class="active-tag">已選取</div>
        <div class="label">{{ t('transaction_search.label.income') }}</div>
        <div class="value">
          <MoneyText :value-minor="incomeMinor" />
        </div>
      </button>
      <button
        type="button"
        class="split-card expense"
        :class="{ active: transactionStore.homeTypeFilter === 'expense' }"
        @click="toggleTypeFilter('expense')"
      >
        <div v-if="transactionStore.homeTypeFilter === 'expense'" class="active-tag">已選取</div>
        <div class="label">{{ t('transaction_search.label.expense') }}</div>
        <div class="value">
          <MoneyText :value-minor="expenseMinor" />
        </div>
      </button>
    </div>

    <div class="balance-row" :class="{ negative: balanceMinor < 0, positive: balanceMinor > 0 }">
      <span class="balance-label">{{ t('home_asset_summary.balance_label') }}</span>
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
import { isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'

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

const incomeMinor = computed(() => {
  return transactionStore.homeRecent
    .filter((tx) => isCountableForIncomeExpense(tx) && tx.type === 'income' && tx.origin_type !== 'loan_payment')
    .reduce((total, tx) => total + Number(tx.amount_minor ?? 0), 0)
})

const expenseMinor = computed(() => {
  return transactionStore.homeRecent
    .filter((tx) => isCountableForIncomeExpense(tx) && tx.type === 'expense' && tx.origin_type !== 'loan_payment')
    .reduce((total, tx) => total + Math.abs(Number(tx.amount_minor ?? 0)), 0)
})

const balanceMinor = computed(() => incomeMinor.value - expenseMinor.value)

function toggleTypeFilter(type) {
  if (transactionStore.homeTypeFilter === type) {
    transactionStore.setHomeTypeFilter('all')
    return
  }
  transactionStore.setHomeTypeFilter(type)
}
</script>

<style scoped>.summary-card {
  padding: 14px
}
h3 {
  margin: 0;
  font-size: 16px
}
.jump {
  text-decoration: none;
  color: var(--primary-soft);
  font-size: 13px
}
.split-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px
}
.split-card {
  appearance: none;
  width: 100%;
  font: inherit;
  color: inherit;
  position: relative;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  text-align: left;
  cursor: pointer;
  transition: transform var(--anim-fast) ease, box-shadow var(--anim-fast) ease, border-color var(--anim-fast) ease;
}
.split-card:active {
  transform: scale(0.99);
}
.split-card.active {
  border-width: 2px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent), inset 0 0 0 1px color-mix(in srgb, #fff 35%, transparent);
}
.split-card.active .label {
  font-weight: 800;
}
.split-card .label {
  font-size: 12px;
  color: var(--text-soft)
}
.split-card .value {
  margin-top: 8px;
  font-weight: 700
}
.split-card.income {
  background: var(--home-income-card-bg);
  border-color: var(--home-income-card-border);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--home-income-card-border) 38%, transparent)
}
.split-card.income .value {
  color: var(--home-income-card-value)
}
.split-card.expense {
  background: var(--home-expense-card-bg);
  border-color: var(--home-expense-card-border);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--home-expense-card-border) 35%, transparent)
}
.split-card.expense .value {
  color: var(--home-expense-card-value)
}
.active-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 999px;
  color: #fff;
}
.split-card.income .active-tag {
  background: color-mix(in srgb, var(--home-income-card-value) 78%, #000 22%);
}
.split-card.expense .active-tag {
  background: color-mix(in srgb, var(--home-expense-card-value) 78%, #000 22%);
}
.balance-row {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--surface-soft-accent) 72%, var(--card) 28%),
    color-mix(in srgb, var(--surface-highlight) 74%, var(--card) 26%)
  );
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
}
.balance-label {
  font-size: 12px;
  color: color-mix(in srgb, var(--text) 76%, var(--primary) 24%);
  font-weight: 700;
}
.balance-value {
  font-size: 18px;
  line-height: 1.2;
  color: var(--text);
}
.balance-row.positive {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--surface-ok) 84%, var(--card) 16%),
    color-mix(in srgb, var(--surface-highlight) 72%, var(--card) 28%)
  );
  border-color: color-mix(in srgb, var(--ok) 24%, transparent);
}
.balance-row.positive .balance-label {
  color: color-mix(in srgb, var(--ok) 68%, var(--text) 32%);
}
.balance-row.positive .balance-value {
  color: color-mix(in srgb, var(--ok) 84%, var(--text) 16%);
}
.balance-row.negative {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--surface-danger) 86%, var(--card) 14%),
    color-mix(in srgb, var(--surface-soft-accent) 70%, var(--card) 30%)
  );
  border-color: color-mix(in srgb, var(--danger) 28%, transparent);
}
.balance-row.negative .balance-label {
  color: color-mix(in srgb, var(--danger) 70%, var(--text) 30%);
}
.balance-row.negative .balance-value {
  color: color-mix(in srgb, var(--danger) 82%, var(--text) 18%);
}
</style>
