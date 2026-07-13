import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'
import { monthKeyFromDate, dateKeyFromDate } from '@/core/utils/id'

export function useHomePeriodFilter() {
  const route = useRoute()
  const router = useRouter()
  const ledgerStore = useLedgerStore()
  const budgetStore = useBudgetStore()
  const transactionStore = useTransactionStore()
  const uiStore = useUiStore()
  const { t } = useI18n()

  const filterMode = ref('month')
  const selectedMonth = ref(normalizeMonthKey(budgetStore.monthKey) || monthKeyFromDate(new Date()))
  const selectedDay = ref(dateKeyFromDate(new Date()))
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
      void router.replace(getPreferredBookkeepingPath()).catch(() => {})
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
    const budgetMonthKey = normalizeMonthKey(budgetStore.monthKey)
    if (nextMode === 'month' && budgetMonthKey) {
      selectedMonth.value = budgetMonthKey
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
