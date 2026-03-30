<template>
  <section class="stack claim-edit-page">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('claim_sheet.edit') }}</h2>
        <button type="button" class="btn back-btn" @click="goBack">{{ t('common.back') }}</button>
      </header>

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
            <div v-if="editableImportedTxs.length" class="import-list">
              <label v-for="tx in editableImportedTxs" :key="tx.id" class="import-item">
                <input v-model="form.importTxIds" type="checkbox" :value="tx.id" />
                <span class="import-item-text">
                  <span>{{ buildImportedItemDescription(tx) }}</span>
                  <small v-if="tx.note_plain" class="muted">{{ tx.note_plain }}</small>
                  <small class="muted">{{ formatTime(tx.occurred_at) }}</small>
                </span>
                <MoneyText :value-minor="pendingMinorOfTx(tx)" />
              </label>
            </div>
            <p v-else class="muted">{{ t('claim_sheet.form.no_importable') }}</p>
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
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { getReimbursementDetail, updateReimbursementDraft } from '@/core/services/reimbursement.service'
import { reimbursementPendingMinor } from '@/ui/utils/reimbursement-item'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { useI18n } from '@/ui/services/i18n.service'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useUiStore } from '@/ui/stores/ui.store'

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
const form = reactive({
  title: '',
  counterpartyName: '',
  note: '',
  importTxIds: [],
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

const selectedImportedDraftItems = computed(() => {
  return claimItems.value
    .filter((item) => String(item?.transaction_id ?? '').trim())
    .map((item) => ({
      id: String(item.transaction_id),
      transaction_id: String(item.transaction_id),
      category_id: item.category_id ?? null,
      account_id: item.account_id ?? null,
      category_name: '',
      note_plain: String(item.transaction_note ?? '').trim(),
      note: String(item.transaction_note ?? item.description ?? '').trim(),
      occurred_at: item.occurred_at,
      amount_minor: Math.max(0, Math.round(Number(item.amount_minor ?? 0))),
      reimbursed_minor: 0,
    }))
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

const importedItems = computed(() => {
  const idSet = new Set(form.importTxIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  return editableImportedTxs.value.filter((tx) => idSet.has(String(tx.id)))
})

const draftTotalMinor = computed(() => {
  let totalMinor = 0
  for (const tx of importedItems.value) {
    totalMinor += pendingMinorOfTx(tx)
  }
  for (const item of form.manualItems) {
    const amountMinor = Math.max(0, Math.round(Number(item.amountMajor ?? 0) * 100))
    if (amountMinor <= 0) continue
    totalMinor += amountMinor
  }
  return totalMinor
})

const canSaveClaim = computed(() => {
  const hasTitle = Boolean(String(form.title ?? '').trim())
  const hasImported = importedItems.value.length > 0
  const manualItemsWithAmount = form.manualItems.filter((item) => Number(item.amountMajor ?? 0) > 0)
  const hasManual = manualItemsWithAmount.length > 0
  const manualCategoriesReady = manualItemsWithAmount.every((item) => {
    if (item.entryType === 'advance') return true
    return Boolean(String(item.categoryId ?? '').trim())
  })
  return hasTitle && (hasImported || hasManual) && manualCategoriesReady
})

watch(
  [claimId, () => ledgerStore.activeLedgerId],
  () => {
    void loadPage()
  },
  { immediate: true },
)

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

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

function resetForm() {
  form.title = ''
  form.counterpartyName = ''
  form.note = ''
  form.importTxIds = []
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

function buildImportedItemDescription(tx) {
  return tx.category_name || tx.note_plain || t('claim_sheet.form.imported_reimbursement_item', { id: tx.id })
}

function pendingMinorOfTx(tx) {
  return reimbursementPendingMinor(tx)
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
  return importedItems.value.map((tx) => ({
    entryType: 'expense',
    sourceType: 'transaction',
    transactionId: tx.id,
    categoryId: tx.category_id ?? null,
    accountId: tx.account_id ?? null,
    description: buildImportedItemDescription(tx),
    amountMinor: pendingMinorOfTx(tx),
    occurredAt: tx.occurred_at,
  }))
}

function fillFormFromDetail(detail) {
  resetForm()
  form.title = String(detail?.claim?.title ?? '')
  form.counterpartyName = String(detail?.claim?.counterparty_name ?? '')
  form.note = String(detail?.claim?.note ?? '')
  form.importTxIds = detail.items
    .filter((item) => String(item?.transaction_id ?? '').trim())
    .map((item) => String(item.transaction_id))
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
    return
  }

  loading.value = true
  try {
    const [detail] = await Promise.all([
      getReimbursementDetail(ledgerStore.activeLedgerId, claimId.value),
      categoryStore.load(),
      reimbursementStore.load(),
    ])
    if (claimId.value !== String(route.params.id ?? '').trim()) return
    claim.value = detail.claim ?? null
    claimItems.value = Array.isArray(detail.items) ? detail.items : []
    fillFormFromDetail(detail)
  } catch (error) {
    claim.value = null
    claimItems.value = []
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
      items: [...buildImportedClaimItems(), ...buildManualClaimItems()],
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
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2 {
  margin: 0;
}

.form-wrap,
.sub-section,
.import-list {
  display: grid;
  gap: 10px;
}

.manual-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.sub-head,
.total-row,
.action-row {
  align-items: center;
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

.import-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
}

.import-item-text {
  display: grid;
  gap: 4px;
  min-width: 0;
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
</style>
