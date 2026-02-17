<template>
  <article class="card summary-card">
    <header class="row">
      <h3>{{ title }}</h3>
      <RouterLink class="jump" to="/assets">{{ t('assets_page.view') }}</RouterLink>
    </header>

    <div class="split-grid">
      <section class="split-card income">
        <div class="label">{{ t('transaction_search.label.income') }}</div>
        <div class="value">
          <MoneyText :value-minor="incomeMinor" />
        </div>
      </section>
      <section class="split-card expense">
        <div class="label">{{ t('transaction_search.label.expense') }}</div>
        <div class="value">
          <MoneyText :value-minor="expenseMinor" />
        </div>
      </section>
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

const incomeMinor = computed(() => {
  return transactionStore.homeRecent
    .filter((tx) => tx.type === 'income' && tx.origin_type !== 'loan_payment')
    .reduce((total, tx) => total + Number(tx.amount_minor ?? 0), 0)
})

const expenseMinor = computed(() => {
  return transactionStore.homeRecent
    .filter((tx) => tx.type === 'expense' && tx.origin_type !== 'loan_payment')
    .reduce((total, tx) => total + Math.abs(Number(tx.amount_minor ?? 0)), 0)
})
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
  border-radius: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text) 8%, transparent)
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
}</style>
