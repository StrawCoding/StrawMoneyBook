<template>
  <HabitatPageShell
    :title="t('claim_sheet.import_reimbursements_title')"
    :kicker="t('claim_sheet.habitat_hello')"
    test-id="claim-sheet-import-view"
  >
    <article class="card panel">

      <div class="row import-toolbar">
        <div class="selection-summary">
          <small class="muted">{{ t('claim_sheet.import.selected_count', { count: selectedTxIds.length }) }}</small>
          <MoneyText :value-minor="selectedTotalMinor" />
        </div>
        <button
          type="button"
          class="btn"
          :disabled="!editableImportedTxs.length"
          @click="toggleSelectAll"
        >
          {{ allImportableSelected ? t('claim_sheet.import.clear_all') : t('claim_sheet.import.select_all') }}
        </button>
      </div>
    </article>

    <article class="card panel">
      <div v-if="loading" class="muted">{{ t('app.loading') }}</div>
      <div v-else-if="editableImportedTxs.length" class="import-list">
        <label v-for="tx in editableImportedTxs" :key="tx.id" class="import-item">
          <input v-model="selectedTxIds" type="checkbox" :value="String(tx.id)" />
          <span class="import-item-text">
            <span class="import-item-title">
              <font-awesome-icon
                v-if="importedTxPresentation(tx).icon"
                :icon="importedTxPresentation(tx).icon"
                class="item-leading-icon"
              />
              <span>{{ importedTxPresentation(tx).title }}</span>
            </span>
            <small v-if="tx.note_plain" class="muted">{{ tx.note_plain }}</small>
            <small v-if="importedTxPresentation(tx).categoryName" class="muted">{{ importedTxPresentation(tx).categoryName }}</small>
            <small class="muted">{{ formatTime(tx.occurred_at) }}</small>
            <small v-if="isSelectedTx(tx)" class="muted">
              {{ t('claim_sheet.import.pending_amount') }}
              <MoneyText :value-minor="maxMinorOfTx(tx)" />
            </small>
          </span>
          <div class="import-amount-col">
            <label v-if="isSelectedTx(tx)" class="import-amount-label">
              {{ t('claim_sheet.form.this_claim_amount') }}
              <input
                v-model.number="importAmountOverrides[String(tx.id)]"
                class="input import-amount-input"
                type="number"
                min="0"
                :max="maxMinorOfTx(tx) / 100"
                step="1"
                @change="clampAmountOverride(tx)"
              />
            </label>
            <MoneyText v-else :value-minor="maxMinorOfTx(tx)" />
          </div>
        </label>
      </div>
      <p v-else class="muted">{{ t('claim_sheet.form.no_importable') }}</p>
    </article>

    <footer class="row action-row">
      <button type="button" class="btn" :disabled="saving" @click="goBack">{{ t('common.cancel') }}</button>
      <button type="button" class="btn primary" :disabled="saving || loading || !canSaveSelection" @click="saveSelection">
        {{ saving ? t('claim_sheet.processing') : t('common.save') }}
      </button>
    </footer>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { getReimbursementDetail, updateReimbursementDraft } from '@/core/services/reimbursement.service'
import { listClaimSheetImportableReimbursements } from '@/core/services/claim-sheet-import.service'
import { buildClaimCategoryLookup, presentImportedClaimTx } from '@/ui/utils/claim-sheet-presentation'
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
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  loadClaimSheetDraftSession,
  saveClaimSheetDraftSession,
} from '@/ui/views/claims/claim-sheet-import-draft-session'

const CURRENT_KIND = 'reimbursement'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const reimbursementStore = useReimbursementStore()

const loading = ref(false)
const saving = ref(false)
const claim = ref(null)
const claimItems = ref([])
const importableTxs = ref([])
const selectedTxIds = ref([])
const importAmountOverrides = ref({})
const draftSession = ref(null)

const claimId = computed(() => String(route.params.id ?? '').trim())
const isNewDraft = computed(() => claimId.value === 'new')
const claimCategoryLookup = computed(() => buildClaimCategoryLookup(categoryStore.categories))
const returnLink = computed(() => {
  if (isNewDraft.value) return { name: 'claim-sheets', query: { create: '1' } }
  return { name: 'claim-sheet-edit', params: { id: claimId.value } }
})

const currentKindClaimItems = computed(() => {
  return claimItems.value.filter((item) => {
    if (!String(item?.transaction_id ?? '').trim()) return false
    return claimSheetImportKindFromClaimItem(item) === CURRENT_KIND
  })
})

const preservedClaimItems = computed(() => {
  return claimItems.value.filter((item) => {
    const transactionId = String(item?.transaction_id ?? '').trim()
    if (!transactionId) return false
    return claimSheetImportKindFromClaimItem(item) !== CURRENT_KIND
  })
})

const selectedImportedDraftItems = computed(() => {
  return currentKindClaimItems.value.map((item) => buildClaimSheetImportedDraftTx(item))
})

const editableImportedTxs = computed(() => {
  const txMap = new Map()
  for (const tx of importableTxs.value) {
    const txId = String(tx?.id ?? '').trim()
    if (txId) txMap.set(txId, tx)
  }
  for (const tx of selectedImportedDraftItems.value) {
    const txId = String(tx?.id ?? '').trim()
    if (txId && !txMap.has(txId)) txMap.set(txId, tx)
  }
  return Array.from(txMap.values())
})

const selectedImportedItems = computed(() => {
  const idSet = new Set(selectedTxIds.value.map((id) => String(id ?? '').trim()).filter(Boolean))
  return editableImportedTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const selectedTotalMinor = computed(() => {
  return selectedImportedItems.value.reduce(
    (sum, tx) => sum + resolveImportedTxAmountMinor(tx, importAmountOverrides.value),
    0,
  )
})

const allImportableSelected = computed(() => {
  const ids = editableImportedTxs.value.map((tx) => String(tx?.id ?? '').trim()).filter(Boolean)
  if (!ids.length) return false
  const selected = new Set(selectedTxIds.value.map((id) => String(id ?? '').trim()).filter(Boolean))
  return ids.every((id) => selected.has(id))
})

const manualClaimItems = computed(() => preservedManualClaimItems())

const selectedImportAmountsValid = computed(() => {
  if (!selectedImportedItems.value.length) return true
  return selectedImportedItems.value.every(
    (tx) => resolveImportedTxAmountMinor(tx, importAmountOverrides.value) > 0,
  )
})

const canSaveSelection = computed(() => {
  if (!selectedImportAmountsValid.value) return false
  if (isNewDraft.value) return true
  return (
    selectedImportedItems.value.length > 0
    || preservedClaimItems.value.length > 0
    || manualClaimItems.value.length > 0
  )
})

onMounted(() => {
  void loadPage()
})

watch(selectedTxIds, (ids) => {
  importAmountOverrides.value = seedImportAmountOverrides(
    editableImportedTxs.value.filter((tx) => ids.includes(String(tx.id))),
    importAmountOverrides.value,
  )
  importAmountOverrides.value = pruneImportAmountOverrides(importAmountOverrides.value, ids)
}, { deep: true })

function isSelectedTx(tx) {
  return selectedTxIds.value.includes(String(tx?.id ?? '').trim())
}

function maxMinorOfTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function clampAmountOverride(tx) {
  importAmountOverrides.value = clampImportAmountOverridesForTxs(importAmountOverrides.value, [tx])
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(resolveIntlLocale(locale.value), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function importedTxPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function goBack() {
  void router.replace(returnLink.value)
}

function toggleSelectAll() {
  if (allImportableSelected.value) {
    selectedTxIds.value = []
    return
  }
  selectedTxIds.value = editableImportedTxs.value
    .map((tx) => String(tx?.id ?? '').trim())
    .filter(Boolean)
}

function preservedReimbursementDraftClaimItems() {
  return preservedClaimItems.value.map((item) => ({
    entryType: String(item?.entry_type ?? '').trim() === 'income' ? 'income' : 'expense',
    sourceType: 'transaction',
    transactionId: String(item?.transaction_id ?? '').trim(),
    categoryId: item.category_id ?? null,
    accountId: item.account_id ?? null,
    description: String(item?.description ?? '').trim() || t('claim_sheet.form.unnamed_item'),
    amountMinor: Math.max(0, Math.round(Number(item?.amount_minor ?? 0))),
    occurredAt: item.occurred_at,
  }))
}

async function loadPage() {
  loading.value = true
  try {
    await Promise.all([categoryStore.load(), reimbursementStore.load()])
    if (!ledgerStore.activeLedgerId) {
      importableTxs.value = []
      if (isNewDraft.value) {
        draftSession.value = loadClaimSheetDraftSession() ?? {
          title: '',
          counterpartyName: '',
          note: '',
          importTxIds: [],
          borrowLoanImportTxIds: [],
          importAmountOverrides: {},
          borrowLoanImportAmountOverrides: {},
          manualItems: [],
        }
        selectedTxIds.value = [...draftSession.value.importTxIds]
        importAmountOverrides.value = { ...draftSession.value.importAmountOverrides }
      }
      return
    }

    importableTxs.value = listClaimSheetImportableReimbursements({
      reimbursementTransactions: reimbursementStore.pendingItems,
    })

    if (isNewDraft.value) {
      draftSession.value = loadClaimSheetDraftSession() ?? {
        title: '',
        counterpartyName: '',
        note: '',
        importTxIds: [],
        borrowLoanImportTxIds: [],
        importAmountOverrides: {},
        borrowLoanImportAmountOverrides: {},
        manualItems: [],
      }
      selectedTxIds.value = [...draftSession.value.importTxIds]
      importAmountOverrides.value = { ...draftSession.value.importAmountOverrides }
      importAmountOverrides.value = clampImportAmountOverridesForTxs(
        importAmountOverrides.value,
        editableImportedTxs.value,
      )
      return
    }

    if (!claimId.value) {
      claim.value = null
      claimItems.value = []
      return
    }
    const detail = await getReimbursementDetail(ledgerStore.activeLedgerId, claimId.value)
    claim.value = detail.claim ?? null
    claimItems.value = Array.isArray(detail.items) ? detail.items : []
    selectedTxIds.value = currentKindClaimItems.value.map((item) => String(item.transaction_id))
    importAmountOverrides.value = buildImportAmountOverrideMapFromClaimItems(
      currentKindClaimItems.value,
      CURRENT_KIND,
    )
    importAmountOverrides.value = clampImportAmountOverridesForTxs(
      importAmountOverrides.value,
      editableImportedTxs.value,
    )
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.load_failed'), 'error')
  } finally {
    loading.value = false
  }
}

function buildImportedClaimItems() {
  return selectedImportedItems.value
    .map((tx) => buildClaimSheetImportedClaimItem(tx, t, {
      amountMinor: resolveImportedTxAmountMinor(tx, importAmountOverrides.value),
    }))
    .filter((item) => item.amountMinor > 0)
}

function preservedManualClaimItems() {
  return claimItems.value
    .filter((item) => !String(item?.transaction_id ?? '').trim())
    .map((item) => ({
      entryType: String(item?.entry_type ?? '').trim() === 'income' ? 'income' : 'expense',
      sourceType: String(item?.source_type ?? '').trim() === 'advance' ? 'advance' : 'manual',
      categoryId: item.category_id ?? null,
      accountId: item.account_id ?? null,
      description: String(item?.description ?? '').trim() || t('claim_sheet.form.unnamed_item'),
      amountMinor: Math.max(0, Math.round(Number(item?.amount_minor ?? 0))),
      occurredAt: item.occurred_at,
    }))
}

async function saveSelection() {
  if (saving.value) return
  saving.value = true
  try {
    if (isNewDraft.value) {
      const session = draftSession.value ?? loadClaimSheetDraftSession() ?? {}
      saveClaimSheetDraftSession({
        ...session,
        importTxIds: selectedTxIds.value,
        borrowLoanImportTxIds: session.borrowLoanImportTxIds ?? [],
        importAmountOverrides: importAmountOverrides.value,
      })
      await router.replace(returnLink.value)
      return
    }

    if (!ledgerStore.activeLedgerId || !claim.value) return
    await updateReimbursementDraft(ledgerStore.activeLedgerId, claim.value.id, {
      title: claim.value.title,
      counterpartyName: claim.value.counterparty_name,
      note: claim.value.note,
      items: [
        ...buildImportedClaimItems(),
        ...preservedReimbursementDraftClaimItems(),
        ...manualClaimItems.value,
      ],
    })
    await reimbursementStore.load()
    uiStore.pushToast(t('claim_sheet.toast.updated'))
    await router.replace(returnLink.value)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('claim_sheet.toast.update_failed'), 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2 {
  margin: 0;
}

.page-head,
.import-toolbar,
.action-row {
  align-items: center;
}

.page-head {
  gap: 12px;
}

.selection-summary {
  display: grid;
  gap: 4px;
}

.import-toolbar {
  margin-top: 12px;
  justify-content: space-between;
  gap: 10px;
}

.import-list {
  display: grid;
  gap: 8px;
}

.import-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(88px, 120px);
  gap: 8px;
  align-items: center;
}

.import-amount-col {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.import-amount-label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
  justify-items: end;
  width: 100%;
}

.import-amount-input {
  width: 100%;
  min-width: 0;
  text-align: right;
}

.import-item-text {
  display: grid;
  gap: 4px;
  min-width: 0;
}

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

.import-item-text small,
.import-item-title span {
  overflow-wrap: anywhere;
}

.action-row {
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 720px) {
  .page-head,
  .import-toolbar,
  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .action-row .btn {
    width: 100%;
  }
}
</style>
