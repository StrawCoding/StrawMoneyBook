<template>
  <section class="stack counterparty-page">
    <header class="row page-head">
      <h2>{{ displayCounterpartyName(counterpartyName) }}</h2>
      <div class="row head-actions">
        <button class="btn" :disabled="!visibleLoans.length" @click="exportCsv">{{ t('analysis_print.export_csv') }}</button>
        <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
      </div>
    </header>

    <div class="row counterparty-create-actions">
      <button class="btn primary" @click="openCreateSheet('lend')">
        <font-awesome-icon icon="fa-solid fa-arrow-up" class="counterparty-create-icon" />
        {{ t('loans.add_lend_for_person') }}
      </button>
      <button class="btn primary" @click="openCreateSheet('borrow')">
        <font-awesome-icon icon="fa-solid fa-arrow-down" class="counterparty-create-icon" />
        {{ t('loans.add_borrow_for_person') }}
      </button>
    </div>

    <article class="card panel">
      <div class="row summary-row">
        <span class="muted">{{ summaryLabel }}</span>
        <MoneyText :value-minor="outstandingMinor" />
      </div>
      <div class="row summary-row">
        <span class="muted">{{ t('loans.active_count') }}</span>
        <span class="badge">{{ activeCount }}</span>
      </div>
    </article>

    <article class="card panel">
      <div class="row list-header">
        <div class="tab-row">
          <button class="btn" :class="{ primary: tab === 'lend' }" @click="tab = 'lend'">{{ t('loans.lend') }}</button>
          <button class="btn" :class="{ primary: tab === 'borrow' }" @click="tab = 'borrow'">{{ t('loans.borrow') }}</button>
        </div>
        <button class="btn end-btn" :class="{ primary: showFinished }" @click="showFinished = !showFinished">
          {{ showFinished ? t('loans.active') : t('loans.finished') }}
        </button>
      </div>

      <ul class="list">
        <li v-for="loan in visibleLoans" :key="loan.id" class="entry">
          <label class="entry-select" :aria-label="t('loans.select_loan', { id: loan.id })" @click.stop>
            <input
              :checked="isLoanSelected(loan.id)"
              type="checkbox"
              @change="toggleLoanSelection(loan.id, $event)"
            />
            <span class="entry-select-mark">
              <font-awesome-icon icon="fa-solid fa-check" />
            </span>
          </label>

          <div
            class="entry-body clickable-entry"
            role="button"
            tabindex="0"
            @click="openLoanDetail(loan.id)"
            @keydown.enter.prevent="openLoanDetail(loan.id)"
            @keydown.space.prevent="openLoanDetail(loan.id)"
          >
            <div class="icon-col">
              <font-awesome-icon :icon="loanDirectionIcon(loan)" class="loan-icon" />
            </div>

            <div class="entry-content">
              <div class="row item-main">
                <span class="row item-block">
                  <small class="muted">{{ t('analysis_print.col.amount') }}</small>
                  <MoneyText :value-minor="loan.principal_minor" />
                </span>
                <span class="row item-block">
                  <small class="muted">{{ paidLabel(loan) }}</small>
                  <MoneyText :value-minor="loan.paid_minor ?? 0" />
                </span>
                <span class="row item-block">
                  <small class="muted">{{ t('loans.remaining') }}</small>
                  <MoneyText :value-minor="loan.remaining_minor ?? 0" />
                </span>
              </div>

              <div class="row item-meta">
                <span class="row item-block">
                  <small class="muted">{{ t('common.account') }}</small>
                  <span class="item-value">{{ loan.setup_account_name || '—' }}</span>
                </span>
                <span class="row item-block">
                  <small class="muted">{{ t('analysis_print.col.date') }}</small>
                  <span class="item-value">{{ formatDateTime(loan.setup_occurred_at || loan.created_at) }}</span>
                </span>
              </div>
            </div>
          </div>
        </li>
        <li v-if="visibleLoans.length === 0" class="muted">{{ showFinished ? t('loans.empty_finished') : t('loans.empty_active') }}</li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="selection-dock-slide">
        <section v-if="isSelectionDockVisible" class="selection-dock card">
          <div class="selection-dock-copy">
            <small class="muted">{{ t('common.selected_of_total', { count: selectedVisibleCount, total: visibleLoans.length }) }}</small>
            <button class="btn primary" :disabled="!selectedVisibleCount" @click="openSelectionActionSheet">{{ t('common.actions') }}</button>
          </div>
          <button class="select-all-btn" type="button" @click="toggleSelectAllVisible">
            <span class="select-all-check" :class="{ active: isAllVisibleSelected }">
              <font-awesome-icon icon="fa-solid fa-check" />
            </span>
            <span class="select-all-label-wrap">
              <transition name="select-all-label" mode="out-in">
                <span :key="isAllVisibleSelected ? 'cancel-all' : 'select-all'" class="select-all-label">
                  {{ isAllVisibleSelected ? t('settings_carrier_sync.review.select_none') : t('settings_carrier_sync.review.select_all') }}
                </span>
              </transition>
            </span>
          </button>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="selectionActionSheetOpen" class="sheet-mask" @click.self="closeSelectionActionSheet">
          <article class="sheet card action-sheet app-bottom-sheet">
            <header class="row">
              <h3>{{ t('loans.actions_title') }}</h3>
              <button class="btn" @click="closeSelectionActionSheet">{{ t('common.close') }}</button>
            </header>
            <small class="muted action-hint">{{ t('common.selected_count', { count: selectedVisibleCount }) }}</small>
            <div class="stack action-list app-bottom-sheet-body">
              <button
                v-if="canCollectSelected"
                class="btn action-btn"
                @click="actionCollectSelected"
              >
                {{ selectedCollectionCandidates.length > 1 ? t('loans.batch_action', { action: collectionLabelByDirection(tab) }) : collectionLabelByDirection(tab) }}
              </button>
              <button
                v-if="canCompleteSelected"
                class="btn action-btn"
                @click="openConfirmDialog('void')"
              >
                {{ t('common.done') }}
              </button>
              <button
                v-if="canRestoreSelected"
                class="btn action-btn"
                @click="openConfirmDialog('restore')"
              >
                {{ t('common.restore') }}
              </button>
              <button
                v-if="canDeleteSelected"
                class="btn danger action-btn"
                @click="openConfirmDialog('delete')"
              >
                {{ t('common.delete') }}
              </button>
              <div class="action-pair-row">
                <button class="btn action-btn" :disabled="!selectedVisibleCount" @click="clearSelection">{{ t('settings_bank_sync.review.select_none') }}</button>
                <button class="btn action-btn" @click="closeSelectionActionSheet">{{ t('common.cancel') }}</button>
              </div>
            </div>
          </article>
        </section>
      </transition>
    </teleport>

    <InputBottomSheet
      :open="createOpen"
      :title="t('loans.add')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeCreateSheet"
    >
              <label>
                {{ t('loans.direction') }}
                <CustomSelect v-model="createForm.direction" :options="directionOptions" />
              </label>

              <label>
                {{ t('loans.counterparty_name') }}
                <input v-model="createForm.counterpartyName" class="input" />
              </label>

              <label>
                {{ t('loans.principal_yuan') }}
                <input v-model.number="createForm.principalMajor" class="input" type="number" min="0" step="1" />
              </label>

              <label>
                {{ t('loans.preset_interest_optional') }}
                <input v-model.number="createForm.interestMajor" class="input" type="number" min="0" step="1" />
              </label>

              <div class="field-block">
                <span class="field-label">{{ t('loans.start_date') }}</span>
                <div class="date-picker-wrap">
                  <DateTimePickerField
                    :date="createForm.startDate"
                    :hour="createForm.startHour"
                    :minute="createForm.startMinute"
                    prefer-bottom-anchor
                    @update:date="pickCreateStartDate"
                    @update:hour="pickCreateStartHour"
                    @update:minute="pickCreateStartMinute"
                  />
                </div>
              </div>

              <div class="field-block">
                <span class="field-label">{{ t('loans.due_optional') }}</span>
                <div class="row due-date-row">
                  <div class="due-picker-wrap">
                    <DateTimePickerField
                      :date="createForm.dueDate"
                      :hour="createForm.dueHour"
                      :minute="createForm.dueMinute"
                      prefer-bottom-anchor
                      @update:date="pickCreateDueDate"
                      @update:hour="pickCreateDueHour"
                      @update:minute="pickCreateDueMinute"
                    />
                  </div>
                  <button class="btn mini-btn" type="button" @click="clearCreateDueDate">{{ t('common.clear') }}</button>
                </div>
              </div>

              <label>
                {{ t('loans.setup_account') }}
                <CustomSelect v-model="createForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>

              <label>
                {{ t('common.note') }}
                <textarea v-model="createForm.note" class="textarea" rows="2" />
              </label>
      <template #footer>
        <button class="btn" @click="closeCreateSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="createLoan">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="repayOpen"
      :title="t('loans.loan_action_title', { action: collectionLabel(repayLoan) })"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeRepaySheet"
    >
              <p class="muted">{{ repayLoan?.counterparty_name }} / {{ t('loans.remaining') }} <MoneyText :value-minor="repayLoan?.remaining_minor ?? 0" /></p>
              <label>
                {{ collectionLabel(repayLoan) }}{{ t('common.amount_yuan') }}
                <input v-model.number="repayForm.amountMajor" class="input" type="number" min="0" step="1" />
              </label>

              <label>
                {{ t('common.account') }}
                <CustomSelect v-model="repayForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>

              <label>
                {{ t('common.note') }}
                <textarea v-model="repayForm.note" class="textarea" rows="2" />
              </label>
      <template #footer>
        <button class="btn" @click="closeRepaySheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submitRepayment">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="batchRepayOpen"
      :title="t('loans.batch_action', { action: collectionLabelByDirection(tab) })"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      @close="closeBatchRepaySheet"
    >
              <p class="muted">
                {{ displayCounterpartyName(counterpartyName) }} / {{ t('common.total_items', { count: batchRepayCandidates.length }) }}{{ t('loans.select_prefix') }} /
                {{ t('loans.remaining') }} <MoneyText :value-minor="batchRepayTotalMinor" />
              </p>
              <label>
                {{ t('loans.batch_action', { action: collectionLabelByDirection(tab) }) }}{{ t('common.amount_yuan') }}
                <input v-model.number="batchRepayForm.amountMajor" class="input" type="number" min="0" step="1" />
              </label>

              <label>
                {{ t('common.account') }}
                <CustomSelect v-model="batchRepayForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>

              <label>
                {{ t('common.note') }}
                <textarea v-model="batchRepayForm.note" class="textarea" rows="2" />
              </label>

              <div class="stack batch-preview">
                <small class="muted">{{ t('loans.offset_earlier_first') }}</small>
                <div v-for="loan in batchRepayCandidates" :key="loan.id" class="row batch-preview-item">
                  <span>{{ formatDateTime(loan.start_date || loan.setup_occurred_at || loan.created_at) }}</span>
                  <span><MoneyText :value-minor="loan.remaining_minor" /></span>
                </div>
              </div>
      <template #footer>
        <button class="btn" @click="closeBatchRepaySheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submitBatchRepayment">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

    <AppDialog
      :open="confirmDialog.open"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      :loading="confirmDialog.loading"
      :confirm-text="confirmDialogConfirmText"
      @close="closeConfirmDialog"
      @confirm="confirmDialogAction"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import {
  createCsvBlobUrl,
  exportLoanItemsCsv,
  openFileUrl,
  revokeBlobUrl,
  saveCsvFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import { useI18n } from '@/ui/services/i18n.service'
import {
  buildLoanCounterpartyQuery,
  buildLoanListQuery,
  normalizeLoanFinished,
  normalizeLoanTab,
} from '@/ui/views/loans/loan-route-state.js'

const route = useRoute()
const router = useRouter()
const loanStore = useLoanStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const transactionStore = useTransactionStore()
const budgetStore = useBudgetStore()
const { t } = useI18n()

const repayOpen = ref(false)
const repayLoan = ref(null)
const batchRepayOpen = ref(false)
const createOpen = ref(false)
const selectionActionSheetOpen = ref(false)
const tab = ref('lend')
const showFinished = ref(false)
const selectedLoanIds = ref([])
const batchRepayLoanIds = ref([])
let exportedUrl = ''

const directionOptions = computed(() => [
  { value: 'lend', label: t('loans.lend_receivable') },
  { value: 'borrow', label: t('loans.borrow_payable') },
])

const createForm = reactive({
  direction: 'lend',
  counterpartyName: '',
  principalMajor: null,
  interestMajor: null,
  startDate: new Date().toISOString().slice(0, 10),
  startHour: new Date().getHours(),
  startMinute: new Date().getMinutes(),
  dueDate: '',
  dueHour: new Date().getHours(),
  dueMinute: new Date().getMinutes(),
  accountId: '',
  note: '',
})

const repayForm = reactive({
  amountMajor: null,
  accountId: '',
  note: '',
})
const batchRepayForm = reactive({
  amountMajor: null,
  accountId: '',
  note: '',
})
const confirmDialog = reactive({
  open: false,
  loading: false,
  type: 'void',
  loanIds: [],
})

const counterpartyName = computed(() => normalizeCounterpartyName(route.query.name))
const backLink = computed(() => ({
  name: 'loans',
  query: buildLoanListQuery(route.query, {
    tab: tab.value,
    showFinished: showFinished.value,
  }),
}))
const defaultAccountId = computed(() => accountStore.accounts[0]?.id ?? '')
const loansByCounterpartyAndTab = computed(() => {
  return loanStore.items.filter((loan) => {
    if (loan.direction !== tab.value) return false
    return normalizeCounterpartyName(loan.counterparty_name) === counterpartyName.value
  })
})
const visibleLoans = computed(() => {
  if (showFinished.value) {
    return loansByCounterpartyAndTab.value.filter((loan) => ['settled', 'void'].includes(loan.status))
  }
  return loansByCounterpartyAndTab.value.filter((loan) => ['active', 'partial'].includes(loan.status))
})
const visibleLoanIdSet = computed(() => new Set(visibleLoans.value.map((loan) => String(loan.id))))
const selectedVisibleSet = computed(() => new Set(selectedLoanIds.value.map((id) => String(id))))
const selectedVisibleLoans = computed(() => {
  if (!selectedVisibleSet.value.size) return []
  return visibleLoans.value.filter((loan) => selectedVisibleSet.value.has(String(loan.id)))
})
const selectedVisibleCount = computed(() => selectedVisibleLoans.value.length)
const isAllVisibleSelected = computed(() => {
  if (!visibleLoans.value.length) return false
  return visibleLoans.value.every((loan) => selectedVisibleSet.value.has(String(loan.id)))
})
const isSelectionDockVisible = computed(() => {
  return visibleLoans.value.length > 0
    && !selectionActionSheetOpen.value
    && !repayOpen.value
    && !batchRepayOpen.value
    && !createOpen.value
})
const selectedCollectionCandidates = computed(() => selectedVisibleLoans.value.filter((loan) => canRepay(loan)))
const canCollectSelected = computed(() => !showFinished.value && selectedCollectionCandidates.value.length > 0)
const canCompleteSelected = computed(() => {
  return !showFinished.value
    && selectedVisibleLoans.value.length > 0
    && selectedVisibleLoans.value.every((loan) => ['active', 'partial'].includes(String(loan.status ?? '')))
})
const canDeleteSelected = computed(() => {
  return selectedVisibleLoans.value.length > 0
    && selectedVisibleLoans.value.every((loan) => canDeleteLoan(loan))
})
const canRestoreSelected = computed(() => {
  return showFinished.value
    && selectedVisibleLoans.value.length > 0
    && selectedVisibleLoans.value.every((loan) => String(loan.status ?? '') === 'void')
})
const batchRepayCandidates = computed(() => {
  const targetIds = new Set(batchRepayLoanIds.value.map((id) => String(id)))
  return loansByCounterpartyAndTab.value
    .filter((loan) => {
      return targetIds.has(String(loan.id))
        && ['active', 'partial'].includes(String(loan.status ?? ''))
    })
    .slice()
    .sort((a, b) => batchLoanSortTime(a) - batchLoanSortTime(b) || String(a.id ?? '').localeCompare(String(b.id ?? '')))
})
const batchRepayTotalMinor = computed(() => {
  return batchRepayCandidates.value.reduce((total, loan) => total + Math.max(0, Number(loan.remaining_minor ?? 0)), 0)
})
const outstandingMinor = computed(() => {
  return loansByCounterpartyAndTab.value
    .filter((loan) => ['active', 'partial', 'settled'].includes(loan.status))
    .reduce((total, loan) => total + Number(loan.remaining_minor ?? 0), 0)
})
const activeCount = computed(() => {
  return loansByCounterpartyAndTab.value.filter((loan) => ['active', 'partial'].includes(loan.status)).length
})
const summaryLabel = computed(() => {
  return tab.value === 'lend' ? t('loans.they_owe_you') : t('loans.you_owe_them')
})
const confirmDialogTitle = computed(() => {
  if (confirmDialog.type === 'delete') return t('loans.delete_loan')
  if (confirmDialog.type === 'restore') return t('loans.restore_loan')
  return t('loans.complete_loan')
})
const confirmDialogConfirmText = computed(() => {
  if (confirmDialog.type === 'delete') return t('common.confirm_delete')
  if (confirmDialog.type === 'restore') return t('common.confirm_restore')
  return t('claim_sheet.confirm_complete')
})
const confirmDialogMessage = computed(() => {
  const count = confirmDialog.loanIds.length
  if (confirmDialog.type === 'delete') {
    return count > 1
      ? t('loans.confirm_delete_n', { count })
      : t('loans.confirm_delete')
  }
  if (confirmDialog.type === 'restore') {
    return count > 1
      ? t('loans.confirm_restore_n', { count })
      : t('loans.confirm_restore_one')
  }
  return count > 1
    ? t('loans.confirm_complete_n', { count })
    : t('loans.confirm_complete')
})

onMounted(() => {
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
  syncTabFromRoute(route.query.tab)
  syncFinishedFromRoute(route.query.finished)
  void Promise.all([loanStore.load(), accountStore.load()])
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
  revokeBlobUrl(exportedUrl)
})

watch(
  () => route.query.tab,
  (tabValue) => {
    syncTabFromRoute(tabValue)
  },
)

watch(
  () => route.query.finished,
  (value) => {
    syncFinishedFromRoute(value)
  },
)

watch([tab, showFinished], () => {
  clearSelection()
  closeSelectionActionSheet()
})

watch(
  () => visibleLoans.value.map((loan) => String(loan.id)).join('|'),
  () => {
    pruneSelections()
  },
  { immediate: true },
)

watch([tab, showFinished, counterpartyName], ([nextTab, nextShowFinished, nextName]) => {
  const nextQuery = buildLoanCounterpartyQuery(route.query, {
    name: nextName,
    tab: nextTab,
    showFinished: nextShowFinished,
  })
  if (
    route.query.name === nextQuery.name
    && route.query.tab === nextQuery.tab
    && route.query.finished === nextQuery.finished
  ) {
    return
  }
  void router.replace({
    query: nextQuery,
  })
})

function syncTabFromRoute(tabValue) {
  tab.value = normalizeLoanTab(tabValue)
}

function syncFinishedFromRoute(value) {
  showFinished.value = normalizeLoanFinished(value)
}

function normalizeCounterpartyName(rawName) {
  return String(rawName ?? '').trim() || '未命名對象'
}

function displayCounterpartyName(name) {
  return name === '未命名對象' ? t('common.unnamed_counterparty') : name
}

function collectionLabel(item) {
  return item?.direction === 'borrow' ? t('loans.repay') : t('loans.collect')
}

function collectionLabelByDirection(direction) {
  return direction === 'borrow' ? t('loans.repay') : t('loans.collect')
}

function paidLabel(item) {
  return item?.direction === 'borrow' ? t('loans.repaid') : t('loans.collected')
}

async function refreshLinkedData() {
  await Promise.all([
    transactionStore.loadRecent(),
    budgetStore.loadMonth(budgetStore.monthKey),
    accountStore.load(),
  ])
}

function canRepay(loan) {
  return ['active', 'partial'].includes(loan.status)
}

function canDeleteLoan(loan) {
  if (!loan) return false
  return loan.direction === 'lend' || ['void', 'settled'].includes(loan.status)
}

function loanDirectionIcon(loan) {
  return loan?.direction === 'borrow' ? 'fa-solid fa-arrow-down' : 'fa-solid fa-arrow-up'
}

function batchLoanSortTime(loan) {
  const raw = String(loan?.start_date ?? loan?.setup_occurred_at ?? loan?.created_at ?? '')
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function pruneSelections() {
  selectedLoanIds.value = selectedLoanIds.value.filter((id) => visibleLoanIdSet.value.has(String(id)))
  batchRepayLoanIds.value = batchRepayLoanIds.value.filter((id) => visibleLoanIdSet.value.has(String(id)))
}

function clearSelection() {
  selectedLoanIds.value = []
}

function isLoanSelected(loanId) {
  return selectedVisibleSet.value.has(String(loanId))
}

function toggleLoanSelection(loanId, event) {
  const normalizedId = String(loanId ?? '').trim()
  if (!normalizedId) return
  const next = new Set(selectedLoanIds.value.map((id) => String(id)))
  if (event?.target?.checked) {
    next.add(normalizedId)
  } else {
    next.delete(normalizedId)
  }
  selectedLoanIds.value = Array.from(next)
}

function toggleSelectAllVisible() {
  if (isAllVisibleSelected.value) {
    clearSelection()
    return
  }
  selectedLoanIds.value = visibleLoans.value.map((loan) => String(loan.id))
}

function openSelectionActionSheet() {
  if (!selectedVisibleCount.value) return
  selectionActionSheetOpen.value = true
}

function closeSelectionActionSheet() {
  selectionActionSheetOpen.value = false
}

function openCreateSheet(directionOverride) {
  const now = new Date()
  // SMB-225 v1.2.50: the header now exposes two dedicated buttons —
  // 「新增該對象借出」/「新增該對象借入」 — which pass an explicit direction
  // so the create sheet locks the chosen side. Older single-button callers
  // (none after v1.2.50, but kept for safety) fall back to the active tab.
  const normalizedDirection = directionOverride === 'borrow'
    ? 'borrow'
    : directionOverride === 'lend'
      ? 'lend'
      : (tab.value === 'borrow' ? 'borrow' : 'lend')
  createOpen.value = true
  createForm.direction = normalizedDirection
  createForm.counterpartyName = counterpartyName.value === '未命名對象' ? '' : counterpartyName.value
  createForm.principalMajor = null
  createForm.interestMajor = null
  createForm.startDate = now.toISOString().slice(0, 10)
  createForm.startHour = now.getHours()
  createForm.startMinute = now.getMinutes()
  createForm.dueDate = ''
  createForm.dueHour = now.getHours()
  createForm.dueMinute = now.getMinutes()
  createForm.accountId = defaultAccountId.value
  createForm.note = ''
}

function closeCreateSheet() {
  createOpen.value = false
}

function pickCreateStartDate(value) {
  createForm.startDate = String(value ?? '')
}

function pickCreateStartHour(value) {
  createForm.startHour = Number(value ?? 0)
}

function pickCreateStartMinute(value) {
  createForm.startMinute = Number(value ?? 0)
}

function pickCreateDueDate(value) {
  createForm.dueDate = String(value ?? '')
}

function pickCreateDueHour(value) {
  createForm.dueHour = Number(value ?? 0)
}

function pickCreateDueMinute(value) {
  createForm.dueMinute = Number(value ?? 0)
}

function clearCreateDueDate() {
  createForm.dueDate = ''
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatLoanDateTime(date, hour, minute) {
  return `${date} ${pad2(hour)}:${pad2(minute)}`
}

function toIsoFromDateTime(date, hour, minute) {
  const parsed = new Date(`${date}T${pad2(hour)}:${pad2(minute)}:00`)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

async function createLoan() {
  try {
    await loanStore.create({
      direction: createForm.direction,
      counterpartyName: createForm.counterpartyName,
      principalMinor: Math.round(Number(createForm.principalMajor ?? 0) * 100),
      interestMinor: Math.round(Number(createForm.interestMajor ?? 0) * 100),
      startDate: formatLoanDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      dueDate: createForm.dueDate
        ? formatLoanDateTime(createForm.dueDate, createForm.dueHour, createForm.dueMinute)
        : null,
      occurredAt: toIsoFromDateTime(createForm.startDate, createForm.startHour, createForm.startMinute),
      accountId: createForm.accountId,
      note: createForm.note,
    })

    await refreshLinkedData()

    uiStore.pushToast(t('loans.created'))
    closeCreateSheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.create_failed'), 'error')
  }
}

function openRepaySheet(loan) {
  repayLoan.value = loan
  repayOpen.value = true
  repayForm.amountMajor = Number(loan.remaining_minor ?? 0) / 100
  repayForm.accountId = defaultAccountId.value
  repayForm.note = ''
}

function closeRepaySheet() {
  repayOpen.value = false
  repayLoan.value = null
}

function openBatchRepaySheet(loans = []) {
  const targetIds = loans.map((loan) => String(loan?.id ?? '')).filter(Boolean)
  if (targetIds.length < 2) return
  batchRepayLoanIds.value = targetIds
  batchRepayOpen.value = true
  batchRepayForm.amountMajor = batchRepayTotalMinor.value / 100
  batchRepayForm.accountId = defaultAccountId.value
  batchRepayForm.note = ''
}

function closeBatchRepaySheet() {
  batchRepayOpen.value = false
  batchRepayLoanIds.value = []
}

async function submitRepayment() {
  if (!repayLoan.value) return

  try {
    await loanStore.repay({
      loanId: repayLoan.value.id,
      accountId: repayForm.accountId,
      amountMinor: Math.round(Number(repayForm.amountMajor ?? 0) * 100),
      note: repayForm.note,
      paidAt: new Date().toISOString(),
    })

    await refreshLinkedData()
    clearSelection()
    uiStore.pushToast(t('loans.collection_recorded', { action: collectionLabel(repayLoan.value) }))
    closeRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.collection_failed', { action: collectionLabel(repayLoan.value) }), 'error')
  }
}

async function submitBatchRepayment() {
  if (batchRepayCandidates.value.length < 2) return

  try {
    const selectedActiveCount = selectedCollectionCandidates.value.length
    const useCounterpartyBatch = selectedActiveCount === activeCount.value && selectedActiveCount === batchRepayCandidates.value.length
    const result = useCounterpartyBatch
      ? await loanStore.repayBatchByCounterparty({
        direction: tab.value,
        counterpartyName: counterpartyName.value,
        accountId: batchRepayForm.accountId,
        amountMinor: Math.round(Number(batchRepayForm.amountMajor ?? 0) * 100),
        note: batchRepayForm.note,
        paidAt: new Date().toISOString(),
      })
      : await loanStore.repayBatchByLoanIds({
        loanIds: batchRepayCandidates.value.map((loan) => loan.id),
        accountId: batchRepayForm.accountId,
        amountMinor: Math.round(Number(batchRepayForm.amountMajor ?? 0) * 100),
        note: batchRepayForm.note,
        paidAt: new Date().toISOString(),
      })

    await refreshLinkedData()
    clearSelection()

    const summaryParts = [
      t('loans.toast_batch_done', { action: collectionLabelByDirection(tab.value), count: result.affectedLoanCount }),
      t('loans.toast_remaining', { amount: Math.round(Number(result.remainingMinor ?? 0)) / 100 }),
    ]
    uiStore.pushToast(summaryParts.join('，'))
    closeBatchRepaySheet()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.toast_batch_failed', { action: collectionLabelByDirection(tab.value) }), 'error')
  }
}

function actionCollectSelected() {
  closeSelectionActionSheet()
  if (!selectedCollectionCandidates.value.length) {
    uiStore.pushToast(t('loans.toast_select_first', { action: collectionLabelByDirection(tab.value) }), 'error')
    return
  }
  if (selectedCollectionCandidates.value.length === 1) {
    openRepaySheet(selectedCollectionCandidates.value[0])
    return
  }
  openBatchRepaySheet(selectedCollectionCandidates.value)
}

function openConfirmDialog(type) {
  const selectedIds = selectedVisibleLoans.value.map((loan) => String(loan.id))
  if (!selectedIds.length) return
  confirmDialog.open = true
  confirmDialog.loading = false
  confirmDialog.type = type
  confirmDialog.loanIds = selectedIds
  closeSelectionActionSheet()
}

function closeConfirmDialog() {
  if (confirmDialog.loading) return
  confirmDialog.open = false
  confirmDialog.loanIds = []
}

async function confirmDialogAction() {
  if (!confirmDialog.loanIds.length) return
  confirmDialog.loading = true

  const targetIds = [...confirmDialog.loanIds]
  let success = 0
  let failed = 0
  let firstError = ''

  try {
    for (const loanId of targetIds) {
      try {
        if (confirmDialog.type === 'void') {
          await loanStore.markVoid(loanId)
        } else if (confirmDialog.type === 'restore') {
          await loanStore.restoreVoided(loanId)
        } else {
          await loanStore.deleteVoided(loanId)
        }
        success += 1
      } catch (error) {
        failed += 1
        if (!firstError) {
          firstError = String(error?.message ?? error ?? t('common.process_failed'))
        }
      }
    }

    await refreshLinkedData()
    clearSelection()

    if (failed > 0) {
      uiStore.pushToast(`${t('loans.toast_partial', { ok: success, fail: failed })} (${firstError})`, 'error')
    } else if (confirmDialog.type === 'void') {
      uiStore.pushToast(success > 1 ? t('loans.toast_completed_n', { count: success }) : t('loans.completed'))
    } else if (confirmDialog.type === 'restore') {
      uiStore.pushToast(success > 1 ? t('loans.toast_restored_n', { count: success }) : t('loans.restored'))
    } else {
      uiStore.pushToast(success > 1 ? t('loans.toast_deleted_n', { count: success }) : t('loans.deleted'))
    }

    confirmDialog.open = false
  } finally {
    confirmDialog.loading = false
  }
}

async function exportCsv() {
  if (!visibleLoans.value.length) {
    uiStore.pushToast(t('loans.export_empty'), 'error')
    return
  }

  try {
    const result = exportLoanItemsCsv(visibleLoans.value, {
      ledgerName: 'loans',
      scopeName: counterpartyName.value,
      tab: tab.value,
      showFinished: showFinished.value,
    })
    const deviceSave = await saveCsvFileToDevice(result.filename, result.csvText, { category: 'loans' })
    const openTarget = String(deviceSave?.uri ?? '').trim() || String(deviceSave?.openUrl ?? '').trim()

    if (deviceSave?.saved && openTarget) {
      openFileUrl(openTarget)
      uiStore.pushToast(t('loans.export_done', { filename: result.filename, count: result.rowCount }))
      return
    }

    revokeBlobUrl(exportedUrl)
    exportedUrl = createCsvBlobUrl(result.csvText)
    const opened = openFileUrl(exportedUrl)
    if (!opened) {
      triggerDownloadFromUrl(exportedUrl, result.filename)
    }
    uiStore.pushToast(t('loans.export_done', { filename: result.filename, count: result.rowCount }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('loans.export_failed'), 'error')
  }
}

function onRequestCloseOverlay(event) {
  if (selectionActionSheetOpen.value) {
    closeSelectionActionSheet()
    event.preventDefault()
    return
  }
  if (batchRepayOpen.value) {
    closeBatchRepaySheet()
    event.preventDefault()
    return
  }
  if (repayOpen.value) {
    closeRepaySheet()
    event.preventDefault()
    return
  }
  if (createOpen.value) {
    closeCreateSheet()
    event.preventDefault()
  }
}

function openLoanDetail(loanId) {
  void router.push({
    name: 'loan-detail',
    params: { id: loanId },
    query: buildLoanCounterpartyQuery(route.query, {
      name: counterpartyName.value,
      tab: tab.value,
      showFinished: showFinished.value,
    }),
  })
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16)
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
</script>

<style scoped>
.counterparty-page {
  padding-bottom: calc(96px + var(--navigation-bar-height));
}

.panel {
  padding: 14px
}

h2,
h3 {
  margin: 0
}

.summary-row {
  align-items: center
}

.head-actions {
  gap: 8px;
  flex-wrap: wrap;
}

/*
 * SMB-225 Restart / v1.2.51: 兩顆 primary 「新增該對象借出 / 借入」必須放在
 * `header` 之外，否則全域 CSS `header.row:has(.back-btn)` 會在 mobile 把
 * head-actions 子按鈕全部擠進同一個 grid cell (grid-row: 2; grid-column: 1/-1;
 * justify-self: stretch)，視覺上只剩最後一顆可見 (Tester 截圖只看到「匯出
 * CSV」滿寬)。獨立的 .counterparty-create-actions row 避開 iOS-nav grid。
 */
.counterparty-create-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 4px;
  align-items: stretch;
}

.counterparty-create-actions .btn {
  flex: 1 1 200px;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.counterparty-create-icon {
  flex: 0 0 auto;
}

@media (max-width: 480px) {
  .counterparty-create-actions {
    flex-direction: column;
  }

  /*
   * In column mode `flex: 1 1 200px` is on the main axis (vertical) so
   * each button would stretch to fill remaining height (~200px tall) —
   * reset flex to auto so each button keeps its natural button height
   * and only the width stretches via width: 100%.
   */
  .counterparty-create-actions .btn {
    flex: 0 0 auto;
    width: 100%;
  }
}

.batch-preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.batch-preview-item {
  align-items: center;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px
}

.tab-row {
  display: flex;
  gap: 8px
}

.list-header {
  align-items: center;
  margin-bottom: 12px
}

.end-btn {
  min-width: 84px
}

.entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  background: color-mix(in srgb, var(--card) 94%, #111 6%);
}

.entry-select {
  display: inline-flex;
  align-items: center;
  align-self: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.entry-select input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.entry-select-mark {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border) 72%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  color: transparent;
  -webkit-tap-highlight-color: transparent;
}

.entry-select input:checked + .entry-select-mark {
  background: color-mix(in srgb, var(--primary) 82%, white 18%);
  border-color: var(--primary);
  color: var(--primary-contrast, white);
}

.clickable-entry {
  cursor: pointer
}

.entry-body {
  display: flex;
  align-items: center;
  gap: 10px
}

.icon-col {
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0
}

.entry-content {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px
}

.item-main,
.item-meta {
  justify-content: space-between
}

.item-block {
  align-items: center;
  gap: 6px
}

.loan-icon {
  color: var(--primary-soft);
  font-size: 20px
}

.item-main {
  font-size: 15px
}

.item-meta {
  font-size: 14px
}

.item-main .muted,
.item-meta .muted {
  font-size: 13px
}

.item-value {
  max-width: 140px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}

.selection-dock {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(12px + var(--navigation-bar-height));
  z-index: 78;
  border-radius: 18px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: var(--shadow-popover);
}

.selection-dock-copy {
  display: flex;
  align-items: center;
  gap: 10px;
}

.select-all-btn {
  border: 0;
  background: transparent;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.select-all-label-wrap {
  position: relative;
  display: inline-flex;
  overflow: hidden;
  min-width: 4.5em;
}

.select-all-label {
  display: inline-flex;
  align-items: center;
}

.select-all-check {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border) 72%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  color: transparent;
}

.select-all-check.active {
  background: color-mix(in srgb, var(--primary) 82%, white 18%);
  border-color: var(--primary);
  color: var(--primary-contrast, white);
}

.selection-dock-slide-enter-active,
.selection-dock-slide-leave-active {
  transition:
    opacity var(--anim-mid) var(--anim-standard),
    transform var(--anim-mid) var(--anim-spring);
}

.selection-dock-slide-enter-from,
.selection-dock-slide-leave-to {
  opacity: 0;
  transform: translateY(22px) scale(0.98);
}

.select-all-label-enter-active,
.select-all-label-leave-active {
  transition:
    opacity var(--anim-fast) var(--anim-standard),
    transform var(--anim-fast) var(--anim-spring);
}

.select-all-label-enter-from,
.select-all-label-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.action-sheet {
  display: grid;
  gap: 10px;
}

.action-hint {
  display: block;
}

.action-list {
  gap: 8px;
}

.action-btn {
  width: 100%;
}

.action-pair-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: flex-end;
  z-index: 70
}

.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}

.form-wrap {
  margin-top: 10px
}

.field-block {
  display: grid;
  gap: 6px
}

.field-label {
  color: var(--muted);
  font-size: 13px
}

.date-picker-wrap {
  width: min(220px, 100%)
}

.due-date-row {
  gap: 8px;
  align-items: center
}

.due-picker-wrap {
  flex: 0 1 220px;
  min-width: 0;
  max-width: 220px
}

.due-date-row .mini-btn {
  flex: 0 0 auto
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px
}
</style>
