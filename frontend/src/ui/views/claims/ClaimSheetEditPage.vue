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
        <div class="stack form-wrap">
          <label>
            {{ t('claim_sheet.form.title') }}
            <input
              v-model="form.title"
              class="input"
              type="text"
              :placeholder="t('claim_sheet.form.title_placeholder')"
            />
          </label>
          <label>
            {{ t('claim_sheet.form.counterparty') }}
            <input
              v-model="form.counterpartyName"
              class="input"
              type="text"
              :placeholder="t('claim_sheet.form.counterparty_placeholder')"
            />
          </label>
          <label>
            {{ t('claim_sheet.form.note') }}
            <input
              v-model="form.note"
              class="input"
              type="text"
              :placeholder="t('claim_sheet.form.note_placeholder')"
            />
          </label>

          <div class="stack sub-section">
            <div class="row sub-head">
              <strong>{{ t('claim_sheet.form.manual_items') }}</strong>
              <button type="button" class="btn" @click="addManualItem">{{ t('claim_sheet.form.add_item') }}</button>
            </div>
            <div v-for="item in form.manualItems" :key="item.id" class="manual-item">
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
              <button type="button" class="btn danger" @click="removeManualItem(item.id)">
                {{ t('common.delete') }}
              </button>
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
              <button type="button" class="btn" @click="openImportPage">
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
                    v-model.number="form.importAmountOverrides[String(tx.id)]"
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
              <button type="button" class="btn" @click="openBorrowLoanImportPage">
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
                    v-model.number="form.borrowLoanImportAmountOverrides[String(tx.id)]"
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
        </div>

        <footer class="row action-row">
          <button type="button" class="btn" :disabled="saving" @click="goBack">{{ t('common.cancel') }}</button>
          <button type="button" class="btn primary" :disabled="saving || !canSaveClaim" @click="submit">
            {{ saving ? t('claim_sheet.processing') : t('common.save') }}
          </button>
        </footer>
      </template>
      <p v-else-if="claim" class="muted">只有草稿請款單可編輯</p>
      <p v-else class="muted">{{ t('claim_sheet.not_found') }}</p>
    </article>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
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
  form.manualItems.push(createManualItem())
}

function removeManualItem(itemId) {
  form.manualItems = form.manualItems.filter((item) => item.id !== itemId)
  if (!form.manualItems.length) addManualItem()
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
  if (!form.manualItems.length) {
    addManualItem()
  }
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
