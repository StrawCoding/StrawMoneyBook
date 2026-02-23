<template>
  <article class="card summary-card">
    <header class="row">
      <h3>預算簡表</h3>
      <RouterLink class="jump" to="/budget">查看</RouterLink>
    </header>

    <div class="stat-wrap">
      <div class="pie-shell" :class="{ over: isOverBudget }">
        <div class="mini-pie" :style="pieStyle">
          <div class="pie-hole">
            <strong>{{ usedPercentLabel }}</strong>
            <small>已用</small>
          </div>
        </div>
      </div>

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
import { useBudgetStore } from '@/ui/stores/budget.store'

const budgetStore = useBudgetStore()

const totalBudgetMinor = computed(() => Math.max(0, Number(budgetStore.totalBudgetMinor ?? 0)))
const totalSpentMinor = computed(() => Math.max(0, Number(budgetStore.totalSpentMinor ?? 0)))

const usedRatio = computed(() => {
  if (!totalBudgetMinor.value) return 0
  const ratio = totalSpentMinor.value / totalBudgetMinor.value
  if (!Number.isFinite(ratio)) return 0
  return Math.max(0, ratio)
})

const usedPercentLabel = computed(() => `${Math.max(0, Math.round(usedRatio.value * 100))}%`)
const isOverBudget = computed(() => totalBudgetMinor.value > 0 && usedRatio.value > 1)

const pieStyle = computed(() => {
  if (!totalBudgetMinor.value) {
    return {
      background: 'conic-gradient(var(--chart-track) 0deg 360deg)',
    }
  }

  const usedDeg = Number.isFinite(usedRatio.value)
    ? Math.min(360, Math.max(0, usedRatio.value) * 360)
    : 0
  return {
    background: `conic-gradient(var(--chart-budget-used) 0deg ${usedDeg}deg, var(--chart-budget-remain) ${usedDeg}deg 360deg)`,
  }
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
.stat-wrap {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 10px
}
.pie-shell {
  display: grid;
  place-items: center
}
.mini-pie {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  display: grid;
  place-items: center;
  box-shadow: 0 4px 14px color-mix(in srgb, black 24%, transparent)
}
.pie-shell.over .mini-pie {
  border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--danger) 36%, transparent)
}
.pie-hole {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 90%, var(--bg) 10%);
  display: grid;
  place-items: center;
  gap: 1px;
  text-align: center
}
.pie-hole strong {
  font-size: 12px;
  line-height: 1
}
.pie-hole small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1
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
