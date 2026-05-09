<template>
  <section class="stack">
    <header class="row">
      <h2 class="page-title">{{ t('budgeting.title') }}</h2>
      <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.monthly_budget') }}</h3>
        <HomeRangePicker
          mode="month"
          :month="budgetStore.monthKey"
          @update:month="pickMonth"
        />
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
        <button type="button" class="summary-entry-btn" @click="openTotalBudgetSaveDetail">
          <div class="row budget-save-head">
            <div>
              <strong>{{ t('budgeting.budget_save.total_title') }}</strong>
              <p class="muted budget-save-summary">{{ totalBudgetSaveSummary }}</p>
            </div>
            <span class="budget-save-chip" :class="{ invalid: Boolean(totalBudgetSaveInvalidReason) }">
              {{ totalBudgetSaveStatusLabel }}
            </span>
          </div>
        </button>
      </section>

      <div class="row action-row">
        <button class="btn" @click="copyPreviousMonth">{{ t('budgeting.copy_previous') }}</button>
        <button class="btn" @click="openCreateContainer">{{ t('budgeting.add_parent_container') }}</button>
        <button class="btn primary" @click="openCreate">{{ t('budgeting.add_item') }}</button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.items_by_category') }}</h3>
        <span class="badge">{{ t('budgeting.items_count', { count: budgetStore.items.length + budgetStore.containers.length }) }}</span>
      </header>

      <ul class="list">
        <li v-for="container in budgetStore.containers" :key="container.id" class="item-row">
          <button type="button" class="item-card-btn container-card-btn" @click="openContainerDetail(container)">
            <div class="item-main">
              <BudgetMiniPie
                :ratio="containerUsedRatio(container)"
                :over="isContainerOverBudget(container)"
                :percent-label="containerUsedPercentLabel(container)"
                :subtitle="t('budgeting.used')"
              />

              <div class="item-content parent-scope">
                <div class="row">
                  <span>{{ container.name }}</span>
                  <MoneyText :value-minor="container.amount_minor" />
                </div>
                <small class="muted item-rule-hint">{{ t('budgeting.parent_container') }}</small>
                <div v-if="containerBudgetSaveEnabled(container)" class="row budget-save-inline-row">
                  <span class="budget-save-chip" :class="{ invalid: Boolean(containerBudgetSaveIssue(container)) }">
                    {{ t('budgeting.budget_save.mode.monthly') }}
                  </span>
                  <small class="muted budget-save-inline-copy">{{ containerBudgetSaveSummary(container) }}</small>
                </div>
                <p v-if="containerBudgetSaveIssue(container)" class="error-text">{{ containerBudgetSaveIssue(container) }}</p>
                <div class="row budget-line budget-summary-line">
                  <div class="budget-side remain-line">
                    <small class="budget-label">{{ t('budgeting.remaining') }}</small>
                    <small class="budget-value">{{ formatMajor(containerRemainMinor(container)) }}</small>
                  </div>
                  <div class="budget-side used-line">
                    <small class="budget-label">{{ t('budgeting.used') }}</small>
                    <small class="budget-value">{{ formatMajor(containerSpentMinor(container)) }}</small>
                  </div>
                </div>
              </div>
            </div>
          </button>
          <ul v-if="itemsByContainerId.get(String(container.id))?.length" class="child-list">
            <li v-for="item in itemsByContainerId.get(String(container.id))" :key="item.id" class="child-item-row">
              <button type="button" class="child-item-btn" @click="openItemDetail(item)">
                <span>{{ budgetItemName(item) }}</span>
                <MoneyText :value-minor="itemBudgetMinor(item)" />
              </button>
            </li>
          </ul>
        </li>
        <li v-for="item in ungroupedBudgetItems" :key="item.id" class="item-row">
          <button type="button" class="item-card-btn" @click="openItemDetail(item)">
            <div class="item-main">
              <BudgetMiniPie
                :ratio="itemUsedRatio(item)"
                :over="isItemOverBudget(item)"
                :percent-label="itemUsedPercentLabel(item)"
                :subtitle="t('budgeting.used')"
              />

              <div class="item-content">
                <div class="row">
                  <span>{{ budgetItemName(item) }}</span>
                  <MoneyText :value-minor="itemBudgetMinor(item)" />
                </div>
                <small v-if="isDailyAverageItem(item)" class="muted item-rule-hint">{{ itemDailyRuleSummary(item) }}</small>
                <div v-if="itemBudgetSaveEnabled(item)" class="row budget-save-inline-row">
                  <span class="budget-save-chip" :class="{ invalid: Boolean(itemBudgetSaveIssue(item)) }">
                    {{ itemBudgetSaveModeLabel(item) }}
                  </span>
                  <small class="muted budget-save-inline-copy">{{ itemBudgetSaveSummary(item) }}</small>
                </div>
                <p v-if="itemBudgetSaveIssue(item)" class="error-text">{{ itemBudgetSaveIssue(item) }}</p>
                <div class="row budget-line budget-summary-line">
                  <div class="budget-side remain-line">
                    <small class="budget-label">{{ t('budgeting.remaining') }}</small>
                    <small class="budget-value">{{ formatMajor(itemRemainMinor(item)) }}</small>
                  </div>
                  <div class="budget-side used-line">
                    <small class="budget-label">{{ t('budgeting.used') }}</small>
                    <small class="budget-value">{{ formatMajor(itemSpentMinor(item)) }}</small>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </li>
        <li v-if="budgetStore.items.length === 0 && budgetStore.containers.length === 0" class="muted">{{ t('budgeting.empty') }}</li>
      </ul>
    </article>

    <InputBottomSheet
      :open="isItemDetailOpen"
      :title="detailItem ? budgetItemName(detailItem) : t('budgeting.items_by_category')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeItemDetail"
    >
      <template v-if="detailItem">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.sheet.category') }}</small>
          <strong>{{ budgetItemName(detailItem) }}</strong>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.amount_mode') }}</small>
          <strong>{{ detailItemAmountModeLabel }}</strong>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.sheet.amount_label') }}</small>
          <strong>{{ detailItemAmountLabel }}</strong>
        </div>
        <div class="detail-row-grid">
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.used') }}</small>
            <strong>{{ detailItemUsedLabel }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.remaining') }}</small>
            <strong>{{ detailItemRemainingLabel }}</strong>
          </div>
        </div>
        <div v-if="detailItemRuleText" class="detail-block">
          <small class="muted">{{ t('budgeting.rule_unit') }}</small>
          <strong>{{ detailItemRuleText }}</strong>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.budget_save.title') }}</small>
          <div v-if="itemBudgetSaveEnabled(detailItem)" class="stack detail-budget-save">
            <div class="row detail-budget-save-line">
              <span class="budget-save-chip" :class="{ invalid: Boolean(itemBudgetSaveIssue(detailItem)) }">
                {{ itemBudgetSaveModeLabel(detailItem) }}
              </span>
              <span class="detail-budget-save-copy">{{ itemBudgetSaveSummary(detailItem) }}</span>
            </div>
            <p v-if="itemBudgetSaveIssue(detailItem)" class="error-text">{{ itemBudgetSaveIssue(detailItem) }}</p>
          </div>
          <strong v-else>{{ t('budgeting.budget_save.disabled') }}</strong>
        </div>
      </template>

      <template #footer>
        <button class="btn" @click="requestRemoveItemFromDetail">{{ t('budgeting.delete') }}</button>
        <button class="btn primary" @click="editDetailItem">{{ t('budgeting.edit') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isContainerDetailOpen"
      :title="detailContainer ? detailContainer.name : t('budgeting.parent_container')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeContainerDetail"
    >
      <template v-if="detailContainer">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.parent_container') }}</small>
          <strong>{{ detailContainer.name }}</strong>
        </div>
        <div class="detail-row-grid">
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.sheet.amount_label') }}</small>
            <strong>{{ formatMajor(detailContainer.amount_minor) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.used') }}</small>
            <strong>{{ formatMajor(containerSpentMinor(detailContainer)) }}</strong>
          </div>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.budget_save.title') }}</small>
          <strong>{{ containerBudgetSaveEnabled(detailContainer) ? containerBudgetSaveSummary(detailContainer) : t('budgeting.budget_save.disabled') }}</strong>
        </div>
      </template>

      <template #footer>
        <button class="btn" @click="requestRemoveContainerFromDetail">{{ t('budgeting.delete') }}</button>
        <button class="btn primary" @click="editDetailContainer">{{ t('budgeting.edit') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isTotalBudgetSaveDetailOpen"
      :title="t('budgeting.budget_save.total_title')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeTotalBudgetSaveDetail"
    >
      <div class="detail-block">
        <small class="muted">{{ t('budgeting.detail.status') }}</small>
        <strong>{{ totalBudgetSaveStatusLabel }}</strong>
      </div>
      <div class="detail-block">
        <small class="muted">{{ t('budgeting.budget_save.title') }}</small>
        <div v-if="totalSaveForm.enabled" class="stack detail-budget-save">
          <div class="row detail-budget-save-line">
            <span class="budget-save-chip" :class="{ invalid: Boolean(totalBudgetSaveInvalidReason) }">
              {{ t('budgeting.budget_save.mode.monthly') }}
            </span>
            <span class="detail-budget-save-copy">{{ totalBudgetSaveSummary }}</span>
          </div>
          <p v-if="totalBudgetSaveInvalidReason" class="error-text">{{ totalBudgetSaveInvalidReason }}</p>
        </div>
        <strong v-else>{{ t('budgeting.budget_save.disabled') }}</strong>
      </div>
      <div v-if="totalSaveForm.enabled" class="detail-row-grid">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.budget_save.target') }}</small>
          <strong>{{ selectedTotalTargetAccount?.name || '-' }}</strong>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.budget_save.source') }}</small>
          <strong>{{ selectedTotalSourceAccount?.name || '-' }}</strong>
        </div>
      </div>
      <div v-if="totalSaveForm.enabled" class="detail-block">
        <small class="muted">{{ t('budgeting.budget_save.retroactive_mode') }}</small>
        <strong>{{ t(`budgeting.budget_save.retroactive.${totalSaveForm.retroactiveMode}`) }}</strong>
      </div>

      <template #footer>
        <button class="btn primary" @click="openTotalBudgetSaveConfig">{{ t('budgeting.edit') }}</button>
      </template>
    </InputBottomSheet>

    <InputBottomSheet
      :open="isTotalBudgetSaveConfigOpen"
      :title="t('budgeting.budget_save.total_title')"
      :body-class="'stack form-wrap'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeTotalBudgetSaveConfig"
    >
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

      <template #footer>
        <button class="btn" @click="closeTotalBudgetSaveConfig">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="totalSaveLoading" @click="saveTotalBudgetSaveConfig">
          {{ totalSaveLoading ? t('common.processing') : t('common.save') }}
        </button>
      </template>
    </InputBottomSheet>

    <BudgetItemSheet
      :open="isSheetOpen"
      :item="editingItem"
      :budget-month="budgetStore.monthKey"
      :categories="categoryStore.expenseCategories"
      :category-groups="categoryStore.expenseCategoryGroups"
      :containers="budgetStore.containers"
      :account-groups="accountStore.groups"
      :savings-jar-accounts="accountStore.savingsJarAccounts"
      :regular-accounts="accountStore.regularAccounts"
      :budget-save-conflict-scopes="budgetSaveConflictScopes"
      @close="closeSheet"
      @save="saveItem"
    />

    <InputBottomSheet
      :open="isContainerSheetOpen"
      :title="editingContainer ? t('budgeting.edit_parent_container') : t('budgeting.add_parent_container')"
      :body-class="'stack form-wrap'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeContainerSheet"
    >
      <label>
        {{ t('budgeting.container_name') }}
        <input v-model="containerForm.name" class="input" type="text" maxlength="40" />
      </label>
      <label>
        {{ t('budgeting.sheet.amount_label') }}
        <input v-model.number="containerForm.amountMajor" class="input" type="number" min="0" step="1" />
      </label>
      <button
        type="button"
        class="switch-row"
        :class="{ active: containerForm.budgetSaveEnabled }"
        :aria-pressed="containerForm.budgetSaveEnabled ? 'true' : 'false'"
        @click="containerForm.budgetSaveEnabled = !containerForm.budgetSaveEnabled"
      >
        <span class="switch-copy">
          <strong>{{ containerForm.budgetSaveEnabled ? t('budgeting.budget_save.enabled') : t('budgeting.budget_save.disabled') }}</strong>
          <small class="muted">{{ t('budgeting.budget_save.mode.monthly') }}</small>
        </span>
        <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
      </button>
      <template v-if="containerForm.budgetSaveEnabled">
        <label>
          {{ t('budgeting.budget_save.target') }}
          <CustomSelect v-model="containerForm.budgetSaveTargetAccountId" :groups="totalSaveTargetGroups" />
        </label>
        <label>
          {{ t('budgeting.budget_save.source') }}
          <CustomSelect v-model="containerForm.budgetSaveSourceAccountId" :groups="containerSaveSourceGroups" />
        </label>
        <p v-if="containerBudgetSaveInvalidReason" class="error-text">{{ containerBudgetSaveInvalidReason }}</p>
      </template>

      <template #footer>
        <button class="btn" @click="closeContainerSheet">{{ t('common.cancel') }}</button>
        <button class="btn primary" @click="saveContainer">{{ t('common.save') }}</button>
      </template>
    </InputBottomSheet>

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
import { RouterLink } from 'vue-router'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetItemSheet from '@/ui/components/budget/BudgetItemSheet.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'

const budgetStore = useBudgetStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

const isSheetOpen = ref(false)
const editingItem = ref(null)
const detailItem = ref(null)
const detailContainer = ref(null)
const isItemDetailOpen = ref(false)
const isContainerDetailOpen = ref(false)
const isContainerSheetOpen = ref(false)
const editingContainer = ref(null)
const deleteDialogOpen = ref(false)
const deleteLoading = ref(false)
const pendingDeleteItemId = ref('')
const pendingDeleteContainerId = ref('')
const totalSaveLoading = ref(false)
const isTotalBudgetSaveDetailOpen = ref(false)
const isTotalBudgetSaveConfigOpen = ref(false)
const totalSaveForm = reactive({
  enabled: false,
  targetAccountId: '',
  sourceAccountId: '',
  retroactiveMode: 'manual',
})
const containerForm = reactive({
  name: '',
  amountMajor: null,
  budgetSaveEnabled: false,
  budgetSaveTargetAccountId: '',
  budgetSaveSourceAccountId: '',
})
const budgetErrorKeys = new Set([
  'budgeting.error.category_required',
  'budgeting.error.container_name_required',
  'budgeting.error.rule_unit_required',
  'budgeting.error.rule_values_required',
  'budgeting.budget_save.error.target_required',
  'budgeting.budget_save.error.source_required',
  'budgeting.budget_save.error.same_account',
  'budgeting.budget_save.error.target_invalid',
  'budgeting.budget_save.error.source_invalid',
  'budgeting.budget_save.error.currency_mismatch',
  'budgeting.budget_save.error.conflict',
  'budgeting.budget_save.error.parent_conflict',
  'budgeting.budget_save.error.group_conflict',
])
const retroactiveModeOptions = computed(() => ([
  { value: 'manual', label: t('budgeting.budget_save.retroactive.manual') },
  { value: 'delta', label: t('budgeting.budget_save.retroactive.delta') },
]))

const itemsByContainerId = computed(() => {
  const map = new Map()
  for (const item of budgetStore.items) {
    const containerId = String(item?.budget_container_id ?? '').trim()
    if (!containerId) continue
    if (!map.has(containerId)) map.set(containerId, [])
    map.get(containerId).push(item)
  }
  return map
})

const ungroupedBudgetItems = computed(() => budgetStore.items.filter((item) => !String(item?.budget_container_id ?? '').trim()))

const duplicateBudgetSaveCategoryIds = computed(() => {
  const counts = new Map()
  for (const item of budgetStore.items) {
    if (Number(item?.budget_save_enabled ?? 0) !== 1) continue
    const categoryId = String(item?.category_id ?? '').trim()
    if (!categoryId) continue
    counts.set(categoryId, Number(counts.get(categoryId) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([categoryId]) => categoryId)
})

const budgetSaveConflictScopes = computed(() => {
  const scopes = []
  for (const item of budgetStore.items) {
    if (Number(item?.budget_save_enabled ?? 0) !== 1) continue
    const itemId = String(item?.id ?? '')
    const categoryId = String(item?.category_id ?? '').trim()
    if (!categoryId) continue
    scopes.push({ key: categoryId, itemId })
  }
  return scopes
})

const totalSaveTargetGroups = computed(() => (
  buildAccountOptionGroups(accountStore.groups, accountStore.savingsJarAccounts)
))
const totalSaveTargetOptions = computed(() => totalSaveTargetGroups.value.flatMap((group) => group.options))

const selectedTotalTargetAccount = computed(() => (
  accountStore.savingsJarAccounts.find((account) => String(account.id) === String(totalSaveForm.targetAccountId))
))

const selectedTotalSourceAccount = computed(() => (
  accountStore.regularAccounts.find((account) => String(account.id) === String(totalSaveForm.sourceAccountId))
))

const totalSaveSourceGroups = computed(() => (
  buildAccountOptionGroups(accountStore.groups, accountStore.regularAccounts, {
    currencyCode: selectedTotalTargetAccount.value?.currency_code,
  })
))
const totalSaveSourceOptions = computed(() => totalSaveSourceGroups.value.flatMap((group) => group.options))

const selectedContainerTargetAccount = computed(() => (
  accountStore.savingsJarAccounts.find((account) => String(account.id) === String(containerForm.budgetSaveTargetAccountId))
))

const containerSaveSourceGroups = computed(() => (
  buildAccountOptionGroups(accountStore.groups, accountStore.regularAccounts, {
    currencyCode: selectedContainerTargetAccount.value?.currency_code,
  })
))
const containerSaveSourceOptions = computed(() => containerSaveSourceGroups.value.flatMap((group) => group.options))

const totalBudgetSaveInvalidReason = computed(() => {
  if (!totalSaveForm.enabled) return ''
  if (!totalSaveTargetOptions.value.length) return t('budgeting.budget_save.error.target_invalid')
  if (!String(totalSaveForm.targetAccountId ?? '').trim()) return t('budgeting.budget_save.error.target_required')
  if (!totalSaveSourceOptions.value.length) return t('budgeting.budget_save.error.source_invalid')
  if (!String(totalSaveForm.sourceAccountId ?? '').trim()) return t('budgeting.budget_save.error.source_required')
  if (String(totalSaveForm.targetAccountId) === String(totalSaveForm.sourceAccountId)) return t('budgeting.budget_save.error.same_account')
  return ''
})

const containerBudgetSaveInvalidReason = computed(() => {
  if (!containerForm.budgetSaveEnabled) return ''
  if (!totalSaveTargetOptions.value.length) return t('budgeting.budget_save.error.target_invalid')
  if (!String(containerForm.budgetSaveTargetAccountId ?? '').trim()) return t('budgeting.budget_save.error.target_required')
  if (!containerSaveSourceOptions.value.length) return t('budgeting.budget_save.error.source_invalid')
  if (!String(containerForm.budgetSaveSourceAccountId ?? '').trim()) return t('budgeting.budget_save.error.source_required')
  if (String(containerForm.budgetSaveTargetAccountId) === String(containerForm.budgetSaveSourceAccountId)) return t('budgeting.budget_save.error.same_account')
  return ''
})

const totalBudgetSaveStatusLabel = computed(() => {
  if (!totalSaveForm.enabled) return t('budgeting.budget_save.status.off')
  if (totalBudgetSaveInvalidReason.value) return t('budgeting.budget_save.status.invalid')
  return t('budgeting.budget_save.status.active')
})

const totalBudgetSaveSummary = computed(() => {
  if (!totalSaveForm.enabled) return t('budgeting.budget_save.summary_off')
  return t('budgeting.budget_save.total_summary', {
    source: selectedTotalSourceAccount.value?.name || '-',
    target: selectedTotalTargetAccount.value?.name || '-',
    mode: t(`budgeting.budget_save.retroactive.${totalSaveForm.retroactiveMode}`),
  })
})

const detailItemAmountModeLabel = computed(() => {
  if (!detailItem.value) return '-'
  return isDailyAverageItem(detailItem.value)
    ? t('budgeting.amount_mode.daily_average')
    : t('budgeting.amount_mode.fixed')
})

const detailItemAmountLabel = computed(() => {
  if (!detailItem.value) return '-'
  if (!isDailyAverageItem(detailItem.value)) {
    return formatMajor(itemBudgetMinor(detailItem.value))
  }
  return `${formatMajor(itemBaseMinor(detailItem.value))} / ${t('budgeting.amount_mode.daily_average')} · ${formatMajor(itemBudgetMinor(detailItem.value))}`
})

const detailItemUsedLabel = computed(() => (
  detailItem.value ? formatMajor(itemSpentMinor(detailItem.value)) : '-'
))

const detailItemRemainingLabel = computed(() => (
  detailItem.value ? formatMajor(itemRemainMinor(detailItem.value)) : '-'
))

const detailItemRuleText = computed(() => (
  detailItem.value && isDailyAverageItem(detailItem.value)
    ? itemDailyRuleSummary(detailItem.value)
    : ''
))

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

watch(
  () => totalSaveTargetOptions.value,
  (options) => {
    if (!containerForm.budgetSaveEnabled) return
    const current = String(containerForm.budgetSaveTargetAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    containerForm.budgetSaveTargetAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

watch(
  () => containerSaveSourceOptions.value,
  (options) => {
    if (!containerForm.budgetSaveEnabled) return
    const current = String(containerForm.budgetSaveSourceAccountId ?? '')
    if (options.some((option) => String(option.value) === current)) return
    containerForm.budgetSaveSourceAccountId = String(options[0]?.value ?? '')
  },
  { deep: true },
)

function pickMonth(monthKey) {
  if (!monthKey || monthKey === budgetStore.monthKey) return
  budgetStore.loadMonth(monthKey)
}

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name ?? t('budgeting.deleted_category')
}

function budgetItemName(item) {
  return categoryName(item?.category_id)
}

function itemSpentMinor(item) {
  const spentMinor = Number(budgetStore.spentMap[String(item?.category_id ?? '').trim()] ?? 0)
  return Number.isFinite(spentMinor) ? spentMinor : 0
}

function containerChildren(container) {
  return itemsByContainerId.value.get(String(container?.id ?? '')) ?? []
}

function containerSpentMinor(container) {
  return containerChildren(container).reduce((total, item) => total + itemSpentMinor(item), 0)
}

function containerRemainMinor(container) {
  return Math.max(0, Number(container?.amount_minor ?? 0)) - containerSpentMinor(container)
}

function containerUsedRatio(container) {
  const budgetMinor = Math.max(0, Number(container?.amount_minor ?? 0))
  if (!budgetMinor) return 0
  const ratio = containerSpentMinor(container) / budgetMinor
  return Number.isFinite(ratio) ? ratio : 0
}

function containerUsedPercentLabel(container) {
  return `${Math.round(containerUsedRatio(container) * 100)}%`
}

function isContainerOverBudget(container) {
  return Math.max(0, Number(container?.amount_minor ?? 0)) > 0 && containerUsedRatio(container) > 1
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
  return itemBudgetMinor(item) - itemSpentMinor(item)
}

function itemUsedRatio(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) return 0
  const ratio = itemSpentMinor(item) / budgetMinor
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
  const parentContainer = budgetStore.containers.find((container) => (
    String(container.id) === String(item?.budget_container_id ?? '')
  ))
  if (containerBudgetSaveEnabled(parentContainer)) return t('budgeting.budget_save.error.parent_conflict')
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(item?.budget_save_target_account_id ?? ''))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(item?.budget_save_source_account_id ?? ''))
  if (!target) return t('budgeting.budget_save.error.target_invalid')
  if (!source) return t('budgeting.budget_save.error.source_invalid')
  if (String(target.currency_code ?? '').toUpperCase() !== String(source.currency_code ?? '').toUpperCase()) {
    return t('budgeting.budget_save.error.currency_mismatch')
  }
  return ''
}

function containerBudgetSaveEnabled(container) {
  return Number(container?.budget_save_enabled ?? 0) === 1
}

function containerBudgetSaveIssue(container) {
  if (!containerBudgetSaveEnabled(container)) return ''
  if (containerChildren(container).some((item) => itemBudgetSaveEnabled(item))) {
    return t('budgeting.budget_save.error.group_conflict')
  }
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(container?.budget_save_target_account_id ?? ''))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(container?.budget_save_source_account_id ?? ''))
  if (!target) return t('budgeting.budget_save.error.target_invalid')
  if (!source) return t('budgeting.budget_save.error.source_invalid')
  if (String(target.currency_code ?? '').toUpperCase() !== String(source.currency_code ?? '').toUpperCase()) {
    return t('budgeting.budget_save.error.currency_mismatch')
  }
  return ''
}

function containerBudgetSaveSummary(container) {
  if (!containerBudgetSaveEnabled(container)) return ''
  const target = accountStore.savingsJarAccounts.find((account) => String(account.id) === String(container?.budget_save_target_account_id ?? ''))
  const source = accountStore.regularAccounts.find((account) => String(account.id) === String(container?.budget_save_source_account_id ?? ''))
  return t('budgeting.budget_save.item_summary', {
    source: source?.name || '-',
    target: target?.name || '-',
  })
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

function openItemDetail(item) {
  detailItem.value = item
  isItemDetailOpen.value = true
}

function closeItemDetail() {
  isItemDetailOpen.value = false
  detailItem.value = null
}

function editDetailItem() {
  if (!detailItem.value) return
  const item = detailItem.value
  closeItemDetail()
  openEdit(item)
}

function closeSheet() {
  isSheetOpen.value = false
  editingItem.value = null
}

function openCreateContainer() {
  editingContainer.value = null
  containerForm.name = ''
  containerForm.amountMajor = null
  containerForm.budgetSaveEnabled = false
  containerForm.budgetSaveTargetAccountId = String(accountStore.savingsJarAccounts?.[0]?.id ?? '')
  containerForm.budgetSaveSourceAccountId = ''
  isContainerSheetOpen.value = true
}

function openEditContainer(container) {
  editingContainer.value = container
  containerForm.name = String(container?.name ?? '')
  containerForm.amountMajor = Number(container?.amount_minor ?? 0) / 100
  containerForm.budgetSaveEnabled = Number(container?.budget_save_enabled ?? 0) === 1
  containerForm.budgetSaveTargetAccountId = String(container?.budget_save_target_account_id ?? accountStore.savingsJarAccounts?.[0]?.id ?? '')
  containerForm.budgetSaveSourceAccountId = String(container?.budget_save_source_account_id ?? '')
  isContainerSheetOpen.value = true
}

function closeContainerSheet() {
  isContainerSheetOpen.value = false
  editingContainer.value = null
}

async function saveContainer() {
  if (!String(containerForm.name ?? '').trim()) {
    uiStore.pushToast(t('budgeting.error.container_name_required'), 'error')
    return
  }
  if (containerBudgetSaveInvalidReason.value) return
  try {
    await budgetStore.upsertContainer({
      id: editingContainer.value?.id,
      name: containerForm.name,
      amountMinor: Math.round(Number(containerForm.amountMajor ?? 0) * 100),
      budgetSaveEnabled: containerForm.budgetSaveEnabled,
      budgetSaveTargetAccountId: containerForm.budgetSaveEnabled ? containerForm.budgetSaveTargetAccountId : null,
      budgetSaveSourceAccountId: containerForm.budgetSaveEnabled ? containerForm.budgetSaveSourceAccountId : null,
    })
    uiStore.pushToast(t('budgeting.toast.saved'))
    closeContainerSheet()
  } catch (error) {
    uiStore.pushToast(resolveBudgetErrorMessage(error), 'error')
  }
}

function openContainerDetail(container) {
  detailContainer.value = container
  isContainerDetailOpen.value = true
}

function closeContainerDetail() {
  isContainerDetailOpen.value = false
  detailContainer.value = null
}

function editDetailContainer() {
  if (!detailContainer.value) return
  const container = detailContainer.value
  closeContainerDetail()
  openEditContainer(container)
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
  pendingDeleteContainerId.value = ''
  deleteDialogOpen.value = true
}

function removeContainer(containerId) {
  pendingDeleteContainerId.value = containerId
  pendingDeleteItemId.value = ''
  deleteDialogOpen.value = true
}

function requestRemoveItemFromDetail() {
  const itemId = String(detailItem.value?.id ?? '').trim()
  if (!itemId) return
  closeItemDetail()
  removeItem(itemId)
}

function requestRemoveContainerFromDetail() {
  const containerId = String(detailContainer.value?.id ?? '').trim()
  if (!containerId) return
  closeContainerDetail()
  removeContainer(containerId)
}

function closeDeleteDialog() {
  if (deleteLoading.value) return
  deleteDialogOpen.value = false
  pendingDeleteItemId.value = ''
  pendingDeleteContainerId.value = ''
}

async function confirmRemoveItem() {
  if ((!pendingDeleteItemId.value && !pendingDeleteContainerId.value) || deleteLoading.value) return
  deleteLoading.value = true
  try {
    if (pendingDeleteContainerId.value) {
      await budgetStore.deleteContainer(pendingDeleteContainerId.value)
    } else {
      await budgetStore.deleteItem(pendingDeleteItemId.value)
    }
    uiStore.pushToast(t('budgeting.toast.deleted'))
    deleteDialogOpen.value = false
    pendingDeleteItemId.value = ''
    pendingDeleteContainerId.value = ''
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
    closeTotalBudgetSaveConfig()
  } catch (error) {
    uiStore.pushToast(resolveBudgetErrorMessage(error), 'error')
  } finally {
    totalSaveLoading.value = false
  }
}

function openTotalBudgetSaveDetail() {
  isTotalBudgetSaveDetailOpen.value = true
}

function closeTotalBudgetSaveDetail() {
  isTotalBudgetSaveDetailOpen.value = false
}

function openTotalBudgetSaveConfig() {
  closeTotalBudgetSaveDetail()
  isTotalBudgetSaveConfigOpen.value = true
}

function closeTotalBudgetSaveConfig() {
  if (totalSaveLoading.value) return
  isTotalBudgetSaveConfigOpen.value = false
}
</script>

<style scoped>
.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.page-title {
  font-size: 24px
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
.summary-entry-btn {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
}
.budget-save-head {
  align-items: flex-start;
}
.budget-save-summary,
.budget-save-inline-copy {
  margin: 0;
}
.budget-save-inline-row {
  align-items: center;
  gap: 8px;
}
.budget-save-inline-copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border-radius: 10px;
}
.item-card-btn {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  text-align: left;
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
.detail-sheet-body {
  gap: 12px;
}
.detail-block {
  display: grid;
  gap: 4px;
}
.detail-row-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.detail-budget-save {
  gap: 6px;
}
.detail-budget-save-line {
  align-items: center;
  gap: 8px;
}
.detail-budget-save-copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
