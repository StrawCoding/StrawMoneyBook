<template>
  <InputBottomSheet
    :open="open"
    :title="model.id ? t('budgeting.container.sheet.edit_title') : t('budgeting.container.sheet.create_title')"
    :body-class="'stack form-wrap'"
    :sheet-class="'sheet'"
    :show-footer="true"
    :close-text="t('budgeting.sheet.close')"
    @close="$emit('close')"
  >
    <label>
      {{ t('budgeting.container.name') }}
      <input v-model="model.name" class="input" type="text" maxlength="80" />
    </label>

    <label>
      {{ t('budgeting.container.period_mode') }}
      <div class="period-mode-row">
        <button
          type="button"
          class="period-mode-btn"
          :class="{ active: model.periodMode === 'monthly' }"
          @click="model.periodMode = 'monthly'"
        >
          {{ t('budgeting.container.period_mode.monthly') }}
        </button>
        <button
          type="button"
          class="period-mode-btn"
          :class="{ active: model.periodMode === 'daily' }"
          @click="model.periodMode = 'daily'"
        >
          {{ t('budgeting.container.period_mode.daily') }}
        </button>
      </div>
    </label>

    <label v-if="model.periodMode === 'daily'">
      {{ t('budgeting.container.categories_field') }}
      <div class="category-picker">
        <section
          v-for="group in categoryPickerGroups"
          :key="group.id"
          class="category-group"
        >
          <div class="category-group-title">{{ group.name }}</div>
          <div class="category-chip-grid">
            <button
              v-for="category in group.categories"
              :key="category.id"
              type="button"
              class="category-chip"
              :class="{ active: model.categoryIds.includes(category.id) }"
              @click="toggleCategory(category.id)"
            >
              {{ category.name }}
            </button>
          </div>
        </section>
      </div>
      <small class="muted">{{ t('budgeting.container.daily_pool_category_hint') }}</small>
    </label>

    <label>
      {{ containerAmountLabel }}
      <div class="amount-row">
        <input v-model.number="model.amountMajor" class="input" type="number" min="0" step="1" />
        <button
          v-if="model.periodMode !== 'daily'"
          type="button"
          class="btn"
          :disabled="!canFillChildSum"
          @click="fillChildBudgetSum"
        >
          {{ t('budgeting.container.fill_child_sum') }}
        </button>
      </div>
      <small v-if="childSumMajor > 0" class="muted">
        {{ t('budgeting.container.child_sum_hint', { amount: childSumMajor }) }}
      </small>
    </label>

    <div class="field-card">
      <span>{{ t('budgeting.budget_save.title') }}</span>
      <button
        type="button"
        class="switch-row"
        :class="{ active: model.budgetSaveEnabled }"
        :aria-pressed="model.budgetSaveEnabled ? 'true' : 'false'"
        @click="model.budgetSaveEnabled = !model.budgetSaveEnabled"
      >
        <span class="switch-copy">
          <strong>{{ model.budgetSaveEnabled ? t('budgeting.budget_save.enabled') : t('budgeting.budget_save.disabled') }}</strong>
          <small class="muted">{{ t('budgeting.budget_save.mode.monthly') }}</small>
        </span>
        <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
      </button>
    </div>

    <template v-if="model.budgetSaveEnabled">
      <label>
        {{ t('budgeting.budget_save.target') }}
        <CustomSelect v-model="model.budgetSaveTargetAccountId" :groups="budgetSaveTargetGroups" />
      </label>

      <label>
        {{ t('budgeting.budget_save.source') }}
        <CustomSelect v-model="model.budgetSaveSourceAccountId" :groups="budgetSaveSourceGroups" />
      </label>

      <p class="muted budget-save-copy">
        {{ t('budgeting.container.budget_save_hint') }}
      </p>
      <p v-if="budgetSaveInvalidReason" class="error-text">{{ budgetSaveInvalidReason }}</p>
    </template>

    <template #footer>
      <button class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
      <button class="btn primary" :disabled="Boolean(saveInvalidReason)" @click="onSave">{{ t('common.save') }}</button>
    </template>
  </InputBottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  container: {
    type: Object,
    default: null,
  },
  accountGroups: {
    type: Array,
    default: () => [],
  },
  savingsJarAccounts: {
    type: Array,
    default: () => [],
  },
  regularAccounts: {
    type: Array,
    default: () => [],
  },
  hasChildBudgetSave: {
    type: Boolean,
    default: false,
  },
  childItems: {
    type: Array,
    default: () => [],
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
  name: '',
  amountMajor: null,
  periodMode: 'monthly',
  categoryIds: [],
  budgetSaveEnabled: false,
  budgetSaveTargetAccountId: '',
  budgetSaveSourceAccountId: '',
})

const categoryPickerGroups = computed(() => {
  if ((props.categoryGroups ?? []).length > 0) {
    return props.categoryGroups.filter((group) => Array.isArray(group.categories) && group.categories.length > 0)
  }
  if (!(props.categories ?? []).length) return []
  return [{
    id: '__default__',
    name: t('budgeting.sheet.category'),
    categories: props.categories,
  }]
})

const containerAmountLabel = computed(() => (
  model.periodMode === 'daily'
    ? t('budgeting.container.amount_daily')
    : t('budgeting.container.amount')
))

const childSumMinor = computed(() => (
  (props.childItems ?? []).reduce((total, item) => {
    const resolved = Number(item?.resolved_amount_minor ?? item?.amount_minor ?? 0)
    if (!Number.isFinite(resolved) || resolved <= 0) return total
    return total + Math.round(resolved)
  }, 0)
))

const childSumMajor = computed(() => Math.round(childSumMinor.value) / 100)

const canFillChildSum = computed(() => childSumMinor.value > 0)

function toggleCategory(categoryId) {
  const key = String(categoryId ?? '').trim()
  if (!key) return
  const next = new Set(model.categoryIds.map((value) => String(value)))
  if (next.has(key)) next.delete(key)
  else next.add(key)
  model.categoryIds = Array.from(next)
}

function fillChildBudgetSum() {
  if (!canFillChildSum.value) return
  model.amountMajor = childSumMajor.value
}

const budgetSaveTargetGroups = computed(() => (
  buildAccountOptionGroups(props.accountGroups, props.savingsJarAccounts)
))
const budgetSaveTargetOptions = computed(() => budgetSaveTargetGroups.value.flatMap((group) => group.options))
const selectedTargetAccount = computed(() => (
  (props.savingsJarAccounts ?? []).find((account) => String(account.id) === String(model.budgetSaveTargetAccountId))
))
const budgetSaveSourceGroups = computed(() => (
  buildAccountOptionGroups(props.accountGroups, props.regularAccounts, {
    currencyCode: selectedTargetAccount.value?.currency_code,
  })
))
const budgetSaveSourceOptions = computed(() => budgetSaveSourceGroups.value.flatMap((group) => group.options))

const budgetSaveInvalidReason = computed(() => {
  if (!model.budgetSaveEnabled) return ''
  if (props.hasChildBudgetSave) return t('budgeting.budget_save.error.group_conflict')
  if (!budgetSaveTargetOptions.value.length) return t('budgeting.budget_save.error.target_invalid')
  if (!String(model.budgetSaveTargetAccountId ?? '').trim()) return t('budgeting.budget_save.error.target_required')
  if (!budgetSaveSourceOptions.value.length) return t('budgeting.budget_save.error.source_invalid')
  if (!String(model.budgetSaveSourceAccountId ?? '').trim()) return t('budgeting.budget_save.error.source_required')
  if (String(model.budgetSaveTargetAccountId) === String(model.budgetSaveSourceAccountId)) {
    return t('budgeting.budget_save.error.same_account')
  }
  return ''
})

const saveInvalidReason = computed(() => {
  if (!String(model.name ?? '').trim()) return t('budgeting.container.error.name_required')
  return budgetSaveInvalidReason.value
})

watch(
  () => [props.open, props.container],
  () => {
    if (!props.open) return

    if (props.container) {
      model.id = props.container.id
      model.name = props.container.name ?? ''
      model.amountMajor = Number(props.container.amount_minor ?? 0) / 100
      model.periodMode = String(props.container.period_mode ?? '').trim() === 'daily' ? 'daily' : 'monthly'
      model.categoryIds = (props.childItems ?? [])
        .map((item) => String(item?.category_id ?? '').trim())
        .filter(Boolean)
      model.budgetSaveEnabled = Number(props.container.budget_save_enabled ?? 0) === 1
      model.budgetSaveTargetAccountId = String(props.container.budget_save_target_account_id ?? '')
      model.budgetSaveSourceAccountId = String(props.container.budget_save_source_account_id ?? '')
      return
    }

    model.id = ''
    model.name = ''
    model.amountMajor = null
    model.periodMode = 'monthly'
    model.categoryIds = []
    model.budgetSaveEnabled = false
    model.budgetSaveTargetAccountId = String(props.savingsJarAccounts?.[0]?.id ?? '')
    model.budgetSaveSourceAccountId = ''
  },
  { immediate: true },
)

watch(
  () => budgetSaveTargetOptions.value,
  (options) => {
    if (!model.budgetSaveEnabled) return
    const current = String(model.budgetSaveTargetAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    model.budgetSaveTargetAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

watch(
  () => budgetSaveSourceOptions.value,
  (options) => {
    if (!model.budgetSaveEnabled) return
    const current = String(model.budgetSaveSourceAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    model.budgetSaveSourceAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

function onSave() {
  if (saveInvalidReason.value) return
  emit('save', {
    id: model.id || undefined,
    name: String(model.name ?? '').trim(),
    amountMinor: Math.round(Number(model.amountMajor ?? 0) * 100),
    periodMode: model.periodMode === 'daily' ? 'daily' : 'monthly',
    categoryIds: model.periodMode === 'daily' ? [...model.categoryIds] : undefined,
    budgetSaveEnabled: model.budgetSaveEnabled,
    budgetSaveTargetAccountId: model.budgetSaveEnabled ? model.budgetSaveTargetAccountId : null,
    budgetSaveSourceAccountId: model.budgetSaveEnabled ? model.budgetSaveSourceAccountId : null,
  })
}
</script>

<style scoped>
.form-wrap {
  margin-top: 12px
}
.field-card {
  display: grid;
  gap: 8px;
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.period-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.period-mode-btn {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.period-mode-btn.active {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--field-border) 54%);
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
  color: var(--primary);
}
.amount-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.category-picker {
  display: grid;
  gap: 10px;
}
.category-group {
  display: grid;
  gap: 6px;
}
.category-group-title {
  font-size: 12px;
  color: var(--muted);
}
.category-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.category-chip {
  border: 1px solid var(--field-border);
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--card);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.category-chip.active {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--field-border) 54%);
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
  color: var(--primary);
}
.budget-save-copy {
  margin: 0;
}
.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  border-radius: 16px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--surface-soft-accent) 12%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}
.switch-copy {
  display: grid;
  gap: 4px;
  text-align: left;
}
.switch-track {
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 72%, var(--card) 28%);
  padding: 4px;
  transition: background-color var(--anim-fast) var(--anim-standard);
  flex: 0 0 auto;
}
.switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transform: translate3d(0, 0, 0);
  transition: transform var(--anim-mid) var(--anim-spring);
  will-change: transform;
}
.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--field-border) 54%);
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
}
.switch-row.active .switch-track {
  background: var(--primary);
}
.switch-row.active .switch-thumb {
  transform: translate3d(20px, 0, 0);
}
</style>
