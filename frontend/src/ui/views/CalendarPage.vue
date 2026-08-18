<template>
  <section class="stack">
    <header class="row page-header">
      <h2>{{ t('calendar_page.title') }}</h2>
      <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <div class="row month-head">
        <button class="btn mini-btn" @click="goPrevMonth">‹</button>
        <strong>{{ monthLabel }}</strong>
        <button class="btn mini-btn" @click="goNextMonth">›</button>
      </div>

      <div class="week-head">
        <span v-for="item in weekLabels" :key="item">{{ item }}</span>
      </div>

      <div class="calendar-grid">
        <button
          v-for="cell in calendarCells"
          :key="cell.key"
          class="day-cell"
          :class="{ empty: !cell.dateKey, selected: cell.dateKey === selectedDateKey }"
          :disabled="!cell.dateKey"
          @click="selectDay(cell.dateKey)"
        >
          <span class="day-num">{{ cell.dayLabel }}</span>
          <span v-if="cell.dateKey && cell.incomeMinor > 0" class="day-amount income">+{{ formatMinor(cell.incomeMinor) }}</span>
          <span v-if="cell.dateKey && cell.expenseMinor > 0" class="day-amount expense">-{{ formatMinor(cell.expenseMinor) }}</span>
        </button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('calendar_page.day_tx', { date: selectedDateKey || '-' }) }}</h3>
        <div v-if="selectedDayIncomeMinor > 0 || selectedDayExpenseMinor > 0" class="day-total">
          <span v-if="selectedDayIncomeMinor > 0" class="income">+{{ formatMinor(selectedDayIncomeMinor) }}</span>
          <span v-if="selectedDayExpenseMinor > 0" class="expense">-{{ formatMinor(selectedDayExpenseMinor) }}</span>
        </div>
      </header>

      <ul class="tx-list">
        <li
          v-for="tx in selectedDayTransactions"
          :key="tx.id"
          class="tx-item"
          role="button"
          tabindex="0"
          @click="openTx(tx.id)"
          @keydown.enter.prevent="openTx(tx.id)"
        >
          <div class="tx-icon-col">
            <font-awesome-icon v-if="txIcon(tx)" :icon="txIcon(tx)" class="tx-icon" />
          </div>
          <div class="tx-main">
            <div class="tx-type">
              <span>{{ txLabel(tx) }}</span>
            </div>
            <small class="muted">{{ formatTime(tx.occurred_at) }}</small>
          </div>
          <div class="tx-side">
            <div class="amount-line">
              <small
                v-if="showAddonDeltaTag(tx)"
                class="addon-delta"
                :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
              >
                {{ addonDeltaTag(tx.note) }}
              </small>
              <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
            </div>
            <small class="muted tx-account-side">{{ accountNameOfTransaction(tx) }}</small>
          </div>
        </li>
        <li v-if="selectedDayTransactions.length === 0" class="muted">{{ t('calendar_page.empty_day') }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { listTransactionsForCalendarMonth } from '@/core/services/transaction-query.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { addonDeltaMajorFromNote, addonDeltaTagText } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { monthKeyFromDate, dateKeyFromDate } from '@/core/utils/id'

const router = useRouter()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const loanStore = useLoanStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const currentMonth = ref(monthKeyFromDate(new Date()))
const selectedDateKey = ref(dateKeyFromDate(new Date()))
const monthTransactions = ref([])
// 2024-01-07 is a Sunday; generate narrow weekday labels for Sun–Sat
const weekLabels = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i))
  )
)

watch(
  () => [ledgerStore.activeLedgerId, currentMonth.value],
  () => {
    void loadMonthTransactions()
  },
  { immediate: true },
)

const dailyMap = computed(() => {
  const map = new Map()
  for (const tx of monthTransactions.value) {
    const dateKey = dateKeyFromIso(tx.occurred_at)
    if (!dateKey) continue
    const current = map.get(dateKey) ?? { incomeMinor: 0, expenseMinor: 0, list: [] }
    if (tx.type === 'income') current.incomeMinor += Math.abs(Number(tx.amount_minor ?? 0))
    if (tx.type === 'expense') current.expenseMinor += Math.abs(Number(tx.amount_minor ?? 0))
    current.list.push(tx)
    map.set(dateKey, current)
  }
  return map
})

const monthLabel = computed(() => {
  const [year, month] = currentMonth.value.split('-')
  return `${year}/${month}`
})

const calendarCells = computed(() => {
  const [yearText, monthText] = currentMonth.value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ key: `empty-${i}`, dateKey: '', dayLabel: '', incomeMinor: 0, expenseMinor: 0 })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${yearText}-${monthText}-${String(day).padStart(2, '0')}`
    const dayData = dailyMap.value.get(dateKey) ?? { incomeMinor: 0, expenseMinor: 0 }
    cells.push({
      key: dateKey,
      dateKey,
      dayLabel: String(day),
      incomeMinor: dayData.incomeMinor,
      expenseMinor: dayData.expenseMinor,
    })
  }
  return cells
})

const selectedDayTransactions = computed(() => {
  const rows = dailyMap.value.get(selectedDateKey.value)?.list ?? []
  return [...rows].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
})

const selectedDayIncomeMinor = computed(() => Number(dailyMap.value.get(selectedDateKey.value)?.incomeMinor ?? 0))
const selectedDayExpenseMinor = computed(() => Number(dailyMap.value.get(selectedDateKey.value)?.expenseMinor ?? 0))
const ledgerCurrencyCode = computed(() => normalizeCurrencyCode(ledgerStore.activeLedger?.currency_code, 'TWD'))

function selectDay(dateKey) {
  if (!dateKey) return
  selectedDateKey.value = dateKey
}

function goPrevMonth() {
  const [yearText, monthText] = currentMonth.value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const prev = new Date(year, month - 2, 1)
  currentMonth.value = monthKeyFromDate(prev)
  selectedDateKey.value = `${currentMonth.value}-01`
}

function goNextMonth() {
  const [yearText, monthText] = currentMonth.value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const next = new Date(year, month, 1)
  currentMonth.value = monthKeyFromDate(next)
  selectedDateKey.value = `${currentMonth.value}-01`
}

async function loadMonthTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    monthTransactions.value = []
    return
  }
  try {
    monthTransactions.value = await listTransactionsForCalendarMonth(ledgerId, currentMonth.value)
  } catch (error) {
    uiStore.pushToast(error?.message ?? t('calendar_page.toast.load_failed'), 'error')
  }
}

function txLabel(tx) {
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx?.category_name ?? '').trim()
  if (directName) return directName
  if (tx.type === 'transfer') return t('transaction_search.label.transfer')
  if (tx.type === 'adjustment') return t('transaction_search.label.adjustment')
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  return tx.type === 'income' ? t('transaction_search.label.income') : t('transaction_search.label.expense')
}

function txIcon(tx) {
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx?.category_icon ?? '').trim()
  if (directIcon) return directIcon
  if (tx.type === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  if (tx.origin_type === 'reimbursement') return 'fa-solid fa-receipt'
  if (tx.origin_type === 'loan_payment') return loanTransactionIcon(tx)
  return categoryStore.categories.find((item) => item.id === tx.category_id)?.icon || ''
}

function loanTransactionIcon(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx?.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx?.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
  if (loanDirection === 'borrow') return tx?.type === 'expense' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-arrow-down'
  return tx?.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
}

function openTx(txId) {
  if (!txId) return
  void router.push({ name: 'transaction-about', params: { id: txId } })
}

function addonDeltaMajor(note) {
  return addonDeltaMajorFromNote(note)
}

function addonDeltaTag(note) {
  return addonDeltaTagText(note)
}

function showAddonDeltaTag(tx) {
  if (!tx) return false
  if (tx.type === 'transfer' && Number(tx.amount_minor ?? 0) > 0) return false
  return Boolean(addonDeltaTag(tx.note))
}

function accountNameOfTransaction(tx) {
  if (!tx?.account_id) return t('transaction_search.unknown_account')
  return accountStore.accounts.find((item) => item.id === tx.account_id)?.name ?? t('transaction_search.unknown_account')
}

function formatTime(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(resolveIntlLocale(), { hour: '2-digit', minute: '2-digit' })
}

function formatMinor(minor) {
  const value = Math.abs(Number(minor ?? 0))
  return new Intl.NumberFormat(resolveIntlLocale(), {
    style: 'currency',
    currency: ledgerCurrencyCode.value,
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

function dateKeyFromIso(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return dateKeyFromDate(date)
}
</script>

<style scoped>
.panel {
  padding: 14px;
  overflow: hidden;
}
.panel h3 {
  margin: 0;
}
.month-head {
  justify-content: space-between;
  align-items: center;
}
.mini-btn {
  min-width: 42px;
}
.week-head {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  width: min(100%, 460px);
  margin-inline: auto;
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.calendar-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  width: min(100%, 460px);
  margin-inline: auto;
  min-width: 0;
}
.day-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 92%, transparent);
  aspect-ratio: 1 / 1;
  min-height: 52px;
  padding: 4px 3px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 2px;
  overflow: hidden;
  min-width: 0;
  color: var(--text);
}
.day-cell.empty {
  background: transparent;
  border-style: dashed;
}
.day-cell.selected {
  border-color: var(--primary);
}
.day-num {
  font-weight: 700;
  font-size: 12px;
  align-self: flex-start;
  line-height: 1.2;
}
.day-amount {
  width: 100%;
  font-size: 9px;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.income {
  color: #22c55e;
}
.expense {
  color: #ef4444;
}
.tx-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.tx-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 90%, transparent);
  cursor: pointer;
  outline: none;
}
.tx-item:focus,
.tx-item:focus-visible {
  outline: none;
  box-shadow: none;
}
.tx-icon-col {
  height: 100%;
  width: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  align-items: center;
  display: flex;
  flex-shrink: 0;
}
.tx-icon {
  font-size: 22px;
  margin-top: 1px;
  color: var(--primary-soft);
  flex-shrink: 0;
}
.tx-main {
  flex: 1;
  min-width: 0;
}
.tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 0;
  text-align: right;
  min-width: 104px;
}
.amount-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.addon-delta {
  font-size: 12px;
  line-height: 1.2;
}
.addon-delta.plus {
  color: var(--delta-plus);
}
.addon-delta.minus {
  color: var(--delta-minus);
}
.tx-type {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 4px;
  min-width: 0;
  max-width: 100%;
}
.tx-type span {
  min-width: 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tx-main .muted {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tx-account-side {
  max-width: 120px;
}
.day-total {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

@media (max-width: 480px) {
  .panel {
    padding: 8px;
  }
  .week-head,
  .calendar-grid {
    width: 100%;
    gap: 3px;
  }
  .day-cell {
    min-height: 46px;
    padding: 3px 2px;
  }
  .day-num {
    font-size: 11px;
  }
  .day-amount {
    font-size: 8px;
  }
}
</style>
