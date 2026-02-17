<template>
  <section class="stack">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('transaction_search.title') }}</h2>
        <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
      </header>
      <input
        v-model.trim="keyword"
        class="input"
        type="search"
        :placeholder="t('transaction_search.search_placeholder')"
      />
      <details class="advanced-filter">
        <summary>{{ t('transaction_search.advanced_search') }}</summary>
        <div class="advanced-grid">
          <label>
            {{ t('transaction_search.start_date') }}
            <HomeRangePicker mode="day" :day="startDay" @update:day="pickStartDay" />
          </label>
          <label>
            {{ t('transaction_search.end_date') }}
            <HomeRangePicker mode="day" :day="endDay" @update:day="pickEndDay" />
          </label>
        </div>
      </details>
      <small class="muted">{{ t('transaction_search.results_count', { count: filteredTransactions.length }) }}</small>
    </article>

    <article class="card panel">
      <ul class="tx-list">
        <li
          v-for="tx in filteredTransactions"
          :key="tx.id"
          class="tx-item"
          role="button"
          tabindex="0"
          @click="openEdit(tx)"
        >
          <div class="tx-main">
            <strong class="tx-title">
              <font-awesome-icon v-if="categoryIcon(tx)" :icon="categoryIcon(tx)" class="tx-icon" />
              <span>{{ labelOfTransaction(tx) }}</span>
            </strong>
            <small class="muted tx-account-line">
              <font-awesome-icon v-if="accountIcon(tx.account_id)" :icon="accountIcon(tx.account_id)" class="tx-account-icon" />
              <span>{{ accountName(tx.account_id) }} ・ {{ formatTime(tx.occurred_at) }}</span>
            </small>
            <small class="muted tx-note">{{ tx.note || '-' }}</small>
          </div>
          <div class="amount-wrap">
            <MoneyText :value-minor="tx.amount_minor" />
            <small
              v-if="showAddonDeltaTag(tx)"
              class="addon-delta"
              :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
            >
              {{ addonDeltaTag(tx.note) }}
            </small>
          </div>
        </li>
        <li v-if="!filteredTransactions.length" class="muted empty">{{ t('transaction_search.no_results') }}</li>
      </ul>
    </article>

  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listAllTransactions } from '@/core/repositories/transaction.repo'
import { addonDeltaMajorFromNote, addonDeltaTagText } from '@/ui/utils/addon-note'
import { useI18n } from '@/ui/services/i18n.service'

const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const loanStore = useLoanStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const keyword = ref('')
const startDay = ref('')
const endDay = ref('')
const transactions = ref([])
const pendingOpenTxId = ref('')

onMounted(() => {
  pendingOpenTxId.value = normalizeTxId(route.query.txId)
  void loadTransactions()
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void loadTransactions()
  },
)

watch(
  () => route.query.txId,
  (txId) => {
    pendingOpenTxId.value = normalizeTxId(txId)
    tryOpenPendingTransaction()
  },
)

const filteredTransactions = computed(() => {
  const query = keyword.value.toLowerCase()
  const startMs = dayStartMs(startDay.value)
  const endMs = dayEndMs(endDay.value)

  return transactions.value.filter((tx) => {
    const occurredMs = new Date(tx.occurred_at).getTime()
    if (Number.isFinite(startMs) && occurredMs < startMs) return false
    if (Number.isFinite(endMs) && occurredMs > endMs) return false

    if (!query) return true

    const category = categoryName(tx.category_id)
    const account = accountName(tx.account_id)
    const amount = String(Math.abs(Number(tx.amount_minor ?? 0)) / 100)
    const time = formatTime(tx.occurred_at)
    const note = String(tx.note ?? '')
    const text = `${category} ${account} ${amount} ${time} ${note}`.toLowerCase()
    return text.includes(query)
  })
})

async function loadTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    transactions.value = []
    return
  }

  try {
    transactions.value = await listAllTransactions(ledgerId)
    tryOpenPendingTransaction()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('transaction_search.toast.load_failed'), 'error')
  }
}

function openEdit(tx) {
  if (!tx) return
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}

function labelOfTransaction(tx) {
  if (tx?.origin_type === 'reimbursement') return t('transaction_search.label.reimbursement')
  if (tx?.origin_type === 'loan_payment') return loanTransactionLabel(tx)
  const category = categoryName(tx.category_id)
  if (category) return category
  if (tx.type === 'transfer') return t('transaction_search.label.transfer')
  if (tx.type === 'adjustment') return t('transaction_search.label.adjustment')
  return tx.type === 'income' ? t('transaction_search.label.income') : t('transaction_search.label.expense')
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx?.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx?.type === 'income' ? t('transaction_search.label.loan_receive_back') : t('transaction_search.label.loan_lend')
  if (loanDirection === 'borrow') return tx?.type === 'expense' ? t('transaction_search.label.loan_repay') : t('transaction_search.label.loan_borrow')
  return tx?.type === 'income' ? t('transaction_search.label.loan_receive_back') : t('transaction_search.label.loan_lend')
}

function categoryName(categoryId) {
  return categoryStore.categories.find((item) => item.id === categoryId)?.name || ''
}

function categoryIcon(tx) {
  if (!tx || tx.type === 'adjustment') return ''
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

function accountName(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.name || t('transaction_search.unknown_account')
}

function accountIcon(accountId) {
  return accountStore.accounts.find((item) => item.id === accountId)?.icon || ''
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pickStartDay(value) {
  startDay.value = value
}

function pickEndDay(value) {
  endDay.value = value
}

function parseLocalDateTime(value) {
  if (!value) return NaN
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

function dayStartMs(dayKey) {
  return parseLocalDateTime(dayKey ? `${dayKey}T00:00` : '')
}

function dayEndMs(dayKey) {
  return parseLocalDateTime(dayKey ? `${dayKey}T23:59:59` : '')
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

function normalizeTxId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function clearTxIdQuery() {
  if (!route.query.txId) return
  const nextQuery = { ...route.query }
  delete nextQuery.txId
  void router.replace({ query: nextQuery })
}

function tryOpenPendingTransaction() {
  const txId = pendingOpenTxId.value
  if (!txId) return

  const matched = transactions.value.find((item) => item.id === txId)
  if (!matched) return

  pendingOpenTxId.value = ''
  clearTxIdQuery()
  openEdit(matched)
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2 {
  margin: 0;
  font-size: 18px
}
.advanced-filter {
  margin-top: 8px;
  overflow: hidden;
  max-height: 34px;
  opacity: 0.92;
  transition:
    max-height var(--anim-mid) ease,
    opacity var(--anim-fast) ease
}
.advanced-filter[open] {
  max-height: 240px;
  opacity: 1
}
.advanced-filter summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px
}
.advanced-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.advanced-grid label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px
}
.tx-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.tx-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px
}
.tx-main {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0
}
.tx-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0
}
.tx-icon {
  width: 13px;
  color: var(--primary-soft)
}
.tx-title span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
}
.tx-account-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0
}
.tx-account-icon {
  width: 12px
}
.tx-account-line span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis
}
.tx-note {
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden
}
.amount-wrap {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 0;
  text-align: right
}
.addon-delta {
  font-size: 12px;
  line-height: 1.2
}
.addon-delta.plus {
  color: var(--delta-plus)
}
.addon-delta.minus {
  color: var(--delta-minus)
}
.empty {
  text-align: center;
  padding: 12px
}</style>
