import { computed, onMounted, reactive, ref, watch } from 'vue'
import { batchPatchTransactions } from '@/core/services/transaction.service'
import { listTransactionsForSearch, TRANSACTION_PAGE_SIZE } from '@/core/services/transaction-query.service'
import {
  BATCH_NOTE_MODE_CLEAR,
  BATCH_NOTE_MODE_KEEP,
  BATCH_NOTE_MODE_REPLACE,
  BATCH_TOGGLE_KEEP,
} from '@/core/services/transaction-batch-patch'
import { addonDeltaMajorFromNote, addonDeltaTagText, stripAddonSummaryFromNote } from '@/ui/utils/addon-note'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import {
  filterTransactionsForSearch,
  summarizeSelectedBatchTransactions,
} from './transaction-search-page.helpers'

function normalizeTxId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDayQuery(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function useTransactionSearchPage({
  ledgerStore,
  categoryStore,
  accountStore,
  loanStore,
  uiStore,
  route,
  router,
  t,
  locale,
}) {
  const keyword = ref('')
  const startDay = ref('')
  const endDay = ref('')
  const transactions = ref([])
  const searchTotal = ref(0)
  const currentPage = ref(1)
  const totalPages = ref(1)
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

  function categoryName(categoryId) {
    return categoryStore.categories.find((item) => item.id === categoryId)?.name || ''
  }

  function loanTransactionLabel(tx) {
    const loanDirection = loanStore.items.find((item) => item.id === tx?.external_ref_id)?.direction
    if (loanDirection === 'lend') return tx?.type === 'income' ? t('transaction_search.label.loan_receive_back') : t('transaction_search.label.loan_lend')
    if (loanDirection === 'borrow') return tx?.type === 'expense' ? t('transaction_search.label.loan_repay') : t('transaction_search.label.loan_borrow')
    return tx?.type === 'income' ? t('transaction_search.label.loan_receive_back') : t('transaction_search.label.loan_lend')
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

  function loanTransactionIcon(tx) {
    const loanDirection = loanStore.items.find((item) => item.id === tx?.external_ref_id)?.direction
    if (loanDirection === 'lend') return tx?.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
    if (loanDirection === 'borrow') return tx?.type === 'expense' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-arrow-down'
    return tx?.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
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

  function openEdit(tx) {
    if (!tx) return
    void router.push({ name: 'transaction-about', params: { id: tx.id } })
  }

  function tryOpenPendingTransaction() {
    const txId = pendingOpenTxId.value
    if (!txId) return

    pendingOpenTxId.value = ''
    clearTxIdQuery()
    openEdit({ id: txId })
  }

  async function loadTransactions() {
    const ledgerId = ledgerStore.activeLedgerId
    if (!ledgerId) {
      transactions.value = []
      searchTotal.value = 0
      currentPage.value = 1
      totalPages.value = 1
      return
    }

    try {
      const result = await listTransactionsForSearch(ledgerId, {
        page: currentPage.value,
        keyword: keyword.value,
        startDay: startDay.value,
        endDay: endDay.value,
      })
      if (result.page > result.totalPages) {
        currentPage.value = result.totalPages
        await loadTransactions()
        return
      }
      transactions.value = result.items
      searchTotal.value = result.total
      totalPages.value = result.totalPages
      tryOpenPendingTransaction()
    } catch (error) {
      uiStore.pushToast(error.message ?? t('transaction_search.toast.load_failed'), 'error')
    }
  }

  function pickStartDay(value) {
    startDay.value = value
  }

  function pickEndDay(value) {
    endDay.value = value
  }

  const filteredTransactions = computed(() => filterTransactionsForSearch({
    transactions: transactions.value,
    keyword: '',
    startDay: '',
    endDay: '',
    labelOfTransaction,
    accountName,
    formatTime,
    noteText,
  }))

  const pageStart = computed(() => {
    if (searchTotal.value <= 0) return 0
    return ((currentPage.value - 1) * TRANSACTION_PAGE_SIZE) + 1
  })
  const pageEnd = computed(() => Math.min(searchTotal.value, currentPage.value * TRANSACTION_PAGE_SIZE))
  const canGoPreviousPage = computed(() => currentPage.value > 1)
  const canGoNextPage = computed(() => currentPage.value < totalPages.value)

  const allCategoryGroups = computed(() => ([
    ...categoryStore.expenseCategoryGroups,
    ...categoryStore.incomeCategoryGroups,
  ]))

  const batchCategoryGroups = computed(() => ([
    {
      id: 'batch-keep',
      name: '維持原值',
      options: [{ value: '__keep__', label: '分類不變' }],
    },
    ...allCategoryGroups.value,
  ]))

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

  const selectedBatchTransactions = computed(() => (
    transactions.value.filter((tx) => selectedIds.value.has(tx.id))
  ))

  const selectedBatchStats = computed(() => summarizeSelectedBatchTransactions(selectedBatchTransactions.value))

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

  function setPage(page) {
    const nextPage = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), totalPages.value)
    if (nextPage === currentPage.value) return
    currentPage.value = nextPage
    selectedIds.value = new Set()
    void loadTransactions()
  }

  function goPreviousPage() {
    if (!canGoPreviousPage.value) return
    setPage(currentPage.value - 1)
  }

  function goNextPage() {
    if (!canGoNextPage.value) return
    setPage(currentPage.value + 1)
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

  onMounted(() => {
    pendingOpenTxId.value = normalizeTxId(route.query.txId)
    syncFiltersFromRouteQuery(route.query)
    void loadTransactions()
  })

  watch(
    () => ledgerStore.activeLedgerId,
    () => {
      currentPage.value = 1
      selectedIds.value = new Set()
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

  watch(
    () => [keyword.value, startDay.value, endDay.value],
    () => {
      currentPage.value = 1
      selectedIds.value = new Set()
      void loadTransactions()
    },
  )

  resetBatchPatch()

  return {
    keyword,
    startDay,
    endDay,
    filteredTransactions,
    searchTotal,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    canGoPreviousPage,
    canGoNextPage,
    batchMode,
    selectedIds,
    batchEditSheetOpen,
    batchWorking,
    batchPatch,
    batchCategoryGroups,
    batchNoteModeOptions,
    batchToggleOptions,
    batchReimbursableOptions,
    selectedBatchStats,
    pickStartDay,
    pickEndDay,
    toggleBatchMode,
    toggleSelectAll,
    openBatchEditSheet,
    closeBatchEditSheet,
    applyBatchEdit,
    toggleSelect,
    goPreviousPage,
    goNextPage,
    openEdit,
    categoryIcon,
    labelOfTransaction,
    accountIcon,
    accountName,
    formatTime,
    noteText,
    showAddonDeltaTag,
    addonDeltaMajor,
    addonDeltaTag,
  }
}
