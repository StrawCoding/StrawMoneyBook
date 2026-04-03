<template>
  <InputBottomSheet
    :open="open"
    :title="model.id ? t('budgeting.sheet.edit_title') : t('budgeting.sheet.create_title')"
    :body-class="'stack form-wrap'"
    :sheet-class="'sheet'"
    :show-footer="true"
    :close-text="t('budgeting.sheet.close')"
    @close="$emit('close')"
  >
    <label>
      {{ t('budgeting.sheet.category') }}
      <CustomSelect
        v-model="model.categoryId"
        :groups="categoryPickerGroups"
        :placeholder="t('budgeting.sheet.pick_category')"
        :disabled="!categoryPickerGroups.length"
      />
    </label>

    <label>
      {{ t('budgeting.amount_mode') }}
      <CustomSelect v-model="model.amountMode" :options="amountModeOptions" />
    </label>

    <label v-if="model.amountMode === 'daily_average'">
      {{ t('budgeting.rule_unit') }}
      <CustomSelect v-model="model.dayRuleUnit" :options="dayRuleUnitOptions" />
    </label>

    <div v-if="model.amountMode === 'daily_average' && model.dayRuleUnit === 'weekday'" class="stack rule-wrap">
      <div class="row day-rule-quick-row">
        <button type="button" class="btn" @click="applyWeekdayPreset('weekdays')">{{ t('budgeting.sheet.rule_weekdays') }}</button>
        <button type="button" class="btn" @click="applyWeekdayPreset('weekends')">{{ t('budgeting.sheet.rule_weekends') }}</button>
        <button type="button" class="btn" @click="applyWeekdayPreset('all')">{{ t('budgeting.sheet.rule_all') }}</button>
        <button type="button" class="btn" @click="applyWeekdayPreset('clear')">{{ t('budgeting.sheet.rule_clear') }}</button>
      </div>
      <div class="day-chip-grid">
        <button
          v-for="day in weekdayValues"
          :key="`weekday-${day}`"
          type="button"
          class="day-chip"
          :class="{ active: model.dayRuleValues.includes(day) }"
          @click="toggleDayRuleValue(day)"
        >
          {{ day }}
        </button>
      </div>
      <small class="muted">{{ t('budgeting.sheet.weekday_help') }}</small>
    </div>

    <div v-if="model.amountMode === 'daily_average' && model.dayRuleUnit === 'monthday'" class="stack rule-wrap">
      <div class="day-chip-grid monthday-grid">
        <button
          v-for="day in monthdayValues"
          :key="`monthday-${day}`"
          type="button"
          class="day-chip"
          :class="{ active: model.dayRuleValues.includes(day) }"
          @click="toggleDayRuleValue(day)"
        >
          {{ day }}
        </button>
      </div>
      <small class="muted">{{ t('budgeting.sheet.monthday_help') }}</small>
    </div>

    <label>
      {{ model.amountMode === 'daily_average' ? t('budgeting.sheet.daily_amount_label') : t('budgeting.sheet.amount_label') }}
      <input v-model.number="model.amountMajor" class="input" type="number" min="0" step="1" />
    </label>

    <small v-if="model.amountMode === 'daily_average'" class="muted">
      {{ t('budgeting.sheet.selected_days', { values: selectedDayRuleLabel || '-' }) }}
    </small>

    <template #footer>
      <button class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
      <button class="btn primary" @click="onSave">{{ t('common.save') }}</button>
    </template>
  </InputBottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  categoryGroups: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'save'])
const { t } = useI18n()

const model = reactive({
  id: '',
  categoryId: '',
  amountMajor: null,
  amountMode: 'fixed',
  dayRuleUnit: 'weekday',
  dayRuleValues: [],
})
const weekdayValues = [1, 2, 3, 4, 5, 6, 7]
const monthdayValues = Array.from({ length: 31 }, (_, index) => index + 1)

const amountModeOptions = computed(() => [
  { value: 'fixed', label: t('budgeting.amount_mode.fixed') },
  { value: 'daily_average', label: t('budgeting.amount_mode.daily_average') },
])
const dayRuleUnitOptions = computed(() => [
  { value: 'weekday', label: t('budgeting.rule_unit.weekday') },
  { value: 'monthday', label: t('budgeting.rule_unit.monthday') },
])
const categoryOptions = computed(() => props.categories ?? [])
const categoryPickerGroups = computed(() => {
  if ((props.categoryGroups ?? []).length > 0) {
    return props.categoryGroups.filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
  }
  if (!categoryOptions.value.length) return []
  return [
    {
      id: '__default__',
      name: t('budgeting.sheet.category'),
      categories: categoryOptions.value,
    },
  ]
})
const selectedDayRuleLabel = computed(() => model.dayRuleValues.join(', '))

watch(
  () => [props.open, props.item],
  () => {
    if (!props.open) return

    if (props.item) {
      model.id = props.item.id
      model.categoryId = props.item.category_id ?? ''
      model.amountMajor = Number(props.item.amount_minor ?? 0) / 100
      model.amountMode = normalizeAmountMode(props.item.amount_mode)
      model.dayRuleUnit = normalizeDayRuleUnit(props.item.day_rule_unit)
      model.dayRuleValues = normalizeDayRuleValues(props.item.day_rule_values ?? props.item.day_rule_values_json, model.dayRuleUnit)
      ensureRuleSelection()
      return
    }

    model.id = ''
    model.categoryId = categoryOptions.value[0]?.id ?? ''
    model.amountMajor = null
    model.amountMode = 'fixed'
    model.dayRuleUnit = 'weekday'
    model.dayRuleValues = defaultDayRuleValues('weekday')
  },
  { immediate: true },
)

watch(
  () => model.amountMode,
  () => {
    ensureRuleSelection()
  },
)

watch(
  () => model.dayRuleUnit,
  () => {
    ensureRuleSelection()
  },
)

function normalizeAmountMode(value) {
  return value === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  return value === 'monthday' ? 'monthday' : 'weekday'
}

function safeParseValues(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeDayRuleValues(values, unit) {
  const rawList = Array.isArray(values)
    ? values
    : (typeof values === 'string' ? safeParseValues(values) : [])
  const min = 1
  const max = unit === 'monthday' ? 31 : 7
  return Array.from(
    new Set(
      rawList
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= min && value <= max),
    ),
  ).sort((a, b) => a - b)
}

function defaultDayRuleValues(unit) {
  return unit === 'monthday' ? [1] : [1, 2, 3, 4, 5]
}

function ensureRuleSelection() {
  model.amountMode = normalizeAmountMode(model.amountMode)
  model.dayRuleUnit = normalizeDayRuleUnit(model.dayRuleUnit)
  const normalizedValues = normalizeDayRuleValues(model.dayRuleValues, model.dayRuleUnit)
  if (model.amountMode !== 'daily_average') {
    model.dayRuleValues = normalizedValues
    return
  }
  model.dayRuleValues = normalizedValues.length ? normalizedValues : defaultDayRuleValues(model.dayRuleUnit)
}

function applyWeekdayPreset(preset) {
  if (preset === 'weekends') {
    model.dayRuleValues = [6, 7]
    return
  }
  if (preset === 'all') {
    model.dayRuleValues = [...weekdayValues]
    return
  }
  if (preset === 'clear') {
    model.dayRuleValues = []
    return
  }
  model.dayRuleValues = [1, 2, 3, 4, 5]
}

function toggleDayRuleValue(value) {
  const next = new Set(model.dayRuleValues)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  model.dayRuleValues = Array.from(next).sort((a, b) => a - b)
}

function onSave() {
  emit('save', {
    id: model.id || undefined,
    categoryId: model.categoryId,
    amountMinor: Math.round(Number(model.amountMajor ?? 0) * 100),
    amountMode: model.amountMode,
    dayRuleUnit: model.amountMode === 'daily_average' ? model.dayRuleUnit : 'none',
    dayRuleValues: model.amountMode === 'daily_average' ? [...model.dayRuleValues] : [],
  })
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
  border-radius: 18px 18px 0 0;
  padding: 14px 14px calc(14px + var(--navigation-bar-height))
}
h3 {
  margin: 0
}
.form-wrap {
  margin-top: 12px
}
.rule-wrap {
  gap: 8px
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
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
.footer {
  margin-top: 12px
}
.day-rule-quick-row {
  gap: 6px;
  flex-wrap: wrap
}
.day-chip-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px
}
.monthday-grid {
  grid-template-columns: repeat(7, minmax(0, 1fr))
}
.day-chip {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  min-height: 36px;
  font-weight: 700
}
.day-chip.active {
  border-color: color-mix(in srgb, var(--primary) 60%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface));
  color: var(--primary)
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
  font-size: 17px;
  margin: 0
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

@media (max-width: 480px) {
  .day-chip-grid,
  .monthday-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
