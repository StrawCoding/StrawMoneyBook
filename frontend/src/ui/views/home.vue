<template>
  <HabitatPageShell
    :title="t('nav.home')"
    :kicker="t('home_page.habitat_hello')"
    test-id="home-view"
    hello-test-id="home-hello-block"
    root-class="home-modern"
  >
    <template #toolbar>
      <LedgerSwitcher class="home-toolbar-ledger ledger-switcher-wrap" data-testid="home-ledger-switcher" />
    </template>

    <PeriodChrome
      chrome-test-id="home-period-chrome"
      id-prefix="home-period"
      :title="periodTitle"
      :can-step="canStepPeriod"
      :sheet-title="t('home_page.period_filter', '調整期間')"
      :prev-label="t('home_page.period_prev')"
      :next-label="t('home_page.period_next')"
      @step="stepPeriod"
    >
      <template #sheet>
        <div class="period-chrome-sheet-tabs" data-testid="home-period-filter">
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
        <div v-if="filterMode !== 'all'" class="period-chrome-sheet-picker">
          <HomeRangePicker
            v-if="filterMode === 'month'"
            mode="month"
            :month="selectedMonth"
            class="picker-input"
            @update:month="pickMonth"
          />
          <HomeRangePicker
            v-else-if="filterMode === 'day'"
            mode="day"
            :day="selectedDay"
            class="picker-input"
            @update:day="pickDay"
          />
          <HomeRangePicker
            v-else
            mode="year"
            :year="selectedYear"
            class="picker-input"
            @update:year="pickYear"
          />
          <button class="btn quick-btn" :disabled="budgetStore.loading" @click="goCurrentRange">
            {{ currentRangeLabel }}
          </button>
        </div>
      </template>
    </PeriodChrome>

    <PeriodContentTransition
      :content-key="periodContentKey"
      :direction="periodShiftDirection"
      class="home-period-body"
    >
      <HomeModernOverview />
      <HomeTransactionFeed data-testid="home-transaction-feed" />
    </PeriodContentTransition>

    <teleport to="body">
      <button class="fab btn primary" data-testid="home-fab" @click="openQuickAdd">{{ t('home_page.quick_add') }}</button>
    </teleport>
  </HabitatPageShell>
</template>

<script setup>
import { useRouter } from 'vue-router'
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import PeriodChrome from '@/ui/components/layout/PeriodChrome.vue'
import PeriodContentTransition from '@/ui/components/layout/PeriodContentTransition.vue'
import HomeModernOverview from '@/ui/components/home/HomeModernOverview.vue'
import { useHomePeriodFilter } from '@/ui/composables/useHomePeriodFilter'
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
  periodContentKey,
  periodShiftDirection,
} = useHomePeriodFilter()

function openQuickAdd() {
  void router.push(getPreferredBookkeepingPath()).catch(() => {})
}
</script>

<style scoped>
.home-period-body {
  display: grid;
  gap: 12px;
}

.home-toolbar-ledger {
  max-width: min(52vw, 220px);
}
.ledger-switcher-wrap {
  position: relative;
  z-index: 20;
  min-width: 0;
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
