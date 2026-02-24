<template>
  <article class="card summary-card">
    <header class="row">
      <h3>預算簡表</h3>
      <RouterLink class="jump" to="/budget">查看</RouterLink>
    </header>

    <div class="stat-wrap">
      <BudgetMiniPie :ratio="usedRatio" :over="isOverBudget" :percent-label="usedPercentLabel" subtitle="已用" />

      <div class="remain-block">
        <div class="muted">剩餘</div>
        <div class="remain-value">
          <MoneyText :value-minor="budgetStore.remainMinor" />
        </div>
      </div>

      <div class="right-stack">
        <div class="line">
          <span class="muted">預算</span>
          <MoneyText :value-minor="budgetStore.totalBudgetMinor" />
        </div>
        <div class="line">
          <span class="muted">已用</span>
          <MoneyText :value-minor="budgetStore.totalSpentMinor" />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'

const budgetStore = useBudgetStore()

function toFiniteNonNegative(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, numeric)
}

const totalBudgetMinor = computed(() => toFiniteNonNegative(budgetStore.totalBudgetMinor))
const totalSpentMinor = computed(() => toFiniteNonNegative(budgetStore.totalSpentMinor))

const usedRatio = computed(() => {
  if (!totalBudgetMinor.value) return 0
  const ratio = totalSpentMinor.value / totalBudgetMinor.value
  return Number.isFinite(ratio) ? ratio : 0
})

const usedPercentLabel = computed(() => `${Math.round(usedRatio.value * 100)}%`)
const isOverBudget = computed(() => totalBudgetMinor.value > 0 && usedRatio.value > 1)
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
.stat-wrap {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 10px
}
.remain-block {
  display: grid;
  gap: 4px
}
.remain-value {
  font-weight: 700
}
.right-stack {
  display: grid;
  gap: 6px
}
.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px
}</style>
