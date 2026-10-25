<template>
  <section class="stack" data-testid="budget-display-page">
    <header class="row">
      <h2 class="page-title">{{ t('budgeting.title') }}</h2>
      <div class="header-actions">
        <RouterLink
          class="btn icon-btn"
          to="/budget/settings"
          data-testid="budget-display-settings"
          :aria-label="t('budgeting.display.settings')"
        >
          <font-awesome-icon icon="fa-solid fa-gear" />
        </RouterLink>
        <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
      </div>
    </header>

    <article class="card panel">
      <header class="row">
        <div>
          <h3>{{ budgetPeriodTitle }}</h3>
          <p v-if="isPayCycleMode" class="muted period-copy">
            {{ t('budgeting.period.pay_cycle_range', { start: budgetStore.period?.startDate, end: budgetStore.period?.endDate }) }}
            <span v-if="budgetStore.period?.nextPayDate">
              · {{ t('budgeting.period.next_pay_day', { date: budgetStore.period.nextPayDate }) }}
            </span>
          </p>
        </div>
        <HomeRangePicker
          v-if="!isPayCycleMode"
          mode="month"
          :month="budgetStore.monthKey"
          @update:month="pickMonth"
        />
        <div v-else class="row period-nav">
          <button type="button" class="btn" data-testid="budget-display-period-previous" @click="budgetStore.goPreviousPeriod">
            {{ t('budgeting.period.previous') }}
          </button>
          <button type="button" class="btn" data-testid="budget-display-period-current" @click="budgetStore.loadCurrentPeriod">
            {{ t('budgeting.period.current') }}
          </button>
          <button type="button" class="btn" data-testid="budget-display-period-next" @click="budgetStore.goNextPeriod">
            {{ t('budgeting.period.next') }}
          </button>
        </div>
      </header>

      <div class="stack stat" :class="{ 'month-over': budgetStore.isMonthOver }">
        <BudgetProgressBar
          :ratio="monthUsedRatio"
          :over="budgetStore.isMonthOver"
          :percent-label="monthUsedPercentLabel"
          :subtitle="t('budgeting.used')"
          :aria-label="budgetPeriodTitle"
        />
        <div class="stat-grid">
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.budget_total') }}</span>
            <MoneyText :value-minor="budgetStore.totalBudgetMinor" />
          </div>
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.used') }}</span>
            <MoneyText :value-minor="budgetStore.totalSpentMinor" />
          </div>
          <div class="stat-cell" :class="{ 'remain-over': budgetStore.isMonthOver }">
            <span class="muted">{{ t('budgeting.remaining') }}</span>
            <MoneyText :value-minor="budgetStore.remainMinor" />
          </div>
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.reserved') }}</span>
            <MoneyText :value-minor="budgetStore.reservedMinor" />
          </div>
        </div>
        <p v-if="todayStats" class="muted today-copy">
          {{ t('budgeting.display.today_allowance') }}
          <MoneyText :value-minor="todayStats.diffMinor" />
        </p>
      </div>

      <div class="row view-toggle" role="group" :aria-label="t('budgeting.display.view_toggle')">
        <button
          type="button"
          class="btn"
          :class="{ primary: viewMode === 'calendar' }"
          data-testid="budget-display-view-calendar"
          @click="viewMode = 'calendar'"
        >
          {{ t('budgeting.display.calendar') }}
        </button>
        <button
          type="button"
          class="btn"
          :class="{ primary: viewMode === 'list' }"
          data-testid="budget-display-view-list"
          @click="viewMode = 'list'"
        >
          {{ t('budgeting.display.list') }}
        </button>
      </div>

      <BudgetMonthCalendar
        v-if="viewMode === 'calendar'"
        :month-key="calendarMonthKey"
        :daily-stats-rows="budgetStore.dailyStatsRows"
        :period-start-date="periodStartDate"
        :period-end-date="periodEndDate"
        :today-key="todayKey"
        :selected-date-key="selectedDateKey"
        @prev-month="shiftCalendarMonth(-1)"
        @next-month="shiftCalendarMonth(1)"
        @select-day="openDayDetail"
      />
      <BudgetDailyStatsTable v-else />
    </article>

    <article v-if="selectedDayStats" class="card panel" data-testid="budget-day-detail">
      <header class="row">
        <h3>{{ t('budgeting.display.day_detail', { date: selectedDateKey }) }}</h3>
        <button type="button" class="btn" @click="closeDayDetail">{{ t('budgeting.sheet.close') }}</button>
      </header>
      <div class="stat-grid">
        <div class="stat-cell">
          <span class="muted">{{ t('budgeting.daily_stats.col_planned') }}</span>
          <MoneyText :value-minor="selectedDayStats.plannedMinor" />
        </div>
        <div class="stat-cell">
          <span class="muted">{{ t('budgeting.daily_stats.col_spent') }}</span>
          <MoneyText :value-minor="selectedDayStats.spentMinor" />
        </div>
        <div class="stat-cell" :class="{ 'remain-over': selectedDayStats.diffMinor < 0 }">
          <span class="muted">{{ t('budgeting.daily_stats.col_diff') }}</span>
          <MoneyText :value-minor="selectedDayStats.diffMinor" />
        </div>
      </div>

      <ul class="breakdown-list">
        <li v-for="row in selectedDayCategoryRows" :key="row.categoryId" class="breakdown-item">
          <span class="row-icon-wrap">
            <font-awesome-icon :icon="categoryIcon(row.categoryId)" />
          </span>
          <span>{{ categoryName(row.categoryId) }}</span>
          <MoneyText :value-minor="row.spentMinor" />
        </li>
        <li v-if="selectedDayCategoryRows.length === 0" class="muted">{{ t('budgeting.display.day_empty') }}</li>
      </ul>

      <ul class="tx-list">
        <li
          v-for="tx in selectedDayTransactions"
          :key="tx.id"
          class="tx-item"
          role="button"
          tabindex="0"
          :data-testid="`budget-day-tx-${tx.id}`"
          @click="openTx(tx.id)"
          @keydown.enter.prevent="openTx(tx.id)"
        >
          <span class="row-icon-wrap">
            <font-awesome-icon :icon="txIcon(tx)" />
          </span>
          <div class="tx-main">
            <strong>{{ txLabel(tx) }}</strong>
          </div>
          <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" tone="expense" />
        </li>
      </ul>
    </article>

    <BudgetCategoryTable
      @select-item="openItemDetail"
      @select-container="openContainerDetail"
      @go-settings="goSettings()"
    />

    <InputBottomSheet
      :open="isItemDetailOpen"
      :title="detailItem ? categoryName(detailItem.category_id) : t('budgeting.items_by_category')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeItemDetail"
    >
      <template v-if="detailItem">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.sheet.category') }}</small>
          <strong>{{ categoryName(detailItem.category_id) }}</strong>
        </div>
        <div class="detail-row-grid">
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.budget_total') }}</small>
            <strong>{{ formatMajor(itemBudgetMinor(detailItem)) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.used') }}</small>
            <strong>{{ formatMajor(itemSpentMinorForItem(detailItem)) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.remaining') }}</small>
            <strong>{{ formatMajor(itemRemainMinor(detailItem)) }}</strong>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn primary" data-testid="budget-display-item-edit" @click="editDetailItem">
          {{ t('budgeting.edit') }}
        </button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isContainerDetailOpen"
      :title="detailContainer ? detailContainer.name : t('budgeting.container.title')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeContainerDetail"
    >
      <template v-if="detailContainer">
        <div class="detail-row-grid">
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.budget_total') }}</small>
            <strong>{{ formatMajor(detailContainer.periodBudgetMinor ?? detailContainer.amount_minor) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.used') }}</small>
            <strong>{{ formatMajor(detailContainer.periodSpentMinor ?? 0) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.remaining') }}</small>
            <strong>{{ formatMajor(detailContainer.periodRemainMinor ?? 0) }}</strong>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn primary" @click="editDetailContainer">{{ t('budgeting.edit') }}</button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import BudgetProgressBar from '@/ui/components/budget/BudgetProgressBar.vue'
import BudgetMonthCalendar from '@/ui/components/budget/BudgetMonthCalendar.vue'
import BudgetDailyStatsTable from '@/ui/components/budget/BudgetDailyStatsTable.vue'
import BudgetCategoryTable from '@/ui/components/budget/BudgetCategoryTable.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { APP_BUDGET_PERIOD_SYNC_EVENT } from '@/ui/composables/useHomePeriodFilter'
import {
  dateKeyForLedgerTimeZone,
  itemDisplayBudgetMinor,
  itemDisplayRemainMinor,
  itemDisplaySpentMinor,
  shiftBudgetMonthKey,
} from '@/core/services/budget.service'
import { listTransactionsForCalendarMonth } from '@/core/services/transaction-query.service'
import { defaultCategoryExpenseIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'

const router = useRouter()
const budgetStore = useBudgetStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const { t, locale } = useI18n()

const viewMode = ref('calendar')
const calendarMonthKey = ref('')
const selectedDateKey = ref('')
const monthTransactions = ref([])
const detailItem = ref(null)
const isItemDetailOpen = ref(false)
const detailContainer = ref(null)
const isContainerDetailOpen = ref(false)

const isPayCycleMode = computed(() => String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle')
const budgetPeriodTitle = computed(() => (
  isPayCycleMode.value ? t('budgeting.period.pay_cycle_budget') : t('budgeting.monthly_budget')
))
const periodStartDate = computed(() => String(budgetStore.period?.startDate ?? `${budgetStore.monthKey}-01`))
const periodEndDate = computed(() => String(budgetStore.period?.endDate ?? `${budgetStore.monthKey}-28`))
const todayKey = computed(() => dateKeyForLedgerTimeZone(ledgerStore.activeLedger?.timezone))
const todayStats = computed(() => (
  budgetStore.dailyStatsRows.find((row) => row.dayKey === todayKey.value) ?? null
))
const monthUsedRatio = computed(() => {
  const budgetMinor = Number(budgetStore.totalBudgetMinor ?? 0)
  if (!Number.isFinite(budgetMinor) || budgetMinor <= 0) return 0
  const ratio = Number(budgetStore.totalSpentMinor ?? 0) / budgetMinor
  return Number.isFinite(ratio) ? ratio : 0
})
const monthUsedPercentLabel = computed(() => `${Math.round(monthUsedRatio.value * 100)}%`)
const selectedDayStats = computed(() => (
  budgetStore.dailyStatsRows.find((row) => row.dayKey === selectedDateKey.value) ?? null
))
const selectedDayCategoryRows = computed(() => (
  selectedDateKey.value ? budgetStore.spentByCategoryOnDay(selectedDateKey.value) : []
))
const budgetCategoryIds = computed(() => new Set(
  budgetStore.items.map((item) => String(item?.category_id ?? '').trim()).filter(Boolean),
))
const selectedDayTransactions = computed(() => {
  const dayKey = selectedDateKey.value
  if (!dayKey) return []
  return monthTransactions.value.filter((tx) => {
    if (String(tx?.type ?? '') !== 'expense') return false
    if (Number(tx?.include_in_budget ?? 1) !== 1) return false
    if (!budgetCategoryIds.value.has(String(tx?.category_id ?? '').trim())) return false
    return dateKeyFromIso(tx?.occurred_at) === dayKey
  })
})

watch(
  () => [budgetStore.period?.startDate, budgetStore.period?.endDate, budgetStore.monthKey],
  () => {
    syncCalendarMonthToPeriod()
  },
)

watch(
  () => [ledgerStore.activeLedgerId, calendarMonthKey.value],
  () => {
    void loadMonthTransactions()
  },
)

function syncCalendarMonthToPeriod() {
  const startMonth = String(periodStartDate.value ?? '').slice(0, 7)
  const endMonth = String(periodEndDate.value ?? '').slice(0, 7)
  const todayMonth = String(todayKey.value ?? '').slice(0, 7)
  const current = calendarMonthKey.value
  if (current && current >= startMonth && current <= endMonth) return
  calendarMonthKey.value = (
    todayMonth && todayMonth >= startMonth && todayMonth <= endMonth
      ? todayMonth
      : (startMonth || budgetStore.monthKey)
  )
}

function pickMonth(monthKey) {
  if (!monthKey) return
  calendarMonthKey.value = monthKey
  if (monthKey !== budgetStore.monthKey) budgetStore.loadMonth(monthKey)
}

function shiftCalendarMonth(delta) {
  const next = shiftBudgetMonthKey(calendarMonthKey.value || budgetStore.monthKey, delta)
  if (!next) return
  calendarMonthKey.value = next
  if (!isPayCycleMode.value) {
    void budgetStore.loadMonth(next)
  }
}

function openDayDetail(dayKey) {
  selectedDateKey.value = dayKey
}

function closeDayDetail() {
  selectedDateKey.value = ''
}

function refreshCurrentBudgetPeriod() {
  void budgetStore.loadCurrentPeriod()
}

onMounted(() => {
  refreshCurrentBudgetPeriod()
  syncCalendarMonthToPeriod()
  if (typeof window === 'undefined') return
  window.addEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, refreshCurrentBudgetPeriod)
})

onUnmounted(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, refreshCurrentBudgetPeriod)
})

async function loadMonthTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  const monthKey = calendarMonthKey.value
  if (!ledgerId || !monthKey) {
    monthTransactions.value = []
    return
  }
  try {
    monthTransactions.value = await listTransactionsForCalendarMonth(ledgerId, monthKey)
  } catch {
    monthTransactions.value = []
  }
}

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name
    ?? t('budgeting.deleted_category')
}

function categoryIcon(categoryId) {
  const icon = categoryStore.categories.find((category) => category.id === categoryId)?.icon
  return normalizeFaIcon(icon, defaultCategoryExpenseIcon)
}

function itemSpentMinorForItem(item) {
  return itemDisplaySpentMinor(item, budgetStore.spentMap)
}

function itemBudgetMinor(item) {
  return itemDisplayBudgetMinor(item, budgetStore.containers)
}

function itemRemainMinor(item) {
  return itemDisplayRemainMinor(item, budgetStore.spentMap, budgetStore.containers)
}

function txLabel(tx) {
  const directName = String(tx?.category_name ?? '').trim()
  if (directName) return directName
  return categoryName(tx?.category_id)
}

function txIcon(tx) {
  const directIcon = String(tx?.category_icon ?? '').trim()
  if (directIcon) return normalizeFaIcon(directIcon, defaultCategoryExpenseIcon)
  return categoryIcon(tx?.category_id)
}

function openTx(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-about', params: { id: txId } })
}

function openItemDetail(item) {
  detailItem.value = item
  isItemDetailOpen.value = true
}

function closeItemDetail() {
  isItemDetailOpen.value = false
  detailItem.value = null
}

function goSettings(query = {}) {
  void router.push({ path: '/budget/settings', query })
}

function editDetailItem() {
  const itemId = String(detailItem.value?.id ?? '').trim()
  closeItemDetail()
  if (!itemId) {
    goSettings()
    return
  }
  goSettings({ focus: 'item', id: itemId })
}

function openContainerDetail(container) {
  detailContainer.value = container
  isContainerDetailOpen.value = true
}

function closeContainerDetail() {
  isContainerDetailOpen.value = false
  detailContainer.value = null
}

function editDetailContainer() {
  const containerId = String(detailContainer.value?.id ?? '').trim()
  closeContainerDetail()
  if (!containerId) {
    goSettings()
    return
  }
  goSettings({ focus: 'container', id: containerId })
}

function dateKeyFromIso(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return dateKeyForLedgerTimeZone(ledgerStore.activeLedger?.timezone, date)
}

function formatMajor(amountMinor) {
  const minor = Number(amountMinor)
  if (!Number.isFinite(minor)) return ''
  const hasFraction = Math.abs(minor) % 100 !== 0
  return new Intl.NumberFormat(resolveIntlLocale(locale.value), {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}
</script>

<style scoped>
.panel {
  padding: 14px;
}
h2, h3 {
  margin: 0;
}
.page-title {
  font-size: 24px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-btn {
  min-width: 42px;
}
.stat {
  margin-top: 10px;
  gap: 12px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.stat-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.stat-cell .muted {
  font-size: 11px;
}
.remain-over,
.stat.month-over .remain-over {
  color: var(--danger, #d14343);
}
.period-copy,
.today-copy {
  margin: 4px 0 0;
  font-size: 12px;
}
.period-nav {
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.view-toggle {
  margin: 12px 0 8px;
  gap: 8px;
}
.breakdown-list,
.tx-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.breakdown-item,
.tx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.tx-item {
  cursor: pointer;
}
.row-icon-wrap {
  width: 22px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.tx-main {
  flex: 1;
  min-width: 0;
}
.detail-sheet-body {
  gap: 12px;
}
.detail-block {
  display: grid;
  gap: 4px;
}
.detail-row-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
</style>
