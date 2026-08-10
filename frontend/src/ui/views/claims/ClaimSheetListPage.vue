<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('claim_sheet.title') }}</h2>
      <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row panel-head">
        <h3>{{ t('claim_sheet.title') }}</h3>
        <button class="btn primary" @click="openCreateSheet">{{ t('claim_sheet.create') }}</button>
      </header>

      <div class="summary-grid">
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.count') }}</small>
          <strong>{{ dashboard.claims.length }}</strong>
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.pending') }}</small>
          <MoneyText :value-minor="pendingClaimMinor" />
        </div>
        <div class="summary-item">
          <small class="muted">{{ t('claim_sheet.summary.importable') }}</small>
          <MoneyText :value-minor="reimbursementStore.pendingTotalMinor" />
        </div>
      </div>
    </article>

    <article class="card panel">
      <div class="row claim-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeClaimPage === 'active' }"
          @click="selectClaimTab('active')"
        >
          {{ t('claim_sheet.tab.active') }} ({{ activeClaims.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeClaimPage === 'completed' }"
          @click="selectClaimTab('completed')"
        >
          {{ t('claim_sheet.tab.completed') }} ({{ completedClaims.length }})
        </button>
      </div>

      <ul class="claim-list">
        <li v-for="claim in visibleClaims" :key="claim.id" class="claim-item">
          <div class="row claim-row">
            <button type="button" class="claim-link" @click="openClaimDetail(claim)">
              <div class="row claim-head">
                <div class="claim-info">
                  <strong>{{ claim.title || t('claim_sheet.unnamed') }}</strong>
                  <small class="muted">{{ statusLabel(claim.status) }}</small>
                </div>
                <MoneyText :value-minor="claim.total_minor" />
              </div>
              <div class="claim-meta-group muted">
                <div class="row claim-meta">
                  <span>{{ t('claim_sheet.item_count', { count: claim.item_count }) }}</span>
                  <span v-if="claim.counterparty_name">{{ claim.counterparty_name }}</span>
                </div>
                <div class="row claim-meta claim-date-row">
                  <span>{{ t('transaction_about.detail.updated_at') }}</span>
                  <span>{{ formatTime(claim.updated_at) }}</span>
                </div>
              </div>
            </button>
            <button
              v-if="!isClaimCompleteDisabled(claim)"
              class="btn primary claim-complete-btn"
              @click.stop="openCompleteSheet(claim)"
            >
              {{ t('claim_sheet.complete') }}
            </button>
          </div>
        </li>

        <li v-if="!visibleClaims.length" class="muted">{{ t(visibleClaimEmptyKey) }}</li>
      </ul>
    </article>

    <InputBottomSheet
      :open="isCreateOpen"
      :title="isEditingCreateForm ? t('claim_sheet.edit') : t('claim_sheet.create')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      :close-text="t('common.cancel')"
      @close="closeCreateSheet"
    >
              <label>
                {{ t('claim_sheet.form.title') }}
                <input
                  v-model="createForm.title"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.title_placeholder')"
                />
              </label>
              <label>
                {{ t('claim_sheet.form.counterparty') }}
                <input
                  v-model="createForm.counterpartyName"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.counterparty_placeholder')"
                />
              </label>
              <label>
                {{ t('claim_sheet.form.note') }}
                <input
                  v-model="createForm.note"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.note_placeholder')"
                />
              </label>

              <div class="stack sub-section">
                <div class="row sub-head">
                  <strong>{{ t('claim_sheet.form.manual_items') }}</strong>
                  <button class="btn" @click="addManualItem">{{ t('claim_sheet.form.add_item') }}</button>
                </div>
                <div v-for="item in createForm.manualItems" :key="item.id" class="manual-item">
                  <div class="manual-item-preview">
                    <div class="manual-item-preview-main">
                      <font-awesome-icon
                        v-if="manualItemPresentation(item).icon"
                        :icon="manualItemPresentation(item).icon"
                        class="item-leading-icon"
                      />
                      <strong>{{ manualItemPresentation(item).title }}</strong>
                    </div>
                    <small class="muted">{{ manualItemPresentation(item).categoryName || manualItemPresentation(item).entryLabel }}</small>
                  </div>
                  <CustomSelect
                    v-model="item.entryType"
                    :options="entryTypeOptions"
                    @update:model-value="onManualEntryTypeChange(item, $event)"
                  />
                  <div v-if="item.entryType === 'advance'" class="manual-static-field muted">
                    {{ t('claim_sheet.form.advance_category_hint') }}
                  </div>
                  <CustomSelect
                    v-else
                    v-model="item.categoryId"
                    :groups="categoryGroupsByEntryType(item.entryType)"
                    :placeholder="t('claim_sheet.form.choose_category')"
                  />
                  <input
                    v-model="item.description"
                    class="input"
                    type="text"
                    :placeholder="t('claim_sheet.form.item_description')"
                  />
                  <input
                    v-model.number="item.amountMajor"
                    class="input"
                    type="number"
                    min="0"
                    step="1"
                    :placeholder="t('claim_sheet.form.amount')"
                  />
                  <button class="btn danger" @click="removeManualItem(item.id)">{{ t('common.delete') }}</button>
                </div>
              </div>

              <div class="stack sub-section">
                <div class="row sub-head">
                  <strong>{{ t('claim_sheet.form.import_reimbursements') }}</strong>
                  <small class="muted">{{ t('claim_sheet.form.import_hint') }}</small>
                </div>
                <div class="import-action-card">
                  <div class="import-summary">
                    <small class="muted">{{ t('claim_sheet.import.selected_count', { count: importedItems.length }) }}</small>
                    <MoneyText :value-minor="importedTotalMinor" />
                  </div>
                  <button type="button" class="btn" @click="openImportPageFromCreateSheet">
                    {{ t('claim_sheet.import.open') }}
                  </button>
                </div>
                <div v-if="importedItems.length" class="imported-claim-list">
                  <div v-for="tx in importedItems" :key="tx.id" class="imported-claim-item">
                    <div class="imported-claim-item-preview">
                      <div class="imported-claim-item-main">
                        <font-awesome-icon
                          v-if="importedTxPresentation(tx).icon"
                          :icon="importedTxPresentation(tx).icon"
                          class="item-leading-icon"
                        />
                        <strong>{{ importedTxPresentation(tx).title }}</strong>
                      </div>
                      <small v-if="importedTxPresentation(tx).categoryName" class="muted">
                        {{ importedTxPresentation(tx).categoryName }}
                      </small>
                    </div>
                    <small class="muted">
                      {{ t('claim_sheet.import.pending_amount') }}
                      <MoneyText :value-minor="maxMinorOfReimbursementTx(tx)" />
                    </small>
                    <label>
                      {{ t('claim_sheet.form.this_claim_amount') }}
                      <input
                        v-model.number="createForm.importAmountOverrides[String(tx.id)]"
                        class="input"
                        type="number"
                        min="0"
                        :max="maxMinorOfReimbursementTx(tx) / 100"
                        step="1"
                        @change="clampReimbursementAmountOverride(tx)"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div class="stack sub-section">
                <div class="row sub-head">
                  <strong>{{ t('claim_sheet.form.import_borrow_loans') }}</strong>
                  <small class="muted">{{ t('claim_sheet.form.import_borrow_loan_hint') }}</small>
                </div>
                <div class="import-action-card">
                  <div class="import-summary">
                    <small class="muted">{{ t('claim_sheet.import.selected_count', { count: importedBorrowLoanItems.length }) }}</small>
                    <MoneyText :value-minor="importedBorrowLoanTotalMinor" />
                  </div>
                  <button type="button" class="btn" @click="openBorrowLoanImportPageFromCreateSheet">
                    {{ t('claim_sheet.import.open_borrow_loan') }}
                  </button>
                </div>
                <div v-if="importedBorrowLoanItems.length" class="imported-claim-list">
                  <div v-for="tx in importedBorrowLoanItems" :key="tx.id" class="imported-claim-item">
                    <div class="imported-claim-item-preview">
                      <div class="imported-claim-item-main">
                        <font-awesome-icon
                          v-if="importedBorrowLoanPresentation(tx).icon"
                          :icon="importedBorrowLoanPresentation(tx).icon"
                          class="item-leading-icon"
                        />
                        <strong>{{ importedBorrowLoanPresentation(tx).title }}</strong>
                      </div>
                      <small v-if="importedBorrowLoanPresentation(tx).categoryName" class="muted">
                        {{ importedBorrowLoanPresentation(tx).categoryName }}
                      </small>
                    </div>
                    <small class="muted">
                      {{ t('claim_sheet.import.remaining_amount') }}
                      <MoneyText :value-minor="maxMinorOfBorrowLoanTx(tx)" />
                    </small>
                    <label>
                      {{ t('claim_sheet.form.this_claim_amount') }}
                      <input
                        v-model.number="createForm.borrowLoanImportAmountOverrides[String(tx.id)]"
                        class="input"
                        type="number"
                        min="0"
                        :max="maxMinorOfBorrowLoanTx(tx) / 100"
                        step="1"
                        @change="clampBorrowLoanAmountOverride(tx)"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div class="row total-row">
                <span>{{ t('claim_sheet.form.net_total') }}</span>
                <MoneyText :value-minor="draftTotalMinor" />
              </div>
      <template #footer>
        <button class="btn" @click="closeCreateSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="creating || !canCreateClaim" @click="submitCreateSheet">
          {{ creating ? t('claim_sheet.creating') : (isEditingCreateForm ? t('claim_sheet.save') : t('claim_sheet.create')) }}
        </button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="Boolean(completeTarget)"
      :title="t('claim_sheet.complete')"
      :body-class="'stack form-wrap'"
      :sheet-class="'sheet'"
      :show-footer="true"
      :close-text="t('common.cancel')"
      @close="closeCompleteSheet"
    >
              <div class="row">
                <span>{{ t('claim_sheet.sheet_label') }}</span>
                <strong>{{ completeTarget.title }}</strong>
              </div>
              <div v-if="completeTarget.counterparty_name" class="row">
                <span>{{ t('claim_sheet.form.counterparty') }}</span>
                <strong>{{ completeTarget.counterparty_name }}</strong>
              </div>
              <div class="row">
                <span>{{ t('claim_sheet.net_amount') }}</span>
                <MoneyText :value-minor="completeTarget.total_minor" />
              </div>
              <div class="copy-wrap">
                <p class="copy-title">代收抵扣（可複選）</p>
                <div v-if="usableCompleteAdvances.length" class="copy-ledger-list">
                  <label v-for="advance in usableCompleteAdvances" :key="advance.id" class="copy-ledger-item">
                    <input v-model="completeForm.selectedAdvanceIds" class="copy-ledger-check" type="checkbox" :value="advance.id" />
                    <span class="copy-ledger-mark">✓</span>
                    <span class="copy-ledger-name">
                      <span class="advance-meta-line">
                        <font-awesome-icon
                          v-if="advanceCategoryIcon(advance)"
                          :icon="advanceCategoryIcon(advance)"
                          class="advance-category-icon"
                        />
                        <span>{{ advanceCategoryName(advance) }}</span>
                      </span>
                      <small class="muted copy-ledger-meta">
                        {{ advance.account_name || '未指定帳戶' }}
                      </small>
                      <small class="muted copy-ledger-meta">
                        <MoneyText :value-minor="advance.available_minor" />
                      </small>
                    </span>
                  </label>
                </div>
                <p v-else class="muted">目前沒有可用代收</p>
                <div v-if="selectedCompleteAdvanceCapacityMinor > 0" class="row advance-summary-row">
                  <span>本次代收抵扣</span>
                  <MoneyText :value-minor="selectedCompleteAdvanceCapacityMinor" />
                </div>
                <p class="muted">代收只是可抵金額紀錄，可跨不同帳戶抵消；從 A 收，也可以從 B 出。</p>
                <p v-if="completeAdvanceOffsettableMinor <= 0" class="muted">這張請款單沒有可供代收抵扣的匯入報銷項目。</p>
                <p v-else class="muted">代收會優先抵扣匯入的報銷項目，剩餘金額才建立新的入帳交易。</p>
                <p v-if="completeCashMinor <= 0" class="muted">本次將全額以代收抵扣，不再建立新的入帳交易。</p>
              </div>
              <label v-if="completeRequiresAccount">
                {{ t('claim_sheet.form.account') }}
                <CustomSelect v-model="completeForm.accountId" :groups="accountStore.groupedRegularAccounts" />
              </label>
              <label>
                {{ t('claim_sheet.form.complete_note') }}
                <input
                  v-model="completeForm.note"
                  class="input"
                  type="text"
                  :placeholder="t('claim_sheet.form.complete_note_placeholder')"
                />
              </label>
      <template #footer>
        <button class="btn" @click="closeCompleteSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="completing || !canCompleteClaim" @click="submitCompleteSheet">
          {{ completing ? t('claim_sheet.processing') : t('claim_sheet.confirm_complete') }}
        </button>
      </template>
    </InputBottomSheet>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import {
  buildClaimCategoryLookup,
  presentClaimManualFormItem,
  presentImportedClaimTx,
} from '@/ui/utils/claim-sheet-presentation'
import {
  clearClaimSheetDraftSession,
  loadClaimSheetDraftSession,
  saveClaimSheetDraftSession,
} from '@/ui/views/claims/claim-sheet-import-draft-session'
import {
  createReimbursementDraft,
  getReimbursementDetail,
  loadReimbursementDashboard,
  markReimbursementPaid,
  transitionReimbursementStatus,
  updateReimbursementDraft,
} from '@/core/services/reimbursement.service'
import {
  listClaimSheetImportableBorrowLoans,
  listClaimSheetImportableReimbursements,
} from '@/core/services/claim-sheet-import.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  buildClaimSheetImportedClaimItem,
  claimSheetImportKindFromClaimItem,
  claimSheetImportedMaxAmountMinor,
  resolveImportedTxAmountMinor,
} from '@/ui/utils/claim-sheet-import'
import {
  buildImportAmountOverrideMapFromClaimItems,
  clampImportAmountOverridesForTxs,
  pruneImportAmountOverrides,
  seedImportAmountOverrides,
} from '@/ui/utils/claim-sheet-import-amount-overrides'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const uiStore = useUiStore()
const reimbursementStore = useReimbursementStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()

const dashboard = ref({
  claims: [],
  summary: { pendingCount: 0, pendingTotal: 0 },
})
const createSheetBootstrapReady = ref(false)
const importableTxs = ref([])
const importableBorrowLoanTxs = ref([])
const isCreateOpen = ref(false)
const creating = ref(false)
const completeTarget = ref(null)
const completeItems = ref([])
const completing = ref(false)
const activeClaimPage = ref('active')
const createForm = reactive({
  editingClaimId: '',
  title: '',
  counterpartyName: '',
  note: '',
  importTxIds: [],
  borrowLoanImportTxIds: [],
  importAmountOverrides: {},
  borrowLoanImportAmountOverrides: {},
  manualItems: [],
})
const completeForm = reactive({
  accountId: '',
  note: '',
  selectedAdvanceIds: [],
})

const entryTypeOptions = computed(() => [
  { label: t('claim_sheet.entry_type.expense'), value: 'expense' },
  { label: t('claim_sheet.entry_type.income'), value: 'income' },
  { label: t('claim_sheet.entry_type.advance'), value: 'advance' },
])

const claimCategoryLookup = computed(() => buildClaimCategoryLookup(categoryStore.categories))

const isEditingCreateForm = computed(() => Boolean(String(createForm.editingClaimId ?? '').trim()))

const selectedCompleteAdvanceIdSet = computed(() => {
  return new Set((completeForm.selectedAdvanceIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
})

const usableCompleteAdvances = computed(() => {
  return reimbursementStore.advances.filter((item) => {
    const advanceId = String(item?.id ?? '').trim()
    const availableMinor = Math.max(0, Math.round(Number(item?.available_minor ?? 0)))
    return Boolean(advanceId) && (availableMinor > 0 || selectedCompleteAdvanceIdSet.value.has(advanceId))
  })
})

const completeAdvanceOffsettableMinor = computed(() => {
  const claimTotalMinor = Math.max(0, Math.round(Number(completeTarget.value?.total_minor ?? 0)))
  const linkedExpenseMinor = completeItems.value.reduce((sum, item) => {
    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId || String(item?.entry_type ?? '') === 'income') return sum
    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
    return sum + amountMinor
  }, 0)
  return Math.min(claimTotalMinor, linkedExpenseMinor)
})

const selectedCompleteAdvanceCapacityMinor = computed(() => {
  let remainingMinor = completeAdvanceOffsettableMinor.value
  if (remainingMinor <= 0) return 0

  const advanceMap = new Map(usableCompleteAdvances.value.map((item) => [String(item?.id ?? '').trim(), item]))
  let totalMinor = 0

  for (const rawAdvanceId of completeForm.selectedAdvanceIds ?? []) {
    const advanceId = String(rawAdvanceId ?? '').trim()
    if (!advanceId || remainingMinor <= 0) continue
    const advance = advanceMap.get(advanceId)
    if (!advance) continue
    const availableMinor = Math.max(0, Math.round(Number(advance.available_minor ?? 0)))
    if (availableMinor <= 0) continue
    const appliedMinor = Math.min(availableMinor, remainingMinor)
    totalMinor += appliedMinor
    remainingMinor -= appliedMinor
  }

  return totalMinor
})

const completeCashMinor = computed(() => {
  const claimTotalMinor = Math.max(0, Math.round(Number(completeTarget.value?.total_minor ?? 0)))
  return Math.max(
    0,
    claimTotalMinor
      - selectedCompleteAdvanceCapacityMinor.value
      - completeClaimAdvanceMinor.value
      - completeBorrowLoanMinor.value,
  )
})

const completeClaimAdvanceMinor = computed(() => {
  return completeItems.value.reduce((sum, item) => {
    if (String(item?.source_type ?? '').trim() !== 'advance') return sum
    return sum + Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  }, 0)
})

const completeBorrowLoanMinor = computed(() => {
  return completeItems.value.reduce((sum, item) => {
    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId || String(item?.entry_type ?? '') !== 'income') return sum
    return sum + Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  }, 0)
})

const completeRequiresAccount = computed(() => (
  completeCashMinor.value > 0
  || completeClaimAdvanceMinor.value > 0
  || completeBorrowLoanMinor.value > 0
))

const pendingClaimMinor = computed(() => {
  return dashboard.value.claims
    .filter((item) => item.status !== 'paid' && item.status !== 'rejected')
    .reduce((sum, item) => sum + Math.max(0, Number(item.total_minor ?? 0)), 0)
})

const activeClaims = computed(() => {
  return dashboard.value.claims.filter((item) => String(item?.status ?? '') !== 'paid')
})

const completedClaims = computed(() => {
  return dashboard.value.claims.filter((item) => String(item?.status ?? '') === 'paid')
})

const visibleClaims = computed(() => {
  return activeClaimPage.value === 'completed' ? completedClaims.value : activeClaims.value
})

const visibleClaimEmptyKey = computed(() => {
  return activeClaimPage.value === 'completed' ? 'claim_sheet.empty_completed' : 'claim_sheet.empty'
})

const importedItems = computed(() => {
  const idSet = new Set(createForm.importTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return importableTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const importedBorrowLoanItems = computed(() => {
  const idSet = new Set(createForm.borrowLoanImportTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return importableBorrowLoanTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const draftTotalMinor = computed(() => {
  let totalMinor = 0
  for (const tx of importedItems.value) {
    totalMinor += pendingMinorOfTx(tx)
  }
  for (const tx of importedBorrowLoanItems.value) {
    totalMinor += pendingBorrowLoanMinorOfTx(tx)
  }
  for (const item of createForm.manualItems) {
    const amountMinor = Math.max(0, Math.round(Number(item.amountMajor ?? 0) * 100))
    if (amountMinor <= 0) continue
    totalMinor += amountMinor
  }
  return totalMinor
})

const importedTotalMinor = computed(() => importedItems.value.reduce((sum, tx) => sum + pendingMinorOfTx(tx), 0))

const importedBorrowLoanTotalMinor = computed(() => {
  return importedBorrowLoanItems.value.reduce((sum, tx) => sum + pendingBorrowLoanMinorOfTx(tx), 0)
})

const canCreateClaim = computed(() => {
  const hasTitle = Boolean(String(createForm.title ?? '').trim())
  const hasImported = importedItems.value.length > 0 || importedBorrowLoanItems.value.length > 0
  const manualItemsWithAmount = createForm.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0)
  const hasManual = manualItemsWithAmount.length > 0
  const manualCategoriesReady = manualItemsWithAmount.every((item) => {
    if (item.entryType === 'advance') return true
    return Boolean(String(item.categoryId ?? '').trim())
  })
  const importedAmountsValid = importedItems.value.every(
    (tx) => resolveImportedTxAmountMinor(tx, createForm.importAmountOverrides) > 0,
  ) && importedBorrowLoanItems.value.every(
    (tx) => resolveImportedTxAmountMinor(tx, createForm.borrowLoanImportAmountOverrides) > 0,
  )
  return hasTitle && (hasImported || hasManual) && manualCategoriesReady && importedAmountsValid
})

const canCompleteClaim = computed(() => {
  if (!completeTarget.value) return false
  if (Number(completeTarget.value?.total_minor ?? 0) <= 0) return false
  if (!completeRequiresAccount.value) return true
  return accountStore.accounts.some((item) => item.id === String(completeForm.accountId ?? '').trim())
})

onMounted(async () => {
  syncActiveClaimPageFromRoute()
  createSheetBootstrapReady.value = false
  await Promise.all([reloadDashboard(), reimbursementStore.load(), accountStore.load(), categoryStore.load()])
  await reloadImportableTxs()
  createSheetBootstrapReady.value = true
  if (String(route.query.create ?? '').trim() === '1') {
    restoreCreateFormFromSession()
    isCreateOpen.value = true
    const nextQuery = { ...route.query }
    delete nextQuery.create
    await router.replace({ name: 'claim-sheets', query: nextQuery })
    return
  }
  if (!String(route.query.edit ?? '').trim() && !isEditingCreateForm.value && !isCreateOpen.value) {
    resetCreateForm()
  }
})

watch(() => route.query.tab, () => {
  syncActiveClaimPageFromRoute()
})

watch(
  [() => route.query.edit, () => ledgerStore.activeLedgerId, createSheetBootstrapReady],
  ([nextEditId, nextLedgerId, isBootstrapReady]) => {
    if (!String(nextEditId ?? '').trim() || !String(nextLedgerId ?? '').trim() || !isBootstrapReady) return
    void openEditSheetFromRoute()
  },
  { immediate: true },
)

watch(
  () => createForm.importTxIds,
  (ids) => {
    createForm.importAmountOverrides = seedImportAmountOverrides(
      importedItems.value,
      createForm.importAmountOverrides,
    )
    createForm.importAmountOverrides = pruneImportAmountOverrides(createForm.importAmountOverrides, ids)
  },
  { deep: true },
)

watch(
  () => createForm.borrowLoanImportTxIds,
  (ids) => {
    createForm.borrowLoanImportAmountOverrides = seedImportAmountOverrides(
      importedBorrowLoanItems.value,
      createForm.borrowLoanImportAmountOverrides,
    )
    createForm.borrowLoanImportAmountOverrides = pruneImportAmountOverrides(
      createForm.borrowLoanImportAmountOverrides,
      ids,
    )
  },
  { deep: true },
)

function resetCreateForm() {
  createForm.editingClaimId = ''
  createForm.title = ''
  createForm.counterpartyName = ''
  createForm.note = ''
  createForm.importTxIds = []
  createForm.borrowLoanImportTxIds = []
  createForm.importAmountOverrides = {}
  createForm.borrowLoanImportAmountOverrides = {}
  createForm.manualItems = []
  addManualItem()
}

function createManualItem() {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryType: 'expense',
    categoryId: firstCategoryIdByEntryType('expense'),
    description: '',
    amountMajor: 0,
  }
}

function addManualItem() {
  createForm.manualItems.push(createManualItem())
}

function removeManualItem(itemId) {
  createForm.manualItems = createForm.manualItems.filter((item) => item.id !== itemId)
  if (!createForm.manualItems.length) addManualItem()
}

function categoriesByEntryType(entryType) {
  if (entryType === 'advance') return []
  return entryType === 'income' ? categoryStore.incomeCategories : categoryStore.expenseCategories
}

function categoryGroupsByEntryType(entryType) {
  if (entryType === 'advance') return []
  return entryType === 'income' ? categoryStore.incomeCategoryGroups : categoryStore.expenseCategoryGroups
}

function firstCategoryIdByEntryType(entryType) {
  return String(categoriesByEntryType(entryType)[0]?.id ?? '')
}

function ensureCategoryIdByEntryType(entryType, categoryId) {
  const nextCategoryId = String(categoryId ?? '').trim()
  if (!nextCategoryId) {
    return firstCategoryIdByEntryType(entryType)
  }

  if (categoriesByEntryType(entryType).some((item) => item.id === nextCategoryId)) {
    return nextCategoryId
  }

  return firstCategoryIdByEntryType(entryType)
}

function onManualEntryTypeChange(item, nextType) {
  item.entryType = nextType === 'income'
    ? 'income'
    : nextType === 'advance'
      ? 'advance'
      : 'expense'
  if (item.entryType === 'advance') {
    item.categoryId = ''
    return
  }
  item.categoryId = ensureCategoryIdByEntryType(item.entryType, item.categoryId)
}

async function reloadDashboard() {
  if (!ledgerStore.activeLedgerId) return
  dashboard.value = await loadReimbursementDashboard(ledgerStore.activeLedgerId)
}

async function reloadImportableTxs() {
  if (!ledgerStore.activeLedgerId) {
    importableTxs.value = []
    importableBorrowLoanTxs.value = []
    return
  }
  const [reimbursementImportable, borrowLoanImportable] = await Promise.all([
    Promise.resolve(listClaimSheetImportableReimbursements({
      reimbursementTransactions: reimbursementStore.pendingItems,
    })),
    listClaimSheetImportableBorrowLoans(ledgerStore.activeLedgerId),
  ])
  importableTxs.value = reimbursementImportable
  importableBorrowLoanTxs.value = borrowLoanImportable
}

function pendingMinorOfTx(tx) {
  return resolveImportedTxAmountMinor(tx, createForm.importAmountOverrides)
}

function pendingBorrowLoanMinorOfTx(tx) {
  return resolveImportedTxAmountMinor(tx, createForm.borrowLoanImportAmountOverrides)
}

function maxMinorOfReimbursementTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function maxMinorOfBorrowLoanTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function clampReimbursementAmountOverride(tx) {
  createForm.importAmountOverrides = clampImportAmountOverridesForTxs(
    createForm.importAmountOverrides,
    [tx],
  )
}

function clampBorrowLoanAmountOverride(tx) {
  createForm.borrowLoanImportAmountOverrides = clampImportAmountOverridesForTxs(
    createForm.borrowLoanImportAmountOverrides,
    [tx],
  )
}

function importedTxPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function importedBorrowLoanPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(locale.value || 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status) {
  if (status === 'paid') return t('claim_sheet.status.paid')
  if (status === 'rejected') return t('claim_sheet.status.rejected')
  if (status === 'approved') return t('claim_sheet.status.approved')
  if (status === 'in_review') return t('claim_sheet.status.in_review')
  if (status === 'submitted') return t('claim_sheet.status.submitted')
  return t('claim_sheet.status.draft')
}

function normalizeClaimTab(tab) {
  return String(tab ?? '').trim() === 'completed' ? 'completed' : 'active'
}

function syncActiveClaimPageFromRoute() {
  activeClaimPage.value = normalizeClaimTab(route.query.tab)
}

async function selectClaimTab(tab) {
  const nextTab = normalizeClaimTab(tab)
  activeClaimPage.value = nextTab
  const nextQuery = { ...route.query }
  delete nextQuery.edit
  if (nextTab === 'completed') {
    nextQuery.tab = 'completed'
  } else {
    delete nextQuery.tab
  }
  await router.replace({ name: 'claim-sheets', query: nextQuery })
}

function openCreateSheet() {
  resetCreateForm()
  isCreateOpen.value = true
}

function cloneManualItemsForSession() {
  return createForm.manualItems.map((item) => ({ ...item }))
}

function restoreCreateFormFromSession() {
  const session = loadClaimSheetDraftSession()
  if (!session) {
    resetCreateForm()
    return
  }
  createForm.editingClaimId = ''
  createForm.title = session.title
  createForm.counterpartyName = session.counterpartyName
  createForm.note = session.note
  createForm.importTxIds = session.importTxIds
  createForm.borrowLoanImportTxIds = session.borrowLoanImportTxIds
  createForm.importAmountOverrides = { ...session.importAmountOverrides }
  createForm.borrowLoanImportAmountOverrides = { ...session.borrowLoanImportAmountOverrides }
  createForm.manualItems = session.manualItems.length ? session.manualItems : []
  if (!createForm.manualItems.length) addManualItem()
}

function persistDraftSession() {
  saveClaimSheetDraftSession({
    title: createForm.title,
    counterpartyName: createForm.counterpartyName,
    note: createForm.note,
    importTxIds: createForm.importTxIds,
    borrowLoanImportTxIds: createForm.borrowLoanImportTxIds,
    importAmountOverrides: createForm.importAmountOverrides,
    borrowLoanImportAmountOverrides: createForm.borrowLoanImportAmountOverrides,
    manualItems: cloneManualItemsForSession(),
  })
}

function openImportPageFromCreateSheet() {
  persistDraftSession()
  const id = isEditingCreateForm.value ? createForm.editingClaimId : 'new'
  isCreateOpen.value = false
  void router.push({
    name: 'claim-sheet-import',
    params: { id },
  })
}

function openBorrowLoanImportPageFromCreateSheet() {
  persistDraftSession()
  const id = isEditingCreateForm.value ? createForm.editingClaimId : 'new'
  isCreateOpen.value = false
  void router.push({
    name: 'claim-sheet-import-borrow-loan',
    params: { id },
  })
}

function isClaimEditable(claim) {
  return String(claim?.status ?? 'draft') === 'draft'
}

function claimTabOfStatus(status) {
  return String(status ?? '').trim() === 'paid' ? 'completed' : 'active'
}

function openClaimDetail(claim) {
  if (!claim?.id) return
  const tab = claimTabOfStatus(claim?.status)
  void router.push({
    name: 'claim-sheet-detail',
    params: { id: claim.id },
    query: tab === 'completed' ? { tab } : {},
  })
}

function buildManualClaimItems() {
  return createForm.manualItems
    .map((item) => {
      const normalizedEntryType = item.entryType === 'income'
        ? 'income'
        : item.entryType === 'advance'
          ? 'advance'
          : 'expense'
      const defaultDescription = normalizedEntryType === 'income'
        ? t('claim_sheet.form.default_income_item')
        : normalizedEntryType === 'advance'
          ? t('claim_sheet.form.default_advance_item')
          : t('claim_sheet.form.default_expense_item')
      return {
        entryType: normalizedEntryType === 'advance' ? 'income' : normalizedEntryType,
        sourceType: normalizedEntryType === 'advance' ? 'advance' : 'manual',
        description: String(item.description ?? '').trim() || defaultDescription,
        categoryId: normalizedEntryType === 'advance'
          ? null
          : ensureCategoryIdByEntryType(normalizedEntryType, item.categoryId) || null,
        amountMinor: Math.round(Number(item.amountMajor ?? 0) * 100),
        occurredAt: new Date().toISOString(),
      }
    })
    .filter((item) => item.amountMinor > 0)
}

function buildImportedClaimItems() {
  return importedItems.value.map((tx) => buildClaimSheetImportedClaimItem(tx, t, {
    amountMinor: resolveImportedTxAmountMinor(tx, createForm.importAmountOverrides),
  })).filter((item) => item.amountMinor > 0)
}

function buildImportedBorrowLoanClaimItems() {
  return importedBorrowLoanItems.value.map((tx) => buildClaimSheetImportedClaimItem(tx, t, {
    amountMinor: resolveImportedTxAmountMinor(tx, createForm.borrowLoanImportAmountOverrides),
  })).filter((item) => item.amountMinor > 0)
}

function fillCreateFormFromDetail(detail) {
  resetCreateForm()
  createForm.editingClaimId = String(detail?.claim?.id ?? '')
  createForm.title = String(detail?.claim?.title ?? '')
  createForm.counterpartyName = String(detail?.claim?.counterparty_name ?? '')
  createForm.note = String(detail?.claim?.note ?? '')
  createForm.importTxIds = detail.items
    .filter((item) => {
      if (!String(item?.transaction_id ?? '').trim()) return false
      return claimSheetImportKindFromClaimItem(item) === 'reimbursement'
    })
    .map((item) => String(item.transaction_id))
  createForm.borrowLoanImportTxIds = detail.items
    .filter((item) => {
      if (!String(item?.transaction_id ?? '').trim()) return false
      return claimSheetImportKindFromClaimItem(item) === 'borrow_loan'
    })
    .map((item) => String(item.transaction_id))
  createForm.importAmountOverrides = buildImportAmountOverrideMapFromClaimItems(
    detail.items.filter((item) => claimSheetImportKindFromClaimItem(item) === 'reimbursement'),
    'reimbursement',
  )
  createForm.borrowLoanImportAmountOverrides = buildImportAmountOverrideMapFromClaimItems(
    detail.items.filter((item) => claimSheetImportKindFromClaimItem(item) === 'borrow_loan'),
    'borrow_loan',
  )
  createForm.importAmountOverrides = clampImportAmountOverridesForTxs(
    createForm.importAmountOverrides,
    importedItems.value,
  )
  createForm.borrowLoanImportAmountOverrides = clampImportAmountOverridesForTxs(
    createForm.borrowLoanImportAmountOverrides,
    importedBorrowLoanItems.value,
  )
  createForm.manualItems = detail.items
    .filter((item) => !String(item?.transaction_id ?? '').trim())
    .map((item) => {
      const isAdvanceItem = String(item?.source_type ?? '').trim() === 'advance'
      const entryType = isAdvanceItem
        ? 'advance'
        : String(item?.entry_type ?? '').trim() === 'income'
          ? 'income'
          : 'expense'
      return {
        id: `${item.id}_${Math.random().toString(36).slice(2, 8)}`,
        entryType,
        categoryId: isAdvanceItem ? '' : ensureCategoryIdByEntryType(entryType, item.category_id),
        description: String(item?.description ?? ''),
        amountMajor: Math.max(0, Math.round(Number(item?.amount_minor ?? 0))) / 100,
      }
    })
  if (!createForm.manualItems.length) {
    addManualItem()
  }
}

async function openEditSheetById(claimId) {
  if (!ledgerStore.activeLedgerId || !claimId) return false
  const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claimId)
  if (!isClaimEditable(detail?.claim)) return false
  fillCreateFormFromDetail(detail)
  isCreateOpen.value = true
  return true
}

async function openEditSheetFromRoute() {
  const claimId = String(route.query.edit ?? '').trim()
  if (!claimId || !String(ledgerStore.activeLedgerId ?? '').trim()) return

  let shouldClearEditQuery = false
  try {
    const opened = await openEditSheetById(claimId)
    shouldClearEditQuery = true
    if (!opened) {
      uiStore.pushToast(t('claim_sheet.toast.load_failed'), 'error')
    }
  } catch (error) {
    shouldClearEditQuery = true
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  } finally {
    if (shouldClearEditQuery && String(route.query.edit ?? '').trim()) {
      const nextQuery = { ...route.query }
      delete nextQuery.edit
      await router.replace({ name: 'claim-sheets', query: nextQuery })
    }
  }
}

function closeCreateSheet() {
  if (creating.value) return
  isCreateOpen.value = false
}

async function submitCreateSheet() {
  if (!canCreateClaim.value || creating.value || !ledgerStore.activeLedgerId) return

  creating.value = true
  try {
    const isEditing = isEditingCreateForm.value
    const payload = {
      title: createForm.title,
      counterpartyName: createForm.counterpartyName,
      note: createForm.note,
      items: [
        ...buildImportedClaimItems(),
        ...buildImportedBorrowLoanClaimItems(),
        ...buildManualClaimItems(),
      ],
    }

    if (isEditing) {
      await updateReimbursementDraft(ledgerStore.activeLedgerId, createForm.editingClaimId, payload)
    } else {
      await createReimbursementDraft(ledgerStore.activeLedgerId, payload)
    }

    await reloadDashboard()
    clearClaimSheetDraftSession()
    resetCreateForm()
    isCreateOpen.value = false
    uiStore.pushToast(t(isEditing ? 'claim_sheet.toast.updated' : 'claim_sheet.toast.created'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t(isEditingCreateForm.value ? 'claim_sheet.toast.update_failed' : 'claim_sheet.toast.create_failed'), 'error')
  } finally {
    creating.value = false
  }
}

function isClaimCompleteDisabled(claim) {
  return Number(claim?.total_minor ?? 0) <= 0 || ['paid', 'rejected'].includes(String(claim?.status ?? ''))
}

function openCompleteSheet(claim) {
  if (isClaimCompleteDisabled(claim)) return
  completeTarget.value = claim
  completeItems.value = []
  completeForm.accountId = String(accountStore.accounts[0]?.id ?? '')
  completeForm.note = String(claim?.title ?? '').trim()
    ? t('claim_sheet.default_complete_note_named', { title: claim.title })
    : t('claim_sheet.default_complete_note')
  completeForm.selectedAdvanceIds = []
  void loadCompleteItems(claim.id)
}

function closeCompleteSheet() {
  if (completing.value) return
  completeTarget.value = null
  completeItems.value = []
  completeForm.selectedAdvanceIds = []
}

async function ensureClaimReadyForPayment(claim) {
  const status = String(claim?.status ?? 'draft')
  if (!ledgerStore.activeLedgerId) return claim
  let current = claim

  if (status === 'draft') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'submitted')
  }
  if (String(current?.status ?? '') === 'submitted') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'approved')
  }
  if (String(current?.status ?? '') === 'in_review') {
    current = await transitionReimbursementStatus(ledgerStore.activeLedgerId, current.id, 'approved')
  }

  return current
}

async function submitCompleteSheet() {
  if (!canCompleteClaim.value || completing.value || !ledgerStore.activeLedgerId || !completeTarget.value) return

  completing.value = true
  try {
    const readyClaim = await ensureClaimReadyForPayment(completeTarget.value)
    await markReimbursementPaid(ledgerStore.activeLedgerId, {
      reimbursementId: readyClaim.id,
      accountId: completeRequiresAccount.value ? completeForm.accountId : '',
      note: completeForm.note,
      selectedAdvanceIds: completeForm.selectedAdvanceIds,
    })
    await Promise.all([reloadDashboard(), accountStore.load()])
    await reimbursementStore.load()
    await reloadImportableTxs()
    closeCompleteSheet()
    uiStore.pushToast(t('claim_sheet.toast.completed'))
    await router.replace({ name: 'home' })
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.complete_failed'), 'error')
  } finally {
    completing.value = false
  }
}

function advanceCategoryName(advance) {
  const name = String(advance?.category_name ?? '').trim()
  if (name) return name
  const note = String(advance?.note ?? '').trim()
  return note || '代收'
}

function advanceCategoryIcon(advance) {
  return String(advance?.category_icon ?? '').trim()
}

function manualItemPresentation(item) {
  return presentClaimManualFormItem(item, claimCategoryLookup.value, t)
}

async function loadCompleteItems(claimId) {
  if (!ledgerStore.activeLedgerId || !claimId) return
  try {
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claimId)
    if (String(completeTarget.value?.id ?? '') !== String(claimId)) return
    completeItems.value = detail.items
  } catch (error) {
    closeCompleteSheet()
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.panel-head {
  align-items: flex-start;
  gap: 10px;
}

.summary-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.claim-list,
.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.claim-tabs {
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--card);
  color: var(--text);
}

.tab-btn.active {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border) 52%);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
}

.claim-item,
.manual-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.claim-head,
.claim-meta,
.sub-head,
.total-row {
  align-items: center;
}

.claim-meta-group {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.claim-row {
  align-items: stretch;
  gap: 10px;
  min-width: 0;
}

.claim-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.claim-info strong,
.claim-meta span,
.manual-item-preview small,
.import-item-text small {
  overflow-wrap: anywhere;
}

.claim-link {
  min-width: 0;
  flex: 1;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  gap: 8px;
}

.claim-complete-btn {
  align-self: center;
  white-space: nowrap;
}

.claim-date-row {
  justify-content: flex-start;
  gap: 8px;
}

.claim-head {
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.claim-meta {
  gap: 10px;
  flex-wrap: wrap;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70;
}

.sheet {
  width: min(900px, 100vw);
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height));
}

.form-wrap,
.sub-section {
  margin-top: 12px;
}

.sub-section {
  display: grid;
  gap: 8px;
}

.manual-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
  grid-template-columns: 120px 180px minmax(0, 1fr) 120px auto;
  align-items: center;
}

.manual-item-preview {
  grid-column: 1 / -1;
  display: grid;
  gap: 4px;
  min-width: 0;
}

.manual-item-preview-main,
.import-item-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.item-leading-icon {
  width: 16px;
  color: var(--primary);
  flex: 0 0 auto;
}

.manual-static-field {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px dashed var(--border);
  background: color-mix(in srgb, var(--card) 90%, var(--primary) 10%);
}

.import-action-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.import-summary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.imported-claim-list {
  display: grid;
  gap: 8px;
}

.imported-claim-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.imported-claim-item-preview {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.imported-claim-item-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.detail-note {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.advance-summary-row {
  align-items: center;
}

.copy-wrap {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--card) 92%, var(--primary) 8%);
}

.copy-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.copy-ledger-list {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.copy-ledger-item {
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.copy-ledger-item:has(.copy-ledger-check:checked) {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--border) 54%);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  transform: translateY(-1px);
}

.copy-ledger-check {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.copy-ledger-mark {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 12px;
  color: transparent;
  background: color-mix(in srgb, var(--card) 82%, var(--primary) 18%);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}

.copy-ledger-item:has(.copy-ledger-check:checked) .copy-ledger-mark {
  color: white;
  background: var(--primary);
  border-color: var(--primary);
}

.copy-ledger-name {
  min-width: 0;
  display: grid;
  gap: 4px;
  color: var(--text);
}

.copy-ledger-meta {
  display: block;
}

.advance-meta-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.advance-category-icon {
  width: 16px;
}

@media (max-width: 720px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .claim-row,
  .claim-head {
    flex-direction: column;
    align-items: stretch;
  }

  .claim-complete-btn {
    width: 100%;
  }

  .import-action-card {
    align-items: stretch;
    flex-direction: column;
  }

  .manual-item {
    grid-template-columns: 1fr;
  }
}
</style>
