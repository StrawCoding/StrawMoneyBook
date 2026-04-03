<template>
  <section class="stack">
    <h2 class="page-title">{{ t('budgeting.title') }}</h2>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.monthly_budget') }}</h3>
        <div class="month-controls">
          <button class="btn month-btn" :disabled="budgetStore.loading" @click="changeMonth(-1)">‹</button>
          <span class="month-label">{{ displayMonth }}</span>
          <button class="btn month-btn" :disabled="budgetStore.loading" @click="changeMonth(1)">›</button>
          <button class="btn month-today" :disabled="budgetStore.loading" @click="goCurrentMonth">{{ t('budgeting.this_month') }}</button>
        </div>
      </header>

      <div class="stack stat">
        <div class="row">
          <span class="muted">{{ t('budgeting.budget_total') }}</span>
          <MoneyText :value-minor="budgetStore.totalBudgetMinor" />
        </div>
        <div class="row">
          <span class="muted">{{ t('budgeting.used') }}</span>
          <MoneyText :value-minor="budgetStore.totalSpentMinor" />
        </div>
        <div class="row">
          <span class="muted">{{ t('budgeting.remaining') }}</span>
          <MoneyText :value-minor="budgetStore.remainMinor" />
        </div>
      </div>

      <section class="budget-save-panel">
        <div class="row budget-save-head">
          <div>
            <strong>{{ t('budgeting.budget_save.total_title') }}</strong>
            <p class="muted budget-save-summary">{{ totalBudgetSaveSummary }}</p>
          </div>
          <span class="budget-save-chip" :class="{ invalid: Boolean(totalBudgetSaveInvalidReason) }">
            {{ totalBudgetSaveStatusLabel }}
          </span>
        </div>

        <button
          type="button"
          class="switch-row"
          :class="{ active: totalSaveForm.enabled }"
          :aria-pressed="totalSaveForm.enabled ? 'true' : 'false'"
          @click="totalSaveForm.enabled = !totalSaveForm.enabled"
        >
          <span class="switch-copy">
            <strong>{{ totalSaveForm.enabled ? t('budgeting.budget_save.enabled') : t('budgeting.budget_save.disabled') }}</strong>
            <small class="muted">{{ t('budgeting.budget_save.mode.monthly') }}</small>
          </span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>

        <template v-if="totalSaveForm.enabled">
          <label>
            {{ t('budgeting.budget_save.target') }}
            <CustomSelect v-model="totalSaveForm.targetAccountId" :groups="totalSaveTargetGroups" />
          </label>

          <label>
            {{ t('budgeting.budget_save.source') }}
            <CustomSelect v-model="totalSaveForm.sourceAccountId" :groups="totalSaveSourceGroups" />
          </label>

          <label>
            {{ t('budgeting.budget_save.retroactive_mode') }}
            <CustomSelect v-model="totalSaveForm.retroactiveMode" :options="retroactiveModeOptions" />
          </label>

          <p v-if="totalBudgetSaveInvalidReason" class="error-text">{{ totalBudgetSaveInvalidReason }}</p>
        </template>

        <div class="row item-actions-row">
          <button class="btn primary" :disabled="totalSaveLoading" @click="saveTotalBudgetSaveConfig">
            {{ totalSaveLoading ? t('common.processing') : t('common.save') }}
          </button>
        </div>
      </section>

      <div class="row action-row">
        <button class="btn" @click="copyPreviousMonth">{{ t('budgeting.copy_previous') }}</button>
        <button class="btn primary" @click="openCreate">{{ t('budgeting.add_item') }}</button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.items_by_category') }}</h3>
        <span class="badge">{{ t('budgeting.items_count', { count: budgetStore.items.length }) }}</span>
      </header>

      <ul class="list">
        <li v-for="item in budgetStore.items" :key="item.id" class="item-row">
          <div class="item-main">
            <BudgetMiniPie
              :ratio="itemUsedRatio(item)"
              :over="isItemOverBudget(item)"
              :percent-label="itemUsedPercentLabel(item)"
              :subtitle="t('budgeting.used')"
            />

            <div class="item-content">
              <div class="row">
                <span>{{ categoryName(item.category_id) }}</span>
                <MoneyText :value-minor="itemBudgetMinor(item)" />
              </div>
              <small v-if="isDailyAverageItem(item)" class="muted item-rule-hint">{{ itemDailyRuleSummary(item) }}</small>
              <div v-if="itemBudgetSaveEnabled(item)" class="budget-save-inline">
                <span class="budget-save-chip" :class="{ invalid: Boolean(itemBudgetSaveIssue(item)) }">
                  {{ itemBudgetSaveModeLabel(item) }}
                </span>
                <small class="muted">{{ itemBudgetSaveSummary(item) }}</small>
              </div>
              <p v-if="itemBudgetSaveIssue(item)" class="error-text">{{ itemBudgetSaveIssue(item) }}</p>
              <div class="row budget-line budget-summary-line">
                <div class="budget-side remain-line">
                  <small class="budget-label">{{ t('budgeting.remaining') }}</small>
                  <small class="budget-value">{{ formatMajor(itemRemainMinor(item)) }}</small>
                </div>
                <div class="budget-side used-line">
                  <small class="budget-label">{{ t('budgeting.used') }}</small>
                  <small class="budget-value">{{ formatMajor(itemSpentMinor(item.category_id)) }}</small>
                </div>
              </div>
              <div class="row item-actions-row">
                <div class="btn-wrap">
                  <button class="btn" @click="openEdit(item)">{{ t('budgeting.edit') }}</button>
                  <button class="btn" @click="removeItem(item.id)">{{ t('budgeting.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li v-if="budgetStore.items.length === 0" class="muted">{{ t('budgeting.empty') }}</li>
      </ul>
    </article>

    <BudgetItemSheet
      :open="isSheetOpen"
      :item="editingItem"
      :categories="categoryStore.expenseCategories"
      :category-groups="categoryStore.expenseCategoryGroups"
      :account-groups="accountStore.groups"
      :savings-jar-accounts="accountStore.savingsJarAccounts"
      :regular-accounts="accountStore.regularAccounts"
      :duplicate-category-ids="duplicateBudgetSaveCategoryIds"
      @close="closeSheet"
      @save="saveItem"
    />

    <AppDialog
      :open="deleteDialogOpen"
      :title="t('budgeting.delete')"
      :message="t('budgeting.confirm_delete')"
      :cancel-text="t('common.cancel')"
      :confirm-text="t('budgeting.delete')"
      :loading="deleteLoading"
      @close="closeDeleteDialog"
      @confirm="confirmRemoveItem"
    />
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetItemSheet from '@/ui/components/budget/BudgetItemSheet.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'

const budgetStore = useBudgetStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const isSheetOpen = ref(false)
const editingItem = ref(null)
const deleteDialogOpen = ref(false)
const deleteLoading = ref(false)
const pendingDeleteItemId = ref('')
const totalSaveLoading = ref(false)
const totalSaveForm = reactive({
  enabled: false,
  targetAccountId: '',
  sourceAccountId: '',
  retroactiveMode: 'manual',
})
const budgetErrorKeys = new Set([
  'budgeting.error.category_required',
  'budgeting.error.rule_unit_required',
  'budgeting.error.rule_values_required',
  'budgeting.budget_save.error.target_required',
  'budgeting.budget_save.error.source_required',
  'budgeting.budget_save.error.same_account',
  'budgeting.budget_save.error.target_invalid',
  'budgeting.budget_save.error.source_invalid',
  'budgeting.budget_save.error.currency_mismatch',
  'budgeting.budget_save.error.conflict',
])
const retroactiveModeOptions = computed(() => ([
  { value: 'manual', label: t('budgeting.budget_save.retroactive.manual') },
  { value: 'delta', label: t('budgeting.budget_save.retroactive.delta') },
]))

const duplicateBudgetSaveCategoryIds = computed(() => {
  const grouped = new Map()
  for (const item of budgetStore.items) {
    const categoryId = String(item?.category_id ?? '').trim()
    if (!categoryId) continue
    if (!grouped.has(categoryId)) grouped.set(categoryId, [])
    grouped.get(categoryId).push(item)
  }
  return Array.from(grouped.entries())
    .filter(([, items]) => items.length > 1 && items.some((item) => Number(item?.budget_save_enabled ?? 0) === 1))
    .map(([categoryId]) => categoryId)
})

const totalSaveTargetGroups = computed(() => (
  buildAccountOptionGroups(accountStore.groups, accountStore.savingsJarAccounts)
))
const totalSaveTargetOptions = computed(() => totalSaveTargetGroups.value.flatMap((group) => group.options))

const selectedTotalTargetAccount = computed(() => {
  return accountStore.savingsJarAccounts.find((account) => String(account.id) === String(totalSaveForm.targetAccountId))
})

const totalSaveSourceGroups = computed(() => (
  buildAccountOptionGroups(accountStore.groups, accountStore.regularAccounts, {
    currencyCode: selectedTotalTargetAccount.value?.currency_code,
  })
))
const totalSaveSourceOptions = computed(() => totalSaveSourceGroups.value.flatMap((group) => group.options))

const totalBudgetSaveInvalidReason = computed(() => {
  if (!totalSaveForm.enabled) return ''
  if (!totalSaveTargetOptions.value.length) return t('budgeting.budget_save.error.target_invalid')
  if (!String(totalSaveForm.targetAccountId ?? '').trim()) return t('budgeting.budget_save.error.target_required')
  if (!totalSaveSourceOptions.value.length) return t('budgeting.budget_save.error.source_invalid')
  if (!String(totalSaveForm.sourceAccountId ?? '').trim()) return t('budgeting.budget_save.error.source_required')
  if (String(totalSaveForm.targetAccountId) === String(totalSaveForm.sourceAccountId)) return t('budgeting.budget_save.error.same_account')
  return ''
})

const totalBudgetSaveStatusLabel = computed(() => {
  if (!totalSaveForm.enabled) return t('budgeting.budget_save.status.off')
  if (totalBudgetSaveInvalidReason.value) return t('budgeting.budget_save.status.invalid')
  return t('budgeting.budget_save.status.active')
})

const totalBudgetSaveSummary = computed(() => {
  if (!totalSaveForm.enabled) return t('budgeting.budget_save.summary_off')
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(totalSaveForm.targetAccountId))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(totalSaveForm.sourceAccountId))
  return t('budgeting.budget_save.total_summary', {
    source: source?.name || '-',
    target: target?.name || '-',
    mode: t(`budgeting.budget_save.retroactive.${totalSaveForm.retroactiveMode}`),
  })
})

watch(
  () => [budgetStore.budget, budgetStore.budgetSavePreferences],
  () => {
    totalSaveForm.enabled = Number(budgetStore.budget?.budget_save_total_enabled ?? 0) === 1
    totalSaveForm.targetAccountId = String(budgetStore.budget?.budget_save_total_target_account_id ?? '')
    totalSaveForm.sourceAccountId = String(budgetStore.budget?.budget_save_total_source_account_id ?? '')
    totalSaveForm.retroactiveMode = String(budgetStore.budgetSavePreferences?.retroactiveMode ?? 'manual')
  },
  { immediate: true, deep: true },
)

watch(
  () => totalSaveTargetOptions.value,
  (options) => {
    if (!totalSaveForm.enabled) return
    const current = String(totalSaveForm.targetAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    totalSaveForm.targetAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

watch(
  () => totalSaveSourceOptions.value,
  (options) => {
    if (!totalSaveForm.enabled) return
    const current = String(totalSaveForm.sourceAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    totalSaveForm.sourceAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

function changeMonth(offset) {
  const monthKey = shiftMonthKey(budgetStore.monthKey, offset)
  if (!monthKey) return
  budgetStore.loadMonth(monthKey)
}

function goCurrentMonth() {
  const monthKey = monthKeyFromDate(new Date())
  if (monthKey === budgetStore.monthKey) return
  budgetStore.loadMonth(monthKey)
}

const displayMonth = computed(() => {
  if (!budgetStore.monthKey) return '-'
  const [year, month] = budgetStore.monthKey.split('-')
  return t('budgeting.month_display', { year, month })
})

function shiftMonthKey(monthKey, offset = 0) {
  const [year, month] = String(monthKey ?? '').split('-').map((part) => Number(part))
  if (!year || !month) return ''
  const next = new Date(year, month - 1 + offset, 1)
  return monthKeyFromDate(next)
}

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name ?? t('budgeting.deleted_category')
}

function itemSpentMinor(categoryId) {
  const spentMinor = Number(budgetStore.spentMap[categoryId] ?? 0)
  return Number.isFinite(spentMinor) ? spentMinor : 0
}

function itemBudgetMinor(item) {
  const budgetMinor = Number(item?.resolved_amount_minor ?? item?.amount_minor ?? 0)
  if (!Number.isFinite(budgetMinor)) return 0
  return Math.max(0, budgetMinor)
}

function itemBaseMinor(item) {
  const budgetMinor = Number(item?.amount_minor ?? 0)
  if (!Number.isFinite(budgetMinor)) return 0
  return Math.max(0, budgetMinor)
}

function itemRemainMinor(item) {
  return itemBudgetMinor(item) - itemSpentMinor(item?.category_id)
}

function itemUsedRatio(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) return 0
  const ratio = itemSpentMinor(item.category_id) / budgetMinor
  return Number.isFinite(ratio) ? ratio : 0
}

function itemUsedPercentLabel(item) {
  return `${Math.round(itemUsedRatio(item) * 100)}%`
}

function isItemOverBudget(item) {
  return itemBudgetMinor(item) > 0 && itemUsedRatio(item) > 1
}

function isDailyAverageItem(item) {
  return String(item?.amount_mode ?? '') === 'daily_average'
}

function itemRuleValues(item) {
  if (Array.isArray(item?.day_rule_values)) return item.day_rule_values
  if (typeof item?.day_rule_values_json === 'string') {
    try {
      const parsed = JSON.parse(item.day_rule_values_json)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function itemDailyRuleSummary(item) {
  if (!isDailyAverageItem(item)) return ''
  const unitKey = String(item?.day_rule_unit ?? '') === 'monthday'
    ? 'budgeting.rule_unit.monthday'
    : 'budgeting.rule_unit.weekday'
  const values = itemRuleValues(item).join(', ') || '-'
  return `${t('budgeting.amount_mode.daily_average')} ${formatMajor(itemBaseMinor(item))} / ${t(unitKey)} ${values} · ${t('budgeting.occurrence_count', { count: Number(item?.occurrence_count ?? 0) })} · 已用 ${Number(item?.used_occurrence_count ?? 0)} 次`
}

function numberFormatLocale() {
  return locale.value === 'en' ? 'en-US' : 'zh-TW'
}

function formatMajor(amountMinor) {
  const minor = Number(amountMinor)
  if (!Number.isFinite(minor)) return ''

  const hasFraction = Math.abs(minor) % 100 !== 0
  return new Intl.NumberFormat(numberFormatLocale(), {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function resolveBudgetErrorMessage(error) {
  const key = String(error?.code ?? error?.message ?? '').trim()
  if (budgetErrorKeys.has(key)) return t(key)
  return error?.message ?? t('budgeting.toast.save_failed')
}

function itemBudgetSaveEnabled(item) {
  return Number(item?.budget_save_enabled ?? 0) === 1
}

function itemBudgetSaveModeLabel(item) {
  return isDailyAverageItem(item)
    ? t('budgeting.budget_save.mode.daily')
    : t('budgeting.budget_save.mode.monthly')
}

function itemBudgetSaveIssue(item) {
  if (!itemBudgetSaveEnabled(item)) return ''
  const categoryId = String(item?.category_id ?? '').trim()
  if (duplicateBudgetSaveCategoryIds.value.includes(categoryId)) {
    return t('budgeting.budget_save.error.conflict')
  }
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(item?.budget_save_target_account_id ?? ''))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(item?.budget_save_source_account_id ?? ''))
  if (!target) return t('budgeting.budget_save.error.target_invalid')
  if (!source) return t('budgeting.budget_save.error.source_invalid')
  if (String(target.currency_code ?? '').toUpperCase() !== String(source.currency_code ?? '').toUpperCase()) {
    return t('budgeting.budget_save.error.currency_mismatch')
  }
  return ''
}

function itemBudgetSaveSummary(item) {
  if (!itemBudgetSaveEnabled(item)) return ''
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(item?.budget_save_target_account_id ?? ''))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(item?.budget_save_source_account_id ?? ''))
  return t('budgeting.budget_save.item_summary', {
    source: source?.name || '-',
    target: target?.name || '-',
  })
}

function openCreate() {
  editingItem.value = null
  isSheetOpen.value = true
}

function openEdit(item) {
  editingItem.value = item
  isSheetOpen.value = true
}

function closeSheet() {
  isSheetOpen.value = false
  editingItem.value = null
}

async function saveItem(payload) {
  try {
    await budgetStore.upsertItem(payload)
    uiStore.pushToast(t('budgeting.toast.saved'))
    closeSheet()
  } catch (error) {
    uiStore.pushToast(resolveBudgetErrorMessage(error), 'error')
  }
}

function removeItem(itemId) {
  pendingDeleteItemId.value = itemId
  deleteDialogOpen.value = true
}

function closeDeleteDialog() {
  if (deleteLoading.value) return
  deleteDialogOpen.value = false
  pendingDeleteItemId.value = ''
}

async function confirmRemoveItem() {
  if (!pendingDeleteItemId.value || deleteLoading.value) return
  deleteLoading.value = true
  try {
    await budgetStore.deleteItem(pendingDeleteItemId.value)
    uiStore.pushToast(t('budgeting.toast.deleted'))
    deleteDialogOpen.value = false
    pendingDeleteItemId.value = ''
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.delete_failed'), 'error')
  } finally {
    deleteLoading.value = false
  }
}

async function copyPreviousMonth() {
  try {
    const result = await budgetStore.copyFromPreviousMonth()
    if (!result.copied) {
      uiStore.pushToast(t('budgeting.toast.copy_not_found', { fromMonth: result.fromMonth }))
      return
    }
    uiStore.pushToast(t('budgeting.toast.copied', { count: result.copied }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.copy_failed'), 'error')
  }
}

async function saveTotalBudgetSaveConfig() {
  if (totalBudgetSaveInvalidReason.value || totalSaveLoading.value) return
  totalSaveLoading.value = true
  try {
    await budgetStore.saveBudgetSavePreferences({
      retroactiveMode: totalSaveForm.retroactiveMode,
    })
    await budgetStore.saveTotalBudgetSave({
      enabled: totalSaveForm.enabled,
      targetAccountId: totalSaveForm.enabled ? totalSaveForm.targetAccountId : null,
      sourceAccountId: totalSaveForm.enabled ? totalSaveForm.sourceAccountId : null,
    })
    uiStore.pushToast(t('budgeting.budget_save.toast.saved'))
  } catch (error) {
    uiStore.pushToast(resolveBudgetErrorMessage(error), 'error')
  } finally {
    totalSaveLoading.value = false
  }
}
</script>

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.page-title {
  font-size: 24px
}
.month-controls {
  display: flex;
  align-items: center;
  gap: 6px
}
.month-label {
  min-width: 90px;
  text-align: center;
  font-weight: 700
}
.month-btn {
  width: 36px;
  padding: 8px 0
}
.month-today {
  padding: 8px 10px
}
.stat {
  margin-top: 10px
}
.budget-save-panel {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--field-border) 78%, transparent);
  border-radius: 14px;
  display: grid;
  gap: 10px;
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
}
.budget-save-head {
  align-items: flex-start;
}
.budget-save-summary,
.budget-save-inline small {
  margin: 0;
}
.budget-save-inline {
  display: grid;
  gap: 4px;
}
.budget-save-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ok) 40%, var(--field-border) 60%);
  color: var(--ok);
  font-size: 12px;
  font-weight: 700;
}
.budget-save-chip.invalid {
  border-color: color-mix(in srgb, var(--danger, #d14343) 40%, var(--field-border) 60%);
  color: var(--danger, #d14343);
}
.action-row {
  margin-top: 12px
}
.list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px
}
.item-row {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.item-main {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px
}
.item-content {
  display: grid;
  gap: 8px;
  min-width: 0
}
.item-rule-hint {
  display: block
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
.budget-line {
  justify-content: space-between;
  font-weight: 700
}
.budget-summary-line {
  gap: 12px
}
.budget-side {
  display: inline-flex;
  align-items: center;
  gap: 6px
}
.budget-label,
.budget-value {
  font-size: 12px
}
.used-line {
  color: var(--chart-budget-used, var(--danger, #d14343))
}
.remain-line {
  color: var(--chart-budget-remain, var(--success, #1f9d55))
}
.item-actions-row {
  justify-content: flex-end
}
.btn-wrap {
  display: flex;
  gap: 6px
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
