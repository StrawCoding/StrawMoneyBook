<template>
  <HabitatPageShell
    :title="t('claim_sheet.edit_title')"
    :kicker="t('claim_sheet.habitat_hello')"
    test-id="claim-sheet-edit-view"
    back-to="/claim-sheets"
  >

    <article class="card panel">
      <div v-if="loading" class="muted">{{ t('app.loading') }}</div>
      <template v-else-if="claim && isEditableClaim">
        <ClaimSheetDraftForm
          v-model:active-section="editDraftSection"
          :form="form"
          :draft-total-minor="draftTotalMinor"
          :draft-item-count="draftItemCount"
          :imported-items="importedItems"
          :imported-borrow-loan-items="importedBorrowLoanItems"
          :imported-total-minor="importedTotalMinor"
          :imported-borrow-loan-total-minor="importedBorrowLoanTotalMinor"
          @add-manual="openNewManualItemEditor"
          @edit-manual="openManualItemEditor"
          @open-import-reimburse="openImportPage"
          @open-import-borrow="openBorrowLoanImportPage"
          @clamp-reimburse="clampReimbursementAmountOverride"
          @clamp-borrow="clampBorrowLoanAmountOverride"
        />

        <footer class="row action-row">
          <div class="stack edit-save-footer">
            <p v-if="!canSaveClaim && saveSubmitHint" class="muted">{{ saveSubmitHint }}</p>
            <div class="row">
              <button type="button" class="btn" :disabled="saving" @click="goBack">{{ t('common.cancel') }}</button>
              <button type="button" class="btn primary" :disabled="saving || !canSaveClaim" @click="submit">
                {{ saving ? t('claim_sheet.processing') : t('common.save') }}
              </button>
            </div>
          </div>
        </footer>
      </template>
      <p v-else-if="claim" class="muted">只有草稿請款單可編輯</p>
      <p v-else class="muted">{{ t('claim_sheet.not_found') }}</p>
    </article>

    <ClaimSheetManualItemSheet
      ref="manualItemSheetRef"
      :open="Boolean(editingManualItem)"
      :item="editingManualItem"
      :entry-type-options="entryTypeOptions"
      :allow-delete="form.manualItems.length > 0"
      @close="closeManualItemEditor"
      @save="saveManualItemFromSheet"
      @remove="removeEditingManualItem"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ClaimSheetDraftForm from '@/ui/components/claims/ClaimSheetDraftForm.vue'
import ClaimSheetManualItemSheet from '@/ui/components/claims/ClaimSheetManualItemSheet.vue'
import { getReimbursementDetail, updateReimbursementDraft } from '@/core/services/reimbursement.service'
import { listClaimSheetImportableBorrowLoans } from '@/core/services/claim-sheet-import.service'
import {
  buildClaimCategoryLookup,
  presentClaimManualFormItem,
  presentImportedClaimTx,
} from '@/ui/utils/claim-sheet-presentation'
import {
  buildClaimSheetImportedClaimItem,
  buildClaimSheetImportedDraftTx,
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
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { useI18n } from '@/ui/services/i18n.service'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const reimbursementStore = useReimbursementStore()

const loading = ref(false)
const saving = ref(false)
const editDraftSection = ref('manual')
const editingManualItemId = ref('')
const manualItemSheetRef = ref(null)
const claim = ref(null)
const claimItems = ref([])
const importableBorrowLoanTxs = ref([])
const form = reactive({
  title: '',
  counterpartyName: '',
  note: '',
  importTxIds: [],
  borrowLoanImportTxIds: [],
  importAmountOverrides: {},
  borrowLoanImportAmountOverrides: {},
  manualItems: [],
})

const claimId = computed(() => String(route.params.id ?? '').trim())
const backTab = computed(() => (String(route.query.tab ?? '').trim() === 'completed' ? 'completed' : 'active'))
const backLink = computed(() => ({
  name: 'claim-sheet-detail',
  params: { id: claimId.value },
  query: backTab.value === 'completed' ? { tab: 'completed' } : {},
}))
const isEditableClaim = computed(() => String(claim.value?.status ?? 'draft') === 'draft')

const entryTypeOptions = computed(() => [
  { label: t('claim_sheet.entry_type.expense'), value: 'expense' },
  { label: t('claim_sheet.entry_type.income'), value: 'income' },
  { label: t('claim_sheet.entry_type.advance'), value: 'advance' },
])

const claimCategoryLookup = computed(() => buildClaimCategoryLookup(categoryStore.categories))

const reimbursementClaimItems = computed(() => {
  return claimItems.value.filter((item) => {
    if (!String(item?.transaction_id ?? '').trim()) return false
    return claimSheetImportKindFromClaimItem(item) === 'reimbursement'
  })
})

const borrowLoanClaimItems = computed(() => {
  return claimItems.value.filter((item) => {
    if (!String(item?.transaction_id ?? '').trim()) return false
    return claimSheetImportKindFromClaimItem(item) === 'borrow_loan'
  })
})

const selectedImportedDraftItems = computed(() => {
  return reimbursementClaimItems.value.map((item) => buildClaimSheetImportedDraftTx(item))
})

const selectedBorrowLoanDraftItems = computed(() => {
  return borrowLoanClaimItems.value.map((item) => buildClaimSheetImportedDraftTx(item))
})

const editableImportedTxs = computed(() => {
  const txMap = new Map()

  for (const tx of reimbursementStore.pendingItems) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId) continue
    txMap.set(txId, tx)
  }

  for (const tx of selectedImportedDraftItems.value) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId || txMap.has(txId)) continue
    txMap.set(txId, tx)
  }

  return Array.from(txMap.values())
})

const editableBorrowLoanTxs = computed(() => {
  const txMap = new Map()

  for (const tx of importableBorrowLoanTxs.value) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId) continue
    txMap.set(txId, tx)
  }

  for (const tx of selectedBorrowLoanDraftItems.value) {
    const txId = String(tx?.id ?? '').trim()
    if (!txId || txMap.has(txId)) continue
    txMap.set(txId, tx)
  }

  return Array.from(txMap.values())
})

const importedItems = computed(() => {
  const idSet = new Set(form.importTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return editableImportedTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const importedBorrowLoanItems = computed(() => {
  const idSet = new Set(form.borrowLoanImportTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return editableBorrowLoanTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const draftTotalMinor = computed(() => {
  let totalMinor = 0
  for (const tx of importedItems.value) {
    totalMinor += pendingMinorOfTx(tx)
  }
  for (const tx of importedBorrowLoanItems.value) {
    totalMinor += pendingBorrowLoanMinorOfTx(tx)
  }
  for (const item of form.manualItems) {
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

const importedAmountsValid = computed(() => {
  const reimbursementValid = importedItems.value.every(
    (tx) => resolveImportedTxAmountMinor(tx, form.importAmountOverrides) > 0,
  )
  const borrowLoanValid = importedBorrowLoanItems.value.every(
    (tx) => resolveImportedTxAmountMinor(tx, form.borrowLoanImportAmountOverrides) > 0,
  )
  return reimbursementValid && borrowLoanValid
})

const draftItemCount = computed(() => {
  const manualCount = form.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0).length
  return manualCount + importedItems.value.length + importedBorrowLoanItems.value.length
})

const editingManualItem = computed(() => {
  const id = String(editingManualItemId.value ?? '').trim()
  if (!id) return null
  return form.manualItems.find((item) => item.id === id) ?? null
})

const canSaveClaim = computed(() => {
  const hasTitle = Boolean(String(form.title ?? '').trim())
  const hasImported = importedItems.value.length > 0 || importedBorrowLoanItems.value.length > 0
  const manualItemsWithAmount = form.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0)
  const hasManual = manualItemsWithAmount.length > 0
  const manualCategoriesReady = manualItemsWithAmount.every((item) => {
    if (item.entryType === 'advance') return true
    return Boolean(String(item.categoryId ?? '').trim())
  })
  return hasTitle && (hasImported || hasManual) && manualCategoriesReady && importedAmountsValid.value
})

const saveSubmitHint = computed(() => {
  if (canSaveClaim.value) return ''
  if (!String(form.title ?? '').trim()) return t('claim_sheet.form.hint_need_title')
  const manualItemsWithAmount = form.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0)
  const hasImported = importedItems.value.length > 0 || importedBorrowLoanItems.value.length > 0
  const hasManual = manualItemsWithAmount.length > 0
  if (!hasImported && !hasManual) return t('claim_sheet.form.hint_need_item')
  const manualCategoriesReady = manualItemsWithAmount.every((item) => {
    if (item.entryType === 'advance') return true
    return Boolean(String(item.categoryId ?? '').trim())
  })
  if (!manualCategoriesReady) return t('claim_sheet.form.hint_need_category')
  return t('claim_sheet.form.hint_check_amounts')
})

watch(
  [claimId, () => ledgerStore.activeLedgerId],
  () => {
    void loadPage()
  },
  { immediate: true },
)

watch(
  () => form.importTxIds,
  (ids) => {
    form.importAmountOverrides = seedImportAmountOverrides(
      importedItems.value,
      form.importAmountOverrides,
    )
    form.importAmountOverrides = pruneImportAmountOverrides(form.importAmountOverrides, ids)
  },
  { deep: true },
)

watch(
  () => form.borrowLoanImportTxIds,
  (ids) => {
    form.borrowLoanImportAmountOverrides = seedImportAmountOverrides(
      importedBorrowLoanItems.value,
      form.borrowLoanImportAmountOverrides,
    )
    form.borrowLoanImportAmountOverrides = pruneImportAmountOverrides(
      form.borrowLoanImportAmountOverrides,
      ids,
    )
  },
  { deep: true },
)

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

function openImportPage() {
  if (!claimId.value) return
  void router.push({
    name: 'claim-sheet-import',
    params: { id: claimId.value },
  })
}

function openBorrowLoanImportPage() {
  if (!claimId.value) return
  void router.push({
    name: 'claim-sheet-import-borrow-loan',
    params: { id: claimId.value },
  })
}

function resetForm() {
  form.title = ''
  form.counterpartyName = ''
  form.note = ''
  form.importTxIds = []
  form.borrowLoanImportTxIds = []
  form.importAmountOverrides = {}
  form.borrowLoanImportAmountOverrides = {}
  form.manualItems = []
  editDraftSection.value = 'manual'
  editingManualItemId.value = ''
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
  form.manualItems.push(createManualItem())
}

function removeManualItem(itemId) {
  form.manualItems = form.manualItems.filter((item) => item.id !== itemId)
}

function openNewManualItemEditor() {
  const item = createManualItem()
  form.manualItems.push(item)
  editingManualItemId.value = item.id
}

function openManualItemEditor(itemId) {
  editingManualItemId.value = String(itemId ?? '').trim()
}

function closeManualItemEditor() {
  editingManualItemId.value = ''
}

function saveManualItemFromSheet() {
  const sheet = manualItemSheetRef.value
  const target = editingManualItem.value
  if (!sheet?.draft || !target) return
  target.entryType = sheet.draft.entryType
  target.categoryId = sheet.draft.categoryId
  target.description = sheet.draft.description
  target.amountMajor = Number(sheet.draft.amountMajor ?? 0)
  closeManualItemEditor()
}

function removeEditingManualItem() {
  const id = String(editingManualItemId.value ?? '').trim()
  if (id) removeManualItem(id)
  closeManualItemEditor()
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

function maxMinorOfReimbursementTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function maxMinorOfBorrowLoanTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function clampReimbursementAmountOverride(tx) {
  form.importAmountOverrides = clampImportAmountOverridesForTxs(form.importAmountOverrides, [tx])
}

function clampBorrowLoanAmountOverride(tx) {
  form.borrowLoanImportAmountOverrides = clampImportAmountOverridesForTxs(
    form.borrowLoanImportAmountOverrides,
    [tx],
  )
}

function importedTxPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function importedBorrowLoanPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function pendingMinorOfTx(tx) {
  return resolveImportedTxAmountMinor(tx, form.importAmountOverrides)
}

function pendingBorrowLoanMinorOfTx(tx) {
  return resolveImportedTxAmountMinor(tx, form.borrowLoanImportAmountOverrides)
}

function buildManualClaimItems() {
  return form.manualItems
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
    amountMinor: resolveImportedTxAmountMinor(tx, form.importAmountOverrides),
  })).filter((item) => item.amountMinor > 0)
}

function buildImportedBorrowLoanClaimItems() {
  return importedBorrowLoanItems.value.map((tx) => buildClaimSheetImportedClaimItem(tx, t, {
    amountMinor: resolveImportedTxAmountMinor(tx, form.borrowLoanImportAmountOverrides),
  })).filter((item) => item.amountMinor > 0)
}

function fillFormFromDetail(detail) {
  resetForm()
  form.title = String(detail?.claim?.title ?? '')
  form.counterpartyName = String(detail?.claim?.counterparty_name ?? '')
  form.note = String(detail?.claim?.note ?? '')
  form.importTxIds = detail.items
    .filter((item) => {
      if (!String(item?.transaction_id ?? '').trim()) return false
      return claimSheetImportKindFromClaimItem(item) === 'reimbursement'
    })
    .map((item) => String(item.transaction_id))
  form.borrowLoanImportTxIds = detail.items
    .filter((item) => {
      if (!String(item?.transaction_id ?? '').trim()) return false
      return claimSheetImportKindFromClaimItem(item) === 'borrow_loan'
    })
    .map((item) => String(item.transaction_id))
  form.importAmountOverrides = buildImportAmountOverrideMapFromClaimItems(
    detail.items.filter((item) => claimSheetImportKindFromClaimItem(item) === 'reimbursement'),
    'reimbursement',
  )
  form.borrowLoanImportAmountOverrides = buildImportAmountOverrideMapFromClaimItems(
    detail.items.filter((item) => claimSheetImportKindFromClaimItem(item) === 'borrow_loan'),
    'borrow_loan',
  )
  form.importAmountOverrides = clampImportAmountOverridesForTxs(
    form.importAmountOverrides,
    importedItems.value,
  )
  form.borrowLoanImportAmountOverrides = clampImportAmountOverridesForTxs(
    form.borrowLoanImportAmountOverrides,
    importedBorrowLoanItems.value,
  )
  form.manualItems = detail.items
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
}

async function loadPage() {
  if (!ledgerStore.activeLedgerId || !claimId.value) {
    claim.value = null
    claimItems.value = []
    importableBorrowLoanTxs.value = []
    return
  }

  loading.value = true
  try {
    const [detail, , , borrowLoanImportable] = await Promise.all([
      getReimbursementDetail(ledgerStore.activeLedgerId, claimId.value),
      categoryStore.load(),
      reimbursementStore.load(),
      listClaimSheetImportableBorrowLoans(ledgerStore.activeLedgerId),
    ])
    if (claimId.value !== String(route.params.id ?? '').trim()) return
    claim.value = detail.claim ?? null
    claimItems.value = Array.isArray(detail.items) ? detail.items : []
    importableBorrowLoanTxs.value = Array.isArray(borrowLoanImportable) ? borrowLoanImportable : []
    fillFormFromDetail(detail)
  } catch (error) {
    claim.value = null
    claimItems.value = []
    importableBorrowLoanTxs.value = []
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!ledgerStore.activeLedgerId || !claimId.value || saving.value || !canSaveClaim.value) return

  saving.value = true
  try {
    await updateReimbursementDraft(ledgerStore.activeLedgerId, claimId.value, {
      title: form.title,
      counterpartyName: form.counterpartyName,
      note: form.note,
      items: [
        ...buildImportedClaimItems(),
        ...buildImportedBorrowLoanClaimItems(),
        ...buildManualClaimItems(),
      ],
    })
    await reimbursementStore.load()
    uiStore.pushToast(t('claim_sheet.toast.updated'))
    await router.replace(backLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.update_failed'), 'error')
  } finally {
    saving.value = false
  }
}

function manualItemPresentation(item) {
  return presentClaimManualFormItem(item, claimCategoryLookup.value, t)
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2 {
  margin: 0;
}

.form-wrap,
.sub-section {
  display: grid;
  gap: 10px;
}

.manual-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.sub-head,
.total-row,
.action-row {
  align-items: center;
}

.manual-item-preview {
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  gap: 10px;
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

.manual-item-preview small,
.manual-item-preview strong,
.import-item-text small,
.import-item-title span {
  overflow-wrap: anywhere;
}

.action-row {
  margin-top: 16px;
  justify-content: flex-end;
  gap: 8px;
}

label {
  display: grid;
  gap: 6px;
}

@media (max-width: 720px) {
  .import-action-card {
    align-items: stretch;
    flex-direction: column;
  }

  .action-row {
    justify-content: stretch;
    flex-wrap: wrap;
  }

  .action-row .btn {
    width: 100%;
  }
}
</style>
