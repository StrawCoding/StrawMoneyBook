<template>
  <div class="claim-sheet-draft-form stack">
    <label>
      {{ t('claim_sheet.form.title') }}
      <input
        v-model="form.title"
        class="input"
        data-testid="claim-create-title"
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

    <div class="claim-draft-summary" data-testid="claim-draft-summary">
      <span class="muted">{{ t('claim_sheet.form.items_summary', { count: draftItemCount }) }}</span>
      <MoneyText :value-minor="draftTotalMinor" />
    </div>

    <div class="segment-pills claim-draft-tabs" role="tablist">
      <button
        type="button"
        class="btn tab-btn"
        :class="{ primary: activeSection === 'manual' }"
        role="tab"
        :aria-selected="activeSection === 'manual' ? 'true' : 'false'"
        data-testid="claim-draft-tab-manual"
        @click="$emit('update:activeSection', 'manual')"
      >
        {{ t('claim_sheet.form.tab_manual') }}
      </button>
      <button
        type="button"
        class="btn tab-btn"
        :class="{ primary: activeSection === 'reimburse' }"
        role="tab"
        :aria-selected="activeSection === 'reimburse' ? 'true' : 'false'"
        data-testid="claim-draft-tab-reimburse"
        @click="$emit('update:activeSection', 'reimburse')"
      >
        {{ t('claim_sheet.form.tab_import_reimburse') }}
      </button>
      <button
        type="button"
        class="btn tab-btn"
        :class="{ primary: activeSection === 'borrow' }"
        role="tab"
        :aria-selected="activeSection === 'borrow' ? 'true' : 'false'"
        data-testid="claim-draft-tab-borrow"
        @click="$emit('update:activeSection', 'borrow')"
      >
        {{ t('claim_sheet.form.tab_import_borrow') }}
      </button>
    </div>

    <section v-show="activeSection === 'manual'" class="claim-draft-section">
      <ul v-if="visibleManualItems.length" class="claim-draft-item-list">
        <li v-for="item in visibleManualItems" :key="item.id">
          <button
            type="button"
            class="claim-draft-item-row"
            data-testid="claim-manual-row"
            @click="$emit('edit-manual', item.id)"
          >
            <span class="claim-draft-item-main">
              <font-awesome-icon
                v-if="manualItemPresentation(item).icon"
                :icon="manualItemPresentation(item).icon"
                class="item-leading-icon"
              />
              <span class="claim-draft-item-text">
                <strong>{{ manualItemPresentation(item).title }}</strong>
                <small class="muted">{{ manualItemPresentation(item).categoryName || manualItemPresentation(item).entryLabel }}</small>
              </span>
            </span>
            <MoneyText
              v-if="Number(item.amountMajor ?? 0) > 0"
              :value-minor="Math.round(Number(item.amountMajor) * 100)"
            />
            <span v-else class="muted">{{ t('claim_sheet.form.tap_to_edit') }}</span>
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="btn claim-draft-add-btn"
        data-testid="claim-draft-add-manual"
        @click="$emit('add-manual')"
      >
        {{ t('claim_sheet.form.add_item') }}
      </button>
    </section>

    <section v-show="activeSection === 'reimburse'" class="claim-draft-section">
      <div class="import-action-card">
        <div class="import-summary">
          <small class="muted">{{ t('claim_sheet.import.selected_count', { count: importedItems.length }) }}</small>
          <MoneyText :value-minor="importedTotalMinor" />
        </div>
        <button type="button" class="btn" @click="$emit('open-import-reimburse')">
          {{ t('claim_sheet.import.open') }}
        </button>
      </div>
      <ul v-if="importedItems.length" class="claim-draft-item-list">
        <li v-for="tx in importedItems" :key="tx.id">
          <button
            type="button"
            class="claim-draft-item-row"
            @click="toggleImportExpand(String(tx.id))"
          >
            <span class="claim-draft-item-main">
              <font-awesome-icon
                v-if="importedTxPresentation(tx).icon"
                :icon="importedTxPresentation(tx).icon"
                class="item-leading-icon"
              />
              <span class="claim-draft-item-text">
                <strong>{{ importedTxPresentation(tx).title }}</strong>
                <small v-if="importedTxPresentation(tx).categoryName" class="muted">{{ importedTxPresentation(tx).categoryName }}</small>
              </span>
            </span>
            <MoneyText :value-minor="pendingMinorOfReimburseTx(tx)" />
          </button>
          <div v-if="expandedImportId === String(tx.id)" class="claim-draft-import-edit">
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
                @change="$emit('clamp-reimburse', tx)"
              />
            </label>
          </div>
        </li>
      </ul>
      <p v-else class="muted claim-draft-empty">{{ t('claim_sheet.form.import_hint') }}</p>
    </section>

    <section v-show="activeSection === 'borrow'" class="claim-draft-section">
      <div class="import-action-card">
        <div class="import-summary">
          <small class="muted">{{ t('claim_sheet.import.selected_count', { count: importedBorrowLoanItems.length }) }}</small>
          <MoneyText :value-minor="importedBorrowLoanTotalMinor" />
        </div>
        <button type="button" class="btn" @click="$emit('open-import-borrow')">
          {{ t('claim_sheet.import.open_borrow_loan') }}
        </button>
      </div>
      <ul v-if="importedBorrowLoanItems.length" class="claim-draft-item-list">
        <li v-for="tx in importedBorrowLoanItems" :key="tx.id">
          <button
            type="button"
            class="claim-draft-item-row"
            @click="toggleBorrowExpand(String(tx.id))"
          >
            <span class="claim-draft-item-main">
              <font-awesome-icon
                v-if="importedBorrowLoanPresentation(tx).icon"
                :icon="importedBorrowLoanPresentation(tx).icon"
                class="item-leading-icon"
              />
              <span class="claim-draft-item-text">
                <strong>{{ importedBorrowLoanPresentation(tx).title }}</strong>
                <small v-if="importedBorrowLoanPresentation(tx).categoryName" class="muted">{{ importedBorrowLoanPresentation(tx).categoryName }}</small>
              </span>
            </span>
            <MoneyText :value-minor="pendingMinorOfBorrowTx(tx)" />
          </button>
          <div v-if="expandedBorrowId === String(tx.id)" class="claim-draft-import-edit">
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
                @change="$emit('clamp-borrow', tx)"
              />
            </label>
          </div>
        </li>
      </ul>
      <p v-else class="muted claim-draft-empty">{{ t('claim_sheet.form.import_borrow_loan_hint') }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useCategoryStore } from '@/ui/stores/category.store'
import {
  buildClaimCategoryLookup,
  presentClaimManualFormItem,
  presentImportedClaimTx,
} from '@/ui/utils/claim-sheet-presentation'
import { claimSheetImportedMaxAmountMinor, resolveImportedTxAmountMinor } from '@/ui/utils/claim-sheet-import'

const props = defineProps({
  form: { type: Object, required: true },
  activeSection: { type: String, default: 'manual' },
  draftTotalMinor: { type: Number, default: 0 },
  draftItemCount: { type: Number, default: 0 },
  importedItems: { type: Array, default: () => [] },
  importedBorrowLoanItems: { type: Array, default: () => [] },
  importedTotalMinor: { type: Number, default: 0 },
  importedBorrowLoanTotalMinor: { type: Number, default: 0 },
})

defineEmits([
  'update:activeSection',
  'add-manual',
  'edit-manual',
  'open-import-reimburse',
  'open-import-borrow',
  'clamp-reimburse',
  'clamp-borrow',
])

const { t } = useI18n()
const categoryStore = useCategoryStore()
const expandedImportId = ref('')
const expandedBorrowId = ref('')

const claimCategoryLookup = computed(() => buildClaimCategoryLookup(categoryStore.categories))

const visibleManualItems = computed(() => {
  return (props.form.manualItems ?? []).filter((item) => {
    const amount = Number(item.amountMajor ?? 0)
    const desc = String(item.description ?? '').trim()
    return amount > 0 || desc || String(item.categoryId ?? '').trim()
  })
})

function manualItemPresentation(item) {
  return presentClaimManualFormItem(item, claimCategoryLookup.value, t)
}

function importedTxPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function importedBorrowLoanPresentation(tx) {
  return presentImportedClaimTx(tx, claimCategoryLookup.value, t)
}

function pendingMinorOfReimburseTx(tx) {
  return resolveImportedTxAmountMinor(tx, props.form.importAmountOverrides)
}

function pendingMinorOfBorrowTx(tx) {
  return resolveImportedTxAmountMinor(tx, props.form.borrowLoanImportAmountOverrides)
}

function maxMinorOfReimbursementTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function maxMinorOfBorrowLoanTx(tx) {
  return claimSheetImportedMaxAmountMinor(tx)
}

function toggleImportExpand(id) {
  expandedImportId.value = expandedImportId.value === id ? '' : id
}

function toggleBorrowExpand(id) {
  expandedBorrowId.value = expandedBorrowId.value === id ? '' : id
}
</script>

<style scoped>
.claim-sheet-draft-form {
  gap: 10px;
}

.claim-draft-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  font-weight: 650;
}

.segment-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.segment-pills .tab-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 7px 6px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--bg-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.segment-pills .tab-btn.primary {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border) 52%);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  color: var(--primary);
}

.claim-draft-section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.claim-draft-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}

.claim-draft-item-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.claim-draft-item-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.claim-draft-item-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.claim-draft-item-text strong {
  overflow-wrap: anywhere;
}

.item-leading-icon {
  width: 16px;
  color: var(--primary);
  flex: 0 0 auto;
  margin-top: 2px;
}

.claim-draft-add-btn {
  width: 100%;
  margin-top: 4px;
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

.claim-draft-import-edit {
  display: grid;
  gap: 8px;
  padding: 0 0 10px 24px;
}

.claim-draft-empty {
  margin: 4px 0 0;
  font-size: 13px;
}
</style>
