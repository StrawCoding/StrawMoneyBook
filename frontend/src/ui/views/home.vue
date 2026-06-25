<template>
  <div class="view-root" :class="{ 'home-modern': isModern }" data-testid="home-view">
    <h1 class="home-large-title">{{ t('nav.home') }}</h1>
    <section class="stack">
      <article class="card ledger-card">
        <header class="row">
          <h3>{{ t('home_page.current_ledger') }}</h3>
        </header>
        <LedgerSwitcher class="ledger-switcher-wrap" data-testid="home-ledger-switcher" />
        <div class="period-tabs" data-testid="home-period-filter">
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

      <HomeAssetSummaryCard data-testid="home-asset-summary" />
      <HomeBudgetSummaryCard data-testid="home-budget-summary" />
      <HomeTransactionFeed data-testid="home-transaction-feed" />

      <teleport to="body">
        <button class="fab btn primary" data-testid="home-fab" @click="openQuickAdd">{{ t('home_page.quick_add') }}</button>
      </teleport>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import HomeAssetSummaryCard from '@/ui/components/home/HomeAssetSummaryCard.vue'
import { useUiLayout } from '@/ui/composables/useUiLayout'
import { useHomePeriodFilter } from '@/ui/composables/useHomePeriodFilter'
import HomeBudgetSummaryCard from '@/ui/components/home/HomeBudgetSummaryCard.vue'
import HomeTransactionFeed from '@/ui/components/home/HomeTransactionFeed.vue'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'

const router = useRouter()
const budgetStore = useBudgetStore()
const { t } = useI18n()
const { isModern } = useUiLayout()

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

function openQuickAdd() {
  void router.push(getPreferredBookkeepingPath()).catch(() => {})
}
</script>

<style scoped>.ledger-card {
  padding: 16px;
  background:
    radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 55%),
    var(--card);
}
.month-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between
}
.ledger-switcher-wrap {
  margin-top: 12px;
  position: relative;
  z-index: 20
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
  font-size: 15px
}
.picker-row {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center
}
.picker-input {
  flex: 1
}
.quick-btn {
  white-space: nowrap
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-soft)
}
.fab {
  position: fixed;
  right: calc(max(var(--safe-area-right), calc((100vw - var(--app-max-width)) / 2)) + 20px);
  bottom: calc(88px + var(--navigation-bar-height));
  border-radius: var(--radius-pill);
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: var(--shadow-primary-lg);
}</style>
