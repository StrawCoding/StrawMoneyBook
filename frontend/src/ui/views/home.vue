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

    <header class="home-period-chrome" data-testid="home-period-chrome">
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
        <button
          type="button"
          class="period-title period-title-btn"
          data-testid="home-period-title"
          @click="periodSheetOpen = true"
        >
          {{ periodTitle }}
        </button>
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
    </header>

    <InputBottomSheet
      :open="periodSheetOpen"
      :title="t('home_page.period_filter', '調整期間')"
      @close="periodSheetOpen = false"
    >
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
      <div v-if="filterMode !== 'all'" class="picker-row">
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
    </InputBottomSheet>

    <HomeModernOverview />

    <HomeTransactionFeed data-testid="home-transaction-feed" />

    <teleport to="body">
      <button class="fab btn primary" data-testid="home-fab" @click="openQuickAdd">{{ t('home_page.quick_add') }}</button>
    </teleport>
  </HabitatPageShell>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import HomeModernOverview from '@/ui/components/home/HomeModernOverview.vue'
import { useHomePeriodFilter } from '@/ui/composables/useHomePeriodFilter'
import HomeTransactionFeed from '@/ui/components/home/HomeTransactionFeed.vue'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'

const router = useRouter()
const budgetStore = useBudgetStore()
const { t } = useI18n()
const periodSheetOpen = ref(false)

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
  gap: 8px;
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
.period-title-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}
.period-title-btn:hover {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}
.home-toolbar-ledger {
  max-width: min(52vw, 220px);
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
}
.period-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: var(--input-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  margin-bottom: 12px;
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
}
.tab-btn.primary {
  background: var(--btn-bg);
  color: var(--primary);
  border: 1px solid var(--border-strong);
}
.picker-row {
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
