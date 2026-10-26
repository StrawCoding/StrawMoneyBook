<template>
  <InputBottomSheet
    :open="open"
    :title="t('claim_sheet.form.edit_item')"
    size="form"
    nested
    :show-footer="true"
    :header-close="false"
    body-class="stack claim-manual-item-sheet-body"
    sheet-class="sheet claim-manual-item-sheet"
    @close="$emit('close')"
  >
    <template v-if="draft">
      <CustomSelect
        v-model="draft.entryType"
        :options="entryTypeOptions"
        @update:model-value="onEntryTypeChange"
      />
      <div v-if="draft.entryType === 'advance'" class="manual-static-field muted">
        {{ t('claim_sheet.form.advance_category_hint') }}
      </div>
      <CustomSelect
        v-else
        v-model="draft.categoryId"
        :groups="categoryGroupsByEntryType(draft.entryType)"
        :placeholder="t('claim_sheet.form.choose_category')"
      />
      <label>
        {{ t('claim_sheet.form.item_description') }}
        <input
          v-model="draft.description"
          class="input"
          type="text"
          :placeholder="t('claim_sheet.form.item_description')"
        />
      </label>
      <label>
        {{ t('claim_sheet.form.amount') }}
        <input
          v-model.number="draft.amountMajor"
          class="input"
          data-testid="claim-manual-amount"
          type="number"
          min="0"
          step="1"
          :placeholder="t('claim_sheet.form.amount')"
        />
      </label>
    </template>
    <template #footer>
      <button v-if="allowDelete" type="button" class="btn danger" @click="$emit('remove')">
        {{ t('common.delete') }}
      </button>
      <button type="button" class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
      <button
        type="button"
        class="btn primary"
        data-testid="claim-manual-save"
        :disabled="!canSave"
        @click="$emit('save')"
      >
        {{ t('claim_sheet.form.save_item') }}
      </button>
    </template>
  </InputBottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useCategoryStore } from '@/ui/stores/category.store'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  entryTypeOptions: { type: Array, default: () => [] },
  allowDelete: { type: Boolean, default: true },
})

defineEmits(['close', 'save', 'remove'])

const { t } = useI18n()
const categoryStore = useCategoryStore()
const draft = reactive({
  id: '',
  entryType: 'expense',
  categoryId: '',
  description: '',
  amountMajor: 0,
})

const canSave = computed(() => {
  const amount = Number(draft.amountMajor ?? 0)
  if (amount <= 0) return false
  if (draft.entryType === 'advance') return true
  return Boolean(String(draft.categoryId ?? '').trim())
})

watch(
  () => [props.open, props.item],
  () => {
    if (!props.open || !props.item) return
    draft.id = props.item.id
    draft.entryType = props.item.entryType ?? 'expense'
    draft.categoryId = props.item.categoryId ?? ''
    draft.description = props.item.description ?? ''
    draft.amountMajor = Number(props.item.amountMajor ?? 0)
  },
  { immediate: true, deep: true },
)

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

function onEntryTypeChange(nextType) {
  draft.entryType = nextType === 'income'
    ? 'income'
    : nextType === 'advance'
      ? 'advance'
      : 'expense'
  if (draft.entryType === 'advance') {
    draft.categoryId = ''
    return
  }
  const current = String(draft.categoryId ?? '').trim()
  if (!current || !categoriesByEntryType(draft.entryType).some((item) => item.id === current)) {
    draft.categoryId = firstCategoryIdByEntryType(draft.entryType)
  }
}

defineExpose({ draft })
</script>

<style scoped>
.manual-static-field {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px dashed var(--border);
  background: color-mix(in srgb, var(--card) 90%, var(--primary) 10%);
  font-size: 13px;
}

.claim-manual-item-sheet-body {
  gap: 10px;
}
</style>
