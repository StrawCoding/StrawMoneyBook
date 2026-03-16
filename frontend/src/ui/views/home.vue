<template>
  <div class="view-root">
    <section class="stack">
    <article class="card ledger-card">
      <header class="row">
        <h3>{{ t('home_page.current_ledger') }}</h3>
      </header>
      <LedgerSwitcher class="ledger-switcher-wrap" />
      <div class="period-tabs">
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

    <article class="card feature-spotlight">
      <div class="spotlight-badge">
        <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" />
        <span>{{ t('home_page.feature_intro.badge', '新功能') }}</span>
      </div>
      <div class="stack internal-stack">
        <h3>{{ t('home_page.feature_intro.title', 'Google Drive 帳本同步') }}</h3>
        <p class="muted spotlight-desc">
          {{
            t(
              'home_page.feature_intro.desc',
              '可選擇指定帳本，在不同裝置間自動同步到 Google Drive；和備份分開管理，可直接前往設定啟用。',
            )
          }}
        </p>
      </div>
      <div class="spotlight-actions">
        <button class="btn primary" @click="openGoogleDriveLedgerSync">
          {{ t('home_page.feature_intro.open', '立即設定') }}
        </button>
        <button class="btn" @click="openMembershipBenefits">
          {{ t('home_page.feature_intro.membership', '查看會員權益') }}
        </button>
      </div>
    </article>

    <HomeAssetSummaryCard />
    <HomeBudgetSummaryCard />
    <HomeTransactionFeed />

      <teleport to="body">
        <button class="fab btn primary" @click="openQuickAdd">{{ t('home_page.quick_add') }}</button>
      </teleport>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HomeAssetSummaryCard from '@/ui/components/home/HomeAssetSummaryCard.vue'
import HomeBudgetSummaryCard from '@/ui/components/home/HomeBudgetSummaryCard.vue'
import HomeTransactionFeed from '@/ui/components/home/HomeTransactionFeed.vue'
import LedgerSwitcher from '@/ui/components/common/LedgerSwitcher.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredManualBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const budgetStore = useBudgetStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()
const filterMode = ref('month')
const selectedMonth = ref(budgetStore.monthKey || monthKeyFromDate(new Date()))
const selectedDay = ref(dateKeyFromDate(new Date()))
const selectedYear = ref(Number(new Date().getFullYear()))
const filterModes = computed(() => ([
  { value: 'all', label: t('home_page.filter.all') },
  { value: 'year', label: t('home_page.filter.year') },
  { value: 'month', label: t('home_page.filter.month') },
  { value: 'day', label: t('home_page.filter.day') },
]))

watch(
  () => ledgerStore.activeLedgerId,
  (ledgerId) => {
    if (!ledgerId) return
    void syncHomeTransactions()
  },
  { immediate: true },
)

watch(
  () => String(route.query.quickAdd ?? ''),
  (flag) => {
    if (flag !== '1') return
    void router.replace(getPreferredManualBookkeepingPath()).catch(() => {})
  },
  { immediate: true },
)

async function syncHomeTransactions() {
  try {
    await syncBudgetMonthByHomeFilter()
    if (filterMode.value === 'all') {
      await transactionStore.loadHomeAll()
      return
    }
    if (filterMode.value === 'year') {
      await transactionStore.loadHomeYear(String(selectedYear.value))
      return
    }
    if (filterMode.value === 'day') {
      await transactionStore.loadHomeDay(selectedDay.value)
      return
    }
    await transactionStore.loadHomeMonth(selectedMonth.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('home_page.toast.load_failed'), 'error')
  }
}

async function syncBudgetMonthByHomeFilter() {
  if (!ledgerStore.activeLedgerId) return
  let targetMonthKey = ''
  if (filterMode.value === 'month') {
    targetMonthKey = normalizeMonthKey(selectedMonth.value)
  } else if (filterMode.value === 'day') {
    targetMonthKey = monthKeyFromDayKey(selectedDay.value)
  }
  if (!targetMonthKey || targetMonthKey === budgetStore.monthKey) return
  await budgetStore.loadMonth(targetMonthKey)
}

async function switchFilterMode(nextMode) {
  filterMode.value = nextMode
  if (nextMode === 'month' && budgetStore.monthKey) {
    selectedMonth.value = budgetStore.monthKey
  }
  await syncHomeTransactions()
}

async function goCurrentRange() {
  if (filterMode.value === 'year') {
    selectedYear.value = Number(new Date().getFullYear())
    await syncHomeTransactions()
    return
  }
  if (filterMode.value === 'day') {
    selectedDay.value = dateKeyFromDate(new Date())
    await syncHomeTransactions()
    return
  }
  const monthKey = monthKeyFromDate(new Date())
  selectedMonth.value = monthKey
  try {
    await budgetStore.loadMonth(monthKey)
    await syncHomeTransactions()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('home_page.toast.switch_month_failed'), 'error')
  }
}

async function applyMonthInput() {
  if (!selectedMonth.value) return
  try {
    await budgetStore.loadMonth(selectedMonth.value)
    await syncHomeTransactions()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('home_page.toast.switch_month_failed'), 'error')
  }
}

async function pickMonth(value) {
  selectedMonth.value = value
  await applyMonthInput()
}

async function pickDay(value) {
  selectedDay.value = value
  await syncHomeTransactions()
}

async function pickYear(value) {
  selectedYear.value = Number(value)
  await syncHomeTransactions()
}

const displayRange = computed(() => {
  if (filterMode.value === 'year') return t('home_page.year_display', { year: selectedYear.value })
  if (filterMode.value === 'day') return selectedDay.value || '-'
  const [year, month] = String(selectedMonth.value ?? '').split('-')
  if (!year || !month) return '-'
  return localeRangeMonth(year, month)
})

const currentRangeLabel = computed(() => {
  if (filterMode.value === 'year') return t('home_page.current_year')
  if (filterMode.value === 'day') return t('home_page.current_day')
  return t('home_page.current_month')
})

function openQuickAdd() {
  void router.push(getPreferredManualBookkeepingPath()).catch(() => {})
}

function openGoogleDriveLedgerSync() {
  void router.push('/settings/google-drive-ledger-sync').catch(() => {})
}

function openMembershipBenefits() {
  void router.push('/settings/membership-benefits').catch(() => {})
}

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dateKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeMonthKey(value) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}$/.test(text) ? text : ''
}

function monthKeyFromDayKey(dayKey) {
  const text = String(dayKey ?? '').trim()
  const matched = /^(\d{4})-(\d{2})-\d{2}$/.exec(text)
  if (!matched) return ''
  return `${matched[1]}-${matched[2]}`
}

function localeRangeMonth(year, month) {
  return t('home_page.month_display', { year, month })
}

</script>

<style scoped>.ledger-card {
  padding: 14px
}
.feature-spotlight {
  padding: 14px;
  display: grid;
  gap: 12px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 16%, transparent) 0%, transparent 40%),
    linear-gradient(135deg, color-mix(in srgb, var(--card) 90%, var(--primary) 10%) 0%, color-mix(in srgb, var(--card) 96%, #fff 4%) 100%);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
}
.month-row {
  margin-top: 10px
}
.ledger-switcher-wrap {
  margin-top: 10px;
  position: relative;
  z-index: 20
}
.period-tabs {
  margin-top: 10px;
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr))
}
.tab-btn {
  padding: 8px 0
}
.all-range {
  font-weight: 700
}
.picker-row {
  margin-top: 8px;
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
.spotlight-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
}
.spotlight-desc {
  margin: 0;
}
.spotlight-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
h3 {
  margin: 0;
  font-size: 16px
}
.fab {
  position: fixed;
  right: calc(max(var(--safe-area-right), calc((100vw - var(--app-max-width)) / 2)) + 22px);
  bottom: calc(92px + var(--navigation-bar-height));
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 14px;
  box-shadow: var(--shadow)
}
@media (max-width: 420px) {
  .spotlight-actions {
    display: grid;
  }
  .spotlight-actions > .btn {
    width: 100%;
  }
}</style>
