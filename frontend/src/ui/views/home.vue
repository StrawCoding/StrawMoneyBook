<template>
  <div class="view-root home-modern" data-testid="home-view">
    <h1 class="home-large-title">{{ t('nav.home') }}</h1>
    <p class="home-habitat-hello">{{ t('home_page.habitat_hello') }}</p>
    <section class="stack">
      <header class="home-period-chrome" data-testid="home-period-chrome">
        <div class="home-chrome-top">
          <LedgerSwitcher class="ledger-switcher-wrap" data-testid="home-ledger-switcher" />
        </div>
        <div class="period-title-row">
          <button
            type="button"
            class="period-arrow"
            data-testid="home-period-prev"
            :disabled="!canStepPeriod"
            :aria-label="t('home_page.period_prev')"
            @click="stepPeriod(-1)"
          >
            ‹
          </button>
          <h2 class="period-title" data-testid="home-period-title">{{ periodTitle }}</h2>
          <button
            type="button"
            class="period-arrow"
            data-testid="home-period-next"
            :disabled="!canStepPeriod"
            :aria-label="t('home_page.period_next')"
            @click="stepPeriod(1)"
          >
            ›
          </button>
        </div>
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
      </header>

      <HomeBudgetSummaryCard data-testid="home-budget-summary" />
      <HomeAssetSummaryCard data-testid="home-asset-summary" />
      <HomeCreditSummaryCard />
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
import { useHomePeriodFilter } from '@/ui/composables/useHomePeriodFilter'
import HomeBudgetSummaryCard from '@/ui/components/home/HomeBudgetSummaryCard.vue'
import HomeCreditSummaryCard from '@/ui/components/home/HomeCreditSummaryCard.vue'
import HomeTransactionFeed from '@/ui/components/home/HomeTransactionFeed.vue'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'

const router = useRouter()
const budgetStore = useBudgetStore()
const { t } = useI18n()

const {
  filterMode,
  selectedMonth,
  selectedDay,
  selectedYear,
  filterModes,
  periodTitle,
  canStepPeriod,
  currentRangeLabel,
  switchFilterMode,
  goCurrentRange,
  pickMonth,
  pickDay,
  pickYear,
  stepPeriod,
} = useHomePeriodFilter()

function openQuickAdd() {
  void router.push(getPreferredBookkeepingPath()).catch(() => {})
}
</script>

<style scoped>
.home-period-chrome {
  display: grid;
  gap: 10px;
}
.home-chrome-top {
  display: flex;
  align-items: center;
  min-width: 0;
}
.period-title-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
}
.period-title {
  margin: 0;
  text-align: center;
  font-size: clamp(22px, 6vw, 28px);
  font-weight: 750;
  letter-spacing: -0.04em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.period-arrow {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  border-radius: 999px;
  width: 40px;
  height: 40px;
  font-size: 22px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
}
.period-arrow:disabled {
  opacity: 0.35;
  cursor: default;
}
.ledger-switcher-wrap {
  position: relative;
  z-index: 20;
  min-width: 0;
  max-width: 100%;
}
.period-tabs {
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
.picker-row {
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
}
</style>
