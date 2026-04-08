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
    </article>

    <article class="card panel">
      <header class="row panel-head">
        <small class="muted">{{ t('transaction_search.results_count', { count: filteredTransactions.length }) }}</small>
        <button class="btn" :class="{ active: batchMode }" @click="toggleBatchMode">
          {{ batchMode ? '取消批量' : '批量操作' }}
        </button>
      </header>

      <div v-if="batchMode" class="batch-bar">
        <button class="btn" @click="toggleSelectAll">
          {{ selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0 ? '取消全選' : '全選' }}
        </button>
        <span class="muted batch-count">已選 {{ selectedIds.size }} 筆</span>
        <button class="btn primary" :disabled="selectedIds.size === 0 || batchWorking" @click="openBatchEditSheet">
          批量編輯
        </button>
      </div>

      <ul class="tx-list">
        <li
          v-for="tx in filteredTransactions"
          :key="tx.id"
          class="tx-item"
          :class="{ selectable: batchMode, selected: selectedIds.has(tx.id) }"
          role="button"
          tabindex="0"
          @click="batchMode ? toggleSelect(tx.id) : openEdit(tx)"
        >
          <span v-if="batchMode" class="batch-checkbox" :class="{ checked: selectedIds.has(tx.id) }">
            <font-awesome-icon v-if="selectedIds.has(tx.id)" icon="fa-solid fa-check" />
          </span>
          <div class="tx-main">
            <strong class="tx-title">
              <font-awesome-icon v-if="categoryIcon(tx)" :icon="categoryIcon(tx)" class="tx-icon" />
              <span>{{ labelOfTransaction(tx) }}</span>
            </strong>
            <small class="muted tx-account-line">
              <font-awesome-icon v-if="accountIcon(tx.account_id)" :icon="accountIcon(tx.account_id)" class="tx-account-icon" />
              <span>{{ accountName(tx.account_id) }} ・ {{ formatTime(tx.occurred_at) }}</span>
            </small>
            <small class="muted tx-note">{{ noteText(tx.note) || '-' }}</small>
          </div>
          <div class="amount-wrap">
            <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
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

    <InputBottomSheet
      :open="batchEditSheetOpen"
      title="批量編輯交易"
      :body-class="'stack form-wrap'"
      :show-footer="true"
      :close-text="'取消'"
      @close="closeBatchEditSheet"
    >
      <div class="batch-summary muted">
        已選 {{ selectedIds.size }} 筆
        <span v-if="selectedBatchStats.expenseCount">・支出 {{ selectedBatchStats.expenseCount }}</span>
        <span v-if="selectedBatchStats.incomeCount">・收入 {{ selectedBatchStats.incomeCount }}</span>
        <span v-if="selectedBatchStats.transferCount">・轉帳 {{ selectedBatchStats.transferCount }}</span>
        <span v-if="selectedBatchStats.adjustmentCount">・調整 {{ selectedBatchStats.adjustmentCount }}</span>
      </div>
      <label>
        分類
        <CustomSelect v-model="batchPatch.categoryId" :groups="batchCategoryGroups" :placeholder="'選擇分類（不變 / 指定分類）'" />
      </label>
      <label>
        備註
        <CustomSelect v-model="batchPatch.noteMode" :options="batchNoteModeOptions" :placeholder="'選擇備註處理方式'" />
      </label>
      <label v-if="batchPatch.noteMode === 'replace'">
        新備註
        <textarea v-model.trim="batchPatch.note" class="textarea" rows="3" placeholder="輸入要套用到所有選取交易的備註" />
      </label>
      <label>
        可報銷
        <CustomSelect
          v-model="batchPatch.isReimbursableMode"
          :options="batchReimbursableOptions"
          :placeholder="'選擇是否更新可報銷'"
        />
      </label>
      <label>
        納入預算
        <CustomSelect
          v-model="batchPatch.includeInBudgetMode"
          :options="batchToggleOptions"
          :placeholder="'選擇是否更新納入預算'"
        />
      </label>
      <label>
        納入收支分析
        <CustomSelect
          v-model="batchPatch.includeInAnalysisMode"
          :options="batchToggleOptions"
          :placeholder="'選擇是否更新納入收支分析'"
        />
      </label>
      <p class="muted batch-hint">
        分類只會套用到收入 / 支出交易；可報銷只會套用到支出交易。若所選交易中包含不適用項目，完成後會在結果摘要中顯示略過筆數。
      </p>
      <template #footer>
        <button class="btn primary" :disabled="batchWorking" @click="applyBatchEdit">
          {{ batchWorking ? '更新中...' : `套用至 ${selectedIds.size} 筆` }}
        </button>
      </template>
    </InputBottomSheet>

  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listAllTransactions } from '@/core/repositories/transaction.repo'
import { batchPatchTransactions } from '@/core/services/transaction.service'
import { addonDeltaMajorFromNote, addonDeltaTagText, stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { useI18n } from '@/ui/services/i18n.service'
import {
  BATCH_NOTE_MODE_CLEAR,
  BATCH_NOTE_MODE_KEEP,
  BATCH_NOTE_MODE_REPLACE,
  BATCH_TOGGLE_KEEP,
} from '@/core/services/transaction-batch-patch'

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
const batchMode = ref(false)
const selectedIds = ref(new Set())
const batchEditSheetOpen = ref(false)
const batchWorking = ref(false)
const batchPatch = reactive({
  categoryId: '',
  noteMode: BATCH_NOTE_MODE_KEEP,
  note: '',
  isReimbursableMode: BATCH_TOGGLE_KEEP,
  includeInBudgetMode: BATCH_TOGGLE_KEEP,
  includeInAnalysisMode: BATCH_TOGGLE_KEEP,
})

onMounted(() => {
  pendingOpenTxId.value = normalizeTxId(route.query.txId)
  syncFiltersFromRouteQuery(route.query)
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

watch(
  () => [route.query.startDay, route.query.endDay, route.query.keyword],
  () => {
    syncFiltersFromRouteQuery(route.query)
  },
  { immediate: true },
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

    const category = labelOfTransaction(tx)
    const account = accountName(tx.account_id)
    const amount = String(Math.abs(Number(tx.amount_minor ?? 0)) / 100)
    const time = formatTime(tx.occurred_at)
    const note = noteText(tx.note)
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
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx?.category_name ?? '').trim()
  if (directName) return directName
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
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx.category_icon ?? '').trim()
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

function noteText(note) {
  return stripAddonSummaryFromNote(note).trim()
}

function showAddonDeltaTag(tx) {
  if (!tx) return false
  if (tx.type === 'transfer' && Number(tx.amount_minor ?? 0) > 0) return false
  return Boolean(addonDeltaTag(tx.note))
}

function normalizeTxId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDayQuery(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function syncFiltersFromRouteQuery(query) {
  keyword.value = typeof query?.keyword === 'string' ? query.keyword.trim() : ''
  startDay.value = normalizeDayQuery(query?.startDay)
  endDay.value = normalizeDayQuery(query?.endDay)
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

const allCategoryGroups = computed(() => {
  return [
    ...categoryStore.expenseCategoryGroups,
    ...categoryStore.incomeCategoryGroups,
  ]
})

const batchCategoryGroups = computed(() => {
  return [
    {
      id: 'batch-keep',
      name: '維持原值',
      options: [{ value: '__keep__', label: '分類不變' }],
    },
    ...allCategoryGroups.value,
  ]
})

const batchNoteModeOptions = [
  { value: BATCH_NOTE_MODE_KEEP, label: '備註不變' },
  { value: BATCH_NOTE_MODE_REPLACE, label: '覆蓋備註' },
  { value: BATCH_NOTE_MODE_CLEAR, label: '清空備註' },
]

const batchToggleOptions = [
  { value: BATCH_TOGGLE_KEEP, label: '維持原值' },
  { value: 'true', label: '設為開啟' },
  { value: 'false', label: '設為關閉' },
]

const batchReimbursableOptions = [
  { value: BATCH_TOGGLE_KEEP, label: '維持原值' },
  { value: 'true', label: '設為可報銷' },
  { value: 'false', label: '設為不可報銷' },
]

const selectedBatchTransactions = computed(() => {
  return transactions.value.filter((tx) => selectedIds.value.has(tx.id))
})

const selectedBatchStats = computed(() => {
  return selectedBatchTransactions.value.reduce((summary, tx) => {
    const type = String(tx?.type ?? '').trim()
    if (type === 'expense') summary.expenseCount += 1
    else if (type === 'income') summary.incomeCount += 1
    else if (type === 'transfer') summary.transferCount += 1
    else if (type === 'adjustment') summary.adjustmentCount += 1
    return summary
  }, {
    expenseCount: 0,
    incomeCount: 0,
    transferCount: 0,
    adjustmentCount: 0,
  })
})

function resetBatchPatch() {
  batchPatch.categoryId = '__keep__'
  batchPatch.noteMode = BATCH_NOTE_MODE_KEEP
  batchPatch.note = ''
  batchPatch.isReimbursableMode = BATCH_TOGGLE_KEEP
  batchPatch.includeInBudgetMode = BATCH_TOGGLE_KEEP
  batchPatch.includeInAnalysisMode = BATCH_TOGGLE_KEEP
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedIds.value = new Set()
  batchEditSheetOpen.value = false
  resetBatchPatch()
}

function toggleSelect(txId) {
  const next = new Set(selectedIds.value)
  if (next.has(txId)) {
    next.delete(txId)
  } else {
    next.add(txId)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  if (selectedIds.value.size === filteredTransactions.value.length && filteredTransactions.value.length > 0) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredTransactions.value.map((tx) => tx.id))
  }
}

function openBatchEditSheet() {
  if (selectedIds.value.size === 0) return
  resetBatchPatch()
  batchEditSheetOpen.value = true
}

function closeBatchEditSheet() {
  if (batchWorking.value) return
  batchEditSheetOpen.value = false
}

async function applyBatchEdit() {
  if (batchWorking.value || selectedIds.value.size === 0) return
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return

  batchWorking.value = true
  try {
    const ids = Array.from(selectedIds.value)
    const result = await batchPatchTransactions(ledgerId, ids, {
      categoryId: batchPatch.categoryId === '__keep__' ? '' : batchPatch.categoryId,
      noteMode: batchPatch.noteMode,
      note: batchPatch.note,
      isReimbursableMode: batchPatch.isReimbursableMode,
      includeInBudgetMode: batchPatch.includeInBudgetMode,
      includeInAnalysisMode: batchPatch.includeInAnalysisMode,
    })
    await loadTransactions()
    selectedIds.value = new Set()
    batchEditSheetOpen.value = false
    batchMode.value = false
    resetBatchPatch()
    const summaryParts = [`已更新 ${result.updatedCount} 筆交易`]
    if (result.skippedCount > 0) {
      const firstReason = String(result.skipped?.[0]?.reason ?? '').trim()
      summaryParts.push(`略過 ${result.skippedCount} 筆`)
      if (firstReason) summaryParts.push(`原因：${firstReason}`)
      uiStore.pushToast(summaryParts.join('，'), 'error')
      return
    }
    uiStore.pushToast(summaryParts.join('，'))
  } catch (error) {
    uiStore.pushToast(error.message ?? '批量更改失敗', 'error')
  } finally {
    batchWorking.value = false
  }
}

resetBatchPatch()
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
}
.panel-head {
  margin-bottom: 8px
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  margin-bottom: 4px
}
.batch-count {
  flex: 1
}
.batch-summary,
.batch-hint {
  font-size: 12px;
  line-height: 1.5
}
.tx-item.selectable {
  cursor: pointer;
  gap: 8px
}
.tx-item.selected {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent)
}
.batch-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--primary)
}
.batch-checkbox.checked {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff
}
.btn.active {
  background: var(--primary);
  color: #fff
}</style>
