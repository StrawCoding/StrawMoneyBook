import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'
import {
  dateKeyForLedgerTimeZone,
  monthKeyForLedgerTimeZone,
} from '@/core/services/budget.service'

export const APP_BUDGET_PERIOD_SYNC_EVENT = 'app:budget-period-sync'

export function useHomePeriodFilter() {
  const route = useRoute()
  const router = useRouter()
  const ledgerStore = useLedgerStore()
  const budgetStore = useBudgetStore()
  const transactionStore = useTransactionStore()
  const uiStore = useUiStore()
  const { t } = useI18n()

  const filterMode = ref('month')
  const selectedMonth = ref(monthKeyForLedgerTimeZone())
  const selectedDay = ref(dateKeyForLedgerTimeZone())
  const selectedYear = ref(Number(new Date().getFullYear()))

  const filterModes = computed(() => ([
    { value: 'all', label: t('home_page.filter.all') },
    { value: 'year', label: t('home_page.filter.year') },
    { value: 'month', label: t('home_page.filter.month') },
    { value: 'day', label: t('home_page.filter.day') },
  ]))

  const displayRange = computed(() => {
    if (filterMode.value === 'year') return t('home_page.year_display', { year: selectedYear.value })
    if (filterMode.value === 'day') return selectedDay.value || '-'
    const [year, month] = String(selectedMonth.value ?? '').split('-')
    if (!year || !month) return '-'
    return t('home_page.month_display', { year, month })
  })

  const currentRangeLabel = computed(() => {
    if (filterMode.value === 'year') return t('home_page.current_year')
    if (filterMode.value === 'day') return t('home_page.current_day')
    return t('home_page.current_month')
  })

  function ledgerTimeZone() {
    return String(ledgerStore.activeLedger?.timezone ?? '').trim() || 'Asia/Taipei'
  }

  function isPayCycleLedger() {
    return String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle'
  }

  function resetRangeToLedgerToday(referenceDate = new Date()) {
    const timeZone = ledgerTimeZone()
    selectedMonth.value = monthKeyForLedgerTimeZone(timeZone, referenceDate)
    selectedDay.value = dateKeyForLedgerTimeZone(timeZone, referenceDate)
    selectedYear.value = Number(selectedDay.value.slice(0, 4))
  }

  watch(
    () => ledgerStore.activeLedgerId,
    (ledgerId) => {
      if (!ledgerId) return
      resetRangeToLedgerToday()
      void syncHomeTransactions()
    },
    { immediate: true },
  )

  watch(
    () => String(route.query.quickAdd ?? ''),
    (flag) => {
      if (flag !== '1') return
      void router.replace(getPreferredBookkeepingPath()).catch(() => {})
    },
    { immediate: true },
  )

  async function syncHomeTransactions(options = {}) {
    try {
      if (!options.skipBudgetMonthSync) {
        await syncBudgetMonthByHomeFilter()
      }
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
    if (isPayCycleLedger()) return
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
    const budgetMonthKey = normalizeMonthKey(budgetStore.monthKey)
    if (nextMode === 'month' && budgetMonthKey) {
      selectedMonth.value = budgetMonthKey
    }
    await syncHomeTransactions()
  }

  async function goCurrentRange() {
    resetRangeToLedgerToday()
    if (filterMode.value === 'year') {
      await syncHomeTransactions()
      return
    }
    if (filterMode.value === 'day') {
      await syncHomeTransactions()
      return
    }
    try {
      await budgetStore.loadCurrentPeriod()
      await syncHomeTransactions({ skipBudgetMonthSync: true })
    } catch (error) {
      uiStore.pushToast(error.message ?? t('home_page.toast.switch_month_failed'), 'error')
    }
  }

  async function applyMonthInput() {
    if (!selectedMonth.value) return
    try {
      if (isPayCycleLedger()) {
        await syncHomeTransactions({ skipBudgetMonthSync: true })
        return
      }
      await budgetStore.loadMonth(selectedMonth.value)
      await syncHomeTransactions({ skipBudgetMonthSync: true })
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

  function handleBudgetPeriodSync() {
    resetRangeToLedgerToday()
    void syncHomeTransactions({ skipBudgetMonthSync: true })
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    window.addEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, handleBudgetPeriodSync)
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, handleBudgetPeriodSync)
  })

  return {
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
  }
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
