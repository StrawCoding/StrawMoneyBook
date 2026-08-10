<template>
  <InputBottomSheet
    :open="open"
    :title="t('transaction_about.edit_transaction')"
    :body-class="'stack form-wrap'"
    :sheet-class="'sheet'"
    :show-footer="true"
    @close="$emit('close')"
  >
    <div class="type-grid">
      <button
        v-for="item in types"
        :key="item.value"
        class="btn"
        :class="{ primary: model.type === item.value }"
        @click="model.type = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="field">
      {{ t('common.amount_yuan') }}
      <AmountCalculatorInput v-model="model.amountMajor" />
    </div>

    <div class="date-extra-row">
      <div class="field-block">
        <span class="field-label">{{ t('common.transaction_time') }}</span>
        <DateTimePickerField
          :date="model.occurredDate"
          :hour="model.occurredHour"
          :minute="model.occurredMinute"
          @update:date="model.occurredDate = $event"
          @update:hour="model.occurredHour = $event"
          @update:minute="model.occurredMinute = $event"
        />
      </div>

      <button type="button" class="btn extra-btn" :class="{ active: showExtra }" @click="showExtra = true">
        {{ t('common.extra_info') }}
      </button>
    </div>

    <div v-if="showCategory" class="inline-grid">
      <label>
        {{ t('common.account') }}
        <CustomSelect v-model="model.accountId" :groups="directAccountGroups" />
      </label>

      <label>
        {{ t('common.category') }}
        <CustomSelect
          v-model="model.categoryId"
          :groups="categoryPickerGroups"
          :placeholder="t('quick_add.error.category_required')"
          :disabled="!categoryPickerGroups.length"
        />
      </label>
    </div>

    <div v-else-if="model.type === 'transfer'" class="inline-grid">
      <label>
        {{ t('quick_add.field.from_account') }}
        <CustomSelect v-model="model.accountId" :groups="transferAccountGroups" />
      </label>
      <label>
        {{ t('quick_add.field.to_account') }}
        <CustomSelect v-model="model.peerAccountId" :groups="transferAccountGroups" />
      </label>
    </div>

    <label v-else>
      {{ t('common.account') }}
      <CustomSelect v-model="model.accountId" :groups="directAccountGroups" />
    </label>

    <template #footer>
      <button class="btn danger" :disabled="deleting" @click="remove">{{ t('common.delete') }}</button>
      <div class="footer-actions">
        <button class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="submit">{{ t('common.save') }}</button>
      </div>
    </template>
  </InputBottomSheet>

  <InputBottomSheet
    :open="open && showExtra"
    :title="t('common.extra_info')"
    :body-class="'stack extra-content'"
    :sheet-class="'extra-sheet'"
    @close="showExtra = false"
  >
    <div class="addon-wrap">
      <div class="row">
        <span class="field-label">{{ t('quick_add.extra.addon_title') }}</span>
        <button type="button" class="btn" @click="addAddonRow">{{ t('common.add_item') }}</button>
      </div>

      <div v-for="item in addonRows" :key="item.id" class="addon-row">
        <CustomSelect
          v-model="item.optionId"
          class="addon-name"
          :options="addonOptionsByType"
          @update:model-value="onAddonOptionChange(item, $event)"
        />
        <CustomSelect v-model="item.direction" class="addon-dir" :options="addonDirectionOptions" />
        <input
          v-model.number="item.amountMajor"
          class="input addon-amount"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
        />
        <button type="button" class="btn danger addon-remove" @click="removeAddonRow(item.id)">
          {{ t('common.delete') }}
        </button>
      </div>

      <div class="row">
        <small class="addon-desc">{{ t('quick_add.extra.manage_hint') }}</small>
      </div>
    </div>

    <label>
      {{ t('common.note') }}
      <textarea v-model="model.note" class="textarea" rows="3" />
    </label>

    <div v-if="model.type !== 'transfer'" class="impact-wrap">
      <span class="field-label">附加條件</span>
      <div class="switch-list">
        <button
          v-if="model.type === 'expense'"
          type="button"
          class="switch-row"
          :class="{ active: model.isReimbursable }"
          role="switch"
          :aria-checked="model.isReimbursable ? 'true' : 'false'"
          @click="model.isReimbursable = !model.isReimbursable"
        >
          <span class="switch-copy">
            <span class="switch-title">{{ t('quick_add.extra.reimbursable') }}</span>
            <span class="switch-hint">{{ t('quick_add.extra.reimbursable_hint') }}</span>
          </span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
        <div class="switch-grid">
          <button
            type="button"
            class="switch-row"
            :class="{ active: model.includeInBudget }"
            role="switch"
            :aria-checked="model.includeInBudget ? 'true' : 'false'"
            @click="model.includeInBudget = !model.includeInBudget"
          >
            <span class="switch-copy">
              <span class="switch-title">{{ t('quick_add.extra.include_budget') }}</span>
              <span class="switch-hint">{{ t('quick_add.extra.include_budget_hint') }}</span>
            </span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
          <button
            type="button"
            class="switch-row"
            :class="{ active: model.includeInAnalysis }"
            role="switch"
            :aria-checked="model.includeInAnalysis ? 'true' : 'false'"
            @click="model.includeInAnalysis = !model.includeInAnalysis"
          >
            <span class="switch-copy">
              <span class="switch-title">{{ t('quick_add.extra.include_analysis') }}</span>
              <span class="switch-hint">{{ t('quick_add.extra.include_analysis_hint') }}</span>
            </span>
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </button>
        </div>
      </div>
    </div>
  </InputBottomSheet>

  <AppDialog
    :open="deleteConfirmOpen"
    :title="t('home_tx_edit.delete_dialog_title')"
    :message="t('home_tx_edit.delete_dialog_message')"
    :confirm-text="t('home_tx_edit.delete_dialog_confirm')"
    :loading="deleting"
    :loading-text="t('common.processing')"
    @close="closeDeleteConfirm"
    @confirm="confirmRemove"
  />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AmountCalculatorInput from '@/ui/components/common/AmountCalculatorInput.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import DateTimePickerField from '@/ui/components/common/DateTimePickerField.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useI18n } from '@/ui/services/i18n.service'
import { returnHomeAfterTransactionDelete } from '@/ui/services/navigation-back.service'
import {
  addonDeltaMajorFromNote,
  mergeAddonItemsToNote,
  parseAddonItemsFromNote,
  stripAddonSummaryFromNote,
} from '@/ui/utils/addon-note'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  tx: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const router = useRouter()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const addonTemplateStore = useAddonTemplateStore()
const { t } = useI18n()

const types = computed(() => {
  if (props.tx?.type === 'transfer') {
    return [{ value: 'transfer', label: t('home_tx.type.transfer') }]
  }
  const base = [
    { value: 'expense', label: t('analysis_page.type.expense') },
    { value: 'income', label: t('analysis_page.type.income') },
  ]
  if (props.tx?.type === 'adjustment') {
    base.push({ value: 'adjustment', label: t('home_tx.type.balance') })
  }
  return base
})

const model = reactive({
  type: 'expense',
  amountMajor: null,
  occurredDate: '',
  occurredHour: 0,
  occurredMinute: 0,
  accountId: '',
  peerAccountId: '',
  categoryId: '',
  note: '',
  isReimbursable: false,
  includeInBudget: true,
  includeInAnalysis: true,
})

const showExtra = ref(false)
const applyingCategoryDefaults = ref(false)
const hydratingTransactionModel = ref(false)
const addonRows = ref([])
const deleteConfirmOpen = ref(false)
const deleting = ref(false)
let addonSeq = 1
const addonDirectionOptions = [
  { value: 'plus', label: '+' },
  { value: 'minus', label: '-' },
]
const addonOptions = computed(() => addonTemplateStore.templates)

const showCategory = computed(() => model.type === 'expense' || model.type === 'income')
const visibleCategoryGroups = computed(() => {
  if (model.type === 'income') return categoryStore.incomeCategoryGroups
  return categoryStore.expenseCategoryGroups
})
const categoryPickerGroups = computed(() => {
  return (visibleCategoryGroups.value ?? []).filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
})
const directAccountGroups = computed(() => accountStore.groupedRegularAccounts)
const transferAccountGroups = computed(() => accountStore.groupedAccounts)
const directAccountOptions = computed(() => accountStore.regularAccounts)
const transferAccountOptions = computed(() => accountStore.accounts)
const addonOptionsByType = computed(() => {
  return addonOptions.value.map((item) => ({
    value: item.id,
    label: item.label,
  }))
})

watch(
  () => [props.open, props.tx],
  ([open, tx]) => {
    if (!open || !tx) {
      showExtra.value = false
      deleteConfirmOpen.value = false
      return
    }

    hydratingTransactionModel.value = true
    const occurred = new Date(tx.occurred_at)
    const isTransfer = tx.type === 'transfer'
    const isIncome = tx.type === 'income'
    const isAdjustment = tx.type === 'adjustment'

    model.type = isTransfer ? 'transfer' : isIncome ? 'income' : isAdjustment ? 'adjustment' : 'expense'
    const parsedAddonRows = parseAddonRowsFromNote(tx.note)
    const addonDeltaMajor = addonTotalDeltaMajorFromNote(tx.note)

    const rawMajor = Number(tx.amount_minor) / 100
    const finalMajor = isAdjustment ? rawMajor : Math.abs(rawMajor)
    let baseMajor = round2(finalMajor - addonDeltaMajor)
    if (isTransfer && rawMajor > 0) {
      // Incoming leg stores pure transfer amount (without addon delta).
      baseMajor = finalMajor
    }
    if (!Number.isFinite(baseMajor)) baseMajor = finalMajor
    if (!isAdjustment) {
      baseMajor = Math.max(0, baseMajor)
    }
    model.amountMajor = baseMajor
    model.occurredDate = toDateInput(occurred)
    model.occurredHour = occurred.getHours()
    model.occurredMinute = occurred.getMinutes()
    model.accountId = isTransfer
      ? tx.account_id ?? transferAccountOptions.value[0]?.id ?? ''
      : tx.account_id ?? directAccountOptions.value[0]?.id ?? ''
    model.peerAccountId = tx.peer_account_id ?? ''
    model.categoryId = tx.category_id ?? defaultCategoryId(model.type)
    model.note = stripAddonSummaryFromNote(tx.note)
    model.isReimbursable = Boolean(tx.is_reimbursable) && model.type === 'expense'
    model.includeInBudget = Boolean(Number(tx.include_in_budget ?? 1))
    model.includeInAnalysis = Boolean(Number(tx.include_in_analysis ?? 1))

    showExtra.value = false
    addonRows.value = parsedAddonRows
    void nextTick(() => {
      hydratingTransactionModel.value = false
    })
  },
  { immediate: true },
)

function onRequestCloseOverlay(event) {
  if (!props.open) return
  if (showExtra.value) {
    showExtra.value = false
    event.preventDefault()
    return
  }
  emit('close')
  event.preventDefault()
}

onMounted(() => {
  void addonTemplateStore.load()
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

watch(
  () => model.type,
  (type) => {
    if (type === 'transfer') {
      model.categoryId = ''
      model.isReimbursable = false
    } else if (type === 'income') {
      model.categoryId = ensureInCategories(model.categoryId, categoryStore.incomeCategories)
      model.isReimbursable = false
    } else if (type === 'expense') {
      model.categoryId = ensureInCategories(model.categoryId, categoryStore.expenseCategories)
    } else {
      model.categoryId = ''
      model.isReimbursable = false
    }
  },
)

watch(
  () => model.isReimbursable,
  (next, prev) => {
    if (applyingCategoryDefaults.value || hydratingTransactionModel.value) return
    if (next && !prev) {
      model.includeInBudget = false
      model.includeInAnalysis = false
    }
  },
)

watch(
  () => model.categoryId,
  (categoryId) => {
    if (hydratingTransactionModel.value) return
    if (!categoryId || model.type === 'transfer' || model.type === 'adjustment') return
    void applyCategoryDefaults(categoryId)
  },
)

watch(
  () => showExtra.value,
  (open) => {
    if (!open) return
    if (!addonRows.value.length) {
      addonRows.value = [createAddonRow()]
    }
  },
)

async function submit() {
  if (!props.tx?.id) return

  const occurredAt = toOccurredAtIso(model.occurredDate, model.occurredHour, model.occurredMinute)
  if (!occurredAt) {
    uiStore.pushToast('請選擇有效時間', 'error')
    return
  }

  const baseAmountMajor = Number(model.amountMajor ?? 0)
  const appliedAddonItems = collectAppliedAddonItems()
  const addonDeltaMajor = appliedAddonItems.reduce((total, item) => {
    return total + (item.direction === 'plus' ? item.deltaMajor : -item.deltaMajor)
  }, 0)
  const baseAmountMinor = Math.round(baseAmountMajor * 100)
  const sourceExtraMinor = Math.round(addonDeltaMajor * 100)
  const settledAmountMajor = round2(baseAmountMajor + addonDeltaMajor)
  const rawAmountMinor = Math.round(settledAmountMajor * 100)
  const noteText = mergeAddonItemsToNote(String(model.note ?? ''), appliedAddonItems)
  if (model.type === 'adjustment') {
    if (!rawAmountMinor) {
      uiStore.pushToast(t('home_tx_edit.error.adjustment_zero'), 'error')
      return
    }
  } else if (model.type === 'transfer') {
    if (baseAmountMinor <= 0) {
      uiStore.pushToast(t('quick_add.error.transfer_base_amount_invalid'), 'error')
      return
    }
    if (baseAmountMinor + sourceExtraMinor <= 0) {
      uiStore.pushToast(t('quick_add.error.transfer_total_amount_invalid'), 'error')
      return
    }
  } else if (rawAmountMinor < 0) {
    uiStore.pushToast(t('home_tx_edit.error.amount_too_small'), 'error')
    return
  }

  try {
    if (model.type === 'transfer') {
      if (!model.peerAccountId) {
        uiStore.pushToast(t('quick_add.error.to_account_required'), 'error')
        return
      }
      if (model.accountId === model.peerAccountId) {
        uiStore.pushToast(t('quick_add.error.same_account'), 'error')
        return
      }
    }
    const payloadAmountMinor =
      model.type === 'adjustment'
        ? rawAmountMinor
        : model.type === 'transfer'
          ? Math.abs(baseAmountMinor)
          : Math.abs(rawAmountMinor)

    await transactionStore.updateTransaction(props.tx.id, {
      type: model.type,
      amountMinor: payloadAmountMinor,
      sourceExtraMinor: model.type === 'transfer' ? sourceExtraMinor : 0,
      occurredAt,
      accountId: model.accountId,
      peerAccountId: model.type === 'transfer' ? model.peerAccountId : null,
      categoryId: model.type === 'adjustment' || model.type === 'transfer' ? null : model.categoryId,
      note: noteText,
      isReimbursable: model.type === 'expense' && model.isReimbursable,
      includeInBudget: model.includeInBudget,
      includeInAnalysis: model.includeInAnalysis,
    })

    uiStore.pushToast('交易已更新')
    emit('saved')
    emit('close')
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新失敗', 'error')
  }
}

function remove() {
  if (!props.tx?.id) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemove() {
  if (!props.tx?.id) return

  deleting.value = true
  try {
    await transactionStore.deleteTransaction(props.tx.id)
    uiStore.pushToast('交易已刪除')
    deleteConfirmOpen.value = false
    emit('saved')
    emit('close')
    // Stay on / restore home scroll (sheet is home-local; helper is a no-op navigate).
    await returnHomeAfterTransactionDelete(router)
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除失敗', 'error')
  } finally {
    deleting.value = false
  }
}

function createAddonRow() {
  const defaultOption = defaultAddonOption()
  return {
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: defaultOption.id,
    direction: defaultOption.defaultDirection,
    amountMajor: null,
  }
}

function defaultAddonOption() {
  return addonOptions.value[0] ?? { id: 'addon-default', label: t('quick_add.extra.addon_title'), defaultDirection: 'plus' }
}

function addAddonRow() {
  addonRows.value.push(createAddonRow())
}

function removeAddonRow(rowId) {
  addonRows.value = addonRows.value.filter((item) => item.id !== rowId)
}

function onAddonOptionChange(row, optionId) {
  if (!row) return
  row.optionId = optionId
  const matched = addonOptions.value.find((item) => String(item.id) === String(optionId))
  if (!matched) return
  row.direction = matched.defaultDirection === 'minus' ? 'minus' : 'plus'
}

function collectAppliedAddonItems() {
  return addonRows.value
    .map((item) => ({
      label: addonLabelOf(item.optionId),
      direction: item.direction === 'minus' ? 'minus' : 'plus',
      deltaMajor: round2(Math.abs(Number(item.amountMajor ?? 0))),
    }))
    .filter((item) => item.deltaMajor > 0)
}

function addonLabelOf(optionId) {
  return addonOptions.value.find((item) => item.id === optionId)?.label ?? t('quick_add.extra.addon_title')
}

function addonOptionIdByLabel(label) {
  return addonOptions.value.find((item) => item.label === label)?.id ?? defaultAddonOption().id
}

function addonTotalDeltaMajorFromNote(note) {
  return addonDeltaMajorFromNote(note)
}

function parseAddonRowsFromNote(note, options = {}) {
  const parsedItems = parseAddonItemsFromNote(note)
  const rows = parsedItems.map((item) => ({
    id: `addon-${Date.now()}-${addonSeq++}`,
    optionId: addonOptionIdByLabel(item.label),
    direction: item.direction === 'minus' ? 'minus' : 'plus',
    amountMajor: Number(item.deltaMajor),
  }))

  if (rows.length) return rows
  if (options.fallbackDefault === false) return []
  return [createAddonRow()]
}

function defaultCategoryId(type) {
  if (type === 'income') return categoryStore.incomeCategories[0]?.id ?? ''
  if (type === 'expense') return categoryStore.expenseCategories[0]?.id ?? ''
  return ''
}

function ensureInCategories(categoryId, categories) {
  if (!Array.isArray(categories) || !categories.length) return ''
  if (categories.some((item) => item.id === categoryId)) return categoryId
  return categories[0]?.id ?? ''
}

async function applyCategoryDefaults(categoryId) {
  const cat = categoryStore.categories.find((c) => c.id === categoryId)
  if (!cat) return
  applyingCategoryDefaults.value = true
  model.isReimbursable = model.type === 'expense' && Boolean(cat.default_is_reimbursable)
  model.includeInBudget = Boolean(cat.default_include_in_budget ?? 1)
  model.includeInAnalysis = Boolean(cat.default_include_in_analysis ?? 1)
  await nextTick()
  applyingCategoryDefaults.value = false
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatAmountInput(value) {
  const rounded = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(rounded)) return ''
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function toOccurredAtIso(dateInput, hourInput, minuteInput) {
  if (!dateInput) return ''
  const hour = Number(hourInput)
  const minute = Number(minuteInput)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ''
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''

  const local = `${dateInput}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  const parsed = new Date(local)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}
</script>

<style scoped>.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 70
}
.sheet {
  width: min(900px, 100vw);
  max-width: 100vw;
  box-sizing: border-box;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
h3 {
  margin: 0
}
.type-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px
}
.form-wrap {
  margin-top: 12px
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.field-block {
  display: grid;
  gap: 6px;
  min-width: 0
}
.field-label {
  font-size: 13px;
  color: var(--muted)
}
.inline-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.category-trigger {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left
}
.category-icon {
  width: 14px;
  color: var(--primary-soft)
}
.category-trigger.placeholder {
  color: var(--muted)
}
.category-trigger:disabled {
  opacity: 0.65;
  cursor: not-allowed
}
.category-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}
.category-arrow {
  font-size: 15px;
  line-height: 1;
  opacity: 0.8
}
.date-extra-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  min-width: 0
}
.extra-btn {
  white-space: nowrap;
  min-height: 42px;
  align-self: end;
  justify-content: center;
  max-width: 100%
}
.extra-btn.active {
  border-color: color-mix(in srgb, var(--ok) 64%, var(--primary) 36%);
  background: linear-gradient(120deg, color-mix(in srgb, var(--ok) 35%, var(--bg) 65%), color-mix(in srgb, var(--ok) 55%, var(--card) 45%));
  color: var(--text)
}
footer.row {
  justify-content: space-between
}
.footer-actions {
  display: flex;
  gap: 8px
}
.danger {
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
  color: var(--danger)
}
.extra-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-soft);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 80
}
.extra-sheet {
  width: min(900px, 100vw);
  max-width: 100vw;
  box-sizing: border-box;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
.category-mask {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop-strong);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 90
}
.category-sheet {
  width: min(900px, 100vw);
  height: 100dvh;
  max-width: 100vw;
  box-sizing: border-box;
  border-radius: 0;
  padding: calc(10px + var(--status-bar-height)) 12px calc(12px + var(--navigation-bar-height));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px
}
.category-overlay-enter-active, .category-overlay-leave-active {
  transition: opacity var(--anim-mid) ease
}
.category-overlay-enter-from, .category-overlay-leave-to {
  opacity: 0
}
.category-overlay-enter-active .category-sheet, .category-overlay-leave-active .category-sheet {
  transition:
    opacity var(--anim-mid) ease,
    transform var(--anim-mid) var(--anim-spring)
}
.category-overlay-enter-from .category-sheet, .category-overlay-leave-to .category-sheet {
  opacity: 0;
  transform: translateY(56px)
}
.category-head h4 {
  font-size: 17px
}
.category-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(124px, 42%) minmax(0, 1fr);
  gap: 10px
}
.category-pane {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  background: var(--surface-popover);
  padding: 6px;
  overflow: auto
}
.parent-pane, .child-pane {
  display: grid;
  align-content: start;
  gap: 6px
}
.category-item {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 10px 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px
}
.category-item.active {
  background: color-mix(in srgb, var(--primary) 26%, transparent);
  color: var(--primary-soft);
  font-weight: 700
}
.category-item-icon {
  width: 14px;
  color: inherit
}
.category-empty {
  margin: 10px 2px 0;
  color: var(--muted);
  font-size: 13px
}
.category-tip {
  margin: 0 2px;
  color: var(--muted);
  font-size: 12px
}
h4 {
  margin: 0;
  font-size: 16px
}
.extra-content {
  margin-top: 10px;
  min-width: 0;
  overflow-x: hidden
}
.addon-wrap {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.addon-wrap > .row {
  flex-wrap: wrap;
}
.addon-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px 72px auto;
  gap: 6px;
  align-items: end;
  min-width: 0;
}
.addon-name {
  min-width: 0;
}
.addon-dir {
  min-width: 0;
}
.addon-amount {
  min-width: 0;
}
.addon-remove {
  padding: 10px 6px;
  white-space: nowrap;
  min-width: 0;
}
.addon-wrap .field-label,
.addon-desc {
  overflow-wrap: anywhere;
}
.addon-desc {
  color: var(--muted);
}
.impact-wrap {
  display: grid;
  gap: 6px
}
.switch-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px
}
.switch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.switch-row {
  border: 1px solid var(--field-border);
  border-radius: 16px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--surface-soft-accent) 76%, var(--card) 24%), color-mix(in srgb, var(--surface-muted) 82%, var(--card) 18%));
  color: var(--text-soft);
  padding: 12px 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--shadow-color, #000) 8%, transparent);
  will-change: transform;
  transition: transform 120ms ease-out, border-color 120ms ease-out, box-shadow 120ms ease-out
}
.switch-row:hover {
  transform: translate3d(0, -1px, 0);
  border-color: color-mix(in srgb, var(--primary) 26%, var(--field-border) 74%);
  box-shadow: 0 14px 30px color-mix(in srgb, var(--shadow-color, #000) 12%, transparent)
}
.switch-copy {
  display: grid;
  gap: 4px;
  text-align: left
}
.switch-title {
  color: var(--text);
  font-size: .96rem;
  line-height: 1.2
}
.switch-hint {
  color: var(--muted);
  font-size: .76rem;
  line-height: 1.35;
  font-weight: 500
}
.switch-track {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--surface-muted);
  padding: 2px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  margin-top: 2px;
  transition: background-color 120ms ease-out
}
.switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--surface-highlight);
  transform: translate3d(0, 0, 0);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--shadow-color, #000) 18%, transparent);
  will-change: transform;
  transition: transform 160ms cubic-bezier(.22, .8, .28, 1), background-color 120ms ease-out
}
.switch-row.active {
  border-color: color-mix(in srgb, var(--ok) 64%, var(--primary) 36%);
  background: linear-gradient(135deg, color-mix(in srgb, var(--ok) 18%, var(--bg) 82%), color-mix(in srgb, var(--primary) 20%, var(--card) 80%));
  color: var(--text);
  box-shadow: 0 16px 32px color-mix(in srgb, var(--ok) 14%, transparent)
}
.switch-row.active .switch-hint {
  color: color-mix(in srgb, var(--text) 70%, var(--muted) 30%)
}
.switch-row.active .switch-track {
  background: var(--surface-ok-strong)
}
.switch-row.active .switch-thumb {
  transform: translate3d(20px, 0, 0);
  background: color-mix(in srgb, white 78%, var(--surface-highlight) 22%)
}
@media (max-width: 620px) {
  .addon-row {
    grid-template-columns: minmax(0, 1fr) 52px 64px auto;
  }
}
@media (max-width: 560px) {
  .addon-row {
    grid-template-columns: minmax(0, 1fr) 48px 58px auto;
    gap: 4px;
  }
}</style>
