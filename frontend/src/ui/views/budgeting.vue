<template>
  <section class="stack">
    <header class="row">
      <h2 class="page-title">{{ t('budgeting.title') }}</h2>
      <RouterLink class="btn back-btn" to="/">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row">
        <div>
          <h3>{{ budgetPeriodTitle }}</h3>
          <p v-if="isPayCycleMode" class="muted period-copy">
            {{ t('budgeting.period.pay_cycle_range', { start: budgetStore.period?.startDate, end: budgetStore.period?.endDate }) }}
            <span v-if="budgetStore.period?.nextPayDate"> · {{ t('budgeting.period.next_pay_day', { date: budgetStore.period.nextPayDate }) }}</span>
          </p>
        </div>
        <HomeRangePicker
          v-if="!isPayCycleMode"
          mode="month"
          :month="budgetStore.monthKey"
          @update:month="pickMonth"
        />
        <div v-else class="row period-nav">
          <button type="button" class="btn" @click="budgetStore.goPreviousPeriod">{{ t('budgeting.period.previous') }}</button>
          <button type="button" class="btn" @click="budgetStore.loadCurrentPeriod">{{ t('budgeting.period.current') }}</button>
          <button type="button" class="btn" @click="budgetStore.goNextPeriod">{{ t('budgeting.period.next') }}</button>
        </div>
      </header>

      <section class="budget-period-card" data-testid="budget-page-period-settings">
        <div class="period-field-head">
          <span>{{ t('budgeting.period.sheet_title') }}</span>
          <small class="muted">{{ t('settings_ledger_detail.budget_period_mode_hint') }}</small>
        </div>
        <div class="ledger-period-mode-row" role="group" :aria-label="t('budgeting.period.sheet_title')">
          <button
            type="button"
            class="ledger-period-mode-btn"
            :class="{ active: activeLedgerBudgetPeriodMode === 'calendar_month' }"
            data-testid="budget-page-period-calendar"
            :disabled="periodSaving"
            @click="applyBudgetPeriodSettings({ budgetPeriodMode: 'calendar_month', budgetPayDay: activeLedgerBudgetPayDay })"
          >
            {{ t('settings_ledger_detail.budget_period_mode.calendar_month') }}
          </button>
          <button
            type="button"
            class="ledger-period-mode-btn"
            :class="{ active: activeLedgerBudgetPeriodMode === 'pay_cycle' }"
            data-testid="budget-page-period-pay-cycle"
            :disabled="periodSaving"
            @click="applyBudgetPeriodSettings({ budgetPeriodMode: 'pay_cycle', budgetPayDay: activeLedgerBudgetPayDay })"
          >
            {{ t('settings_ledger_detail.budget_period_mode.pay_cycle') }}
          </button>
        </div>
        <label v-if="isPayCycleMode">
          {{ t('settings_ledger_detail.budget_pay_day') }}
          <input
            class="input"
            type="number"
            min="1"
            max="31"
            inputmode="numeric"
            data-testid="budget-page-pay-day"
            :value="activeLedgerBudgetPayDay"
            :disabled="periodSaving"
            @change="onBudgetPagePayDayChange"
          />
          <small class="muted">{{ t('budgeting.period.sheet_pay_day_hint') }}</small>
        </label>
      </section>

      <div class="stack stat" :class="{ 'month-over': budgetStore.isMonthOver }">
        <BudgetProgressBar
          :ratio="monthUsedRatio"
          :over="budgetStore.isMonthOver"
          :percent-label="monthUsedPercentLabel"
          :subtitle="t('budgeting.used')"
          :aria-label="budgetPeriodTitle"
        />
        <div class="stat-grid">
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.budget_total') }}</span>
            <MoneyText :value-minor="budgetStore.totalBudgetMinor" />
          </div>
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.used') }}</span>
            <MoneyText :value-minor="budgetStore.totalSpentMinor" />
          </div>
          <div class="stat-cell" :class="{ 'remain-over': budgetStore.isMonthOver }">
            <span class="muted">{{ t('budgeting.remaining') }}</span>
            <MoneyText :value-minor="budgetStore.remainMinor" />
          </div>
          <div class="stat-cell">
            <span class="muted">{{ t('budgeting.reserved') }}</span>
            <MoneyText :value-minor="budgetStore.reservedMinor" />
          </div>
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
        <button v-if="!isPayCycleMode" class="btn" @click="copyPreviousMonth">{{ t('budgeting.copy_previous') }}</button>
        <button class="btn" @click="openCreateContainer">{{ t('budgeting.container.add') }}</button>
        <button class="btn primary" @click="openCreate">{{ t('budgeting.add_item') }}</button>
      </div>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('budgeting.items_by_category') }}</h3>
        <span class="badge">{{ t('budgeting.items_count', { count: budgetStore.items.length }) }}</span>
      </header>

      <div class="grouped-list">
        <section
          v-for="section in budgetStore.groupedBudgetSections"
          :key="section.type === 'container' ? section.container.id : 'unassigned'"
          class="budget-section"
        >
          <header v-if="section.type === 'container'" class="container-head">
            <button type="button" class="container-toggle" @click="toggleContainerExpanded(section.container.id)">
              <div class="container-title-row">
                <strong>{{ section.container.name }}</strong>
                <span class="budget-save-chip" v-if="containerBudgetSaveEnabled(section.container)">
                  {{ t('budgeting.budget_save.mode.monthly') }}
                </span>
                <span class="budget-save-chip pool-period-chip">
                  {{ containerPeriodLabel(section.container) }}
                </span>
              </div>
              <BudgetProgressBar
                class="container-progress"
                :ratio="containerUsedRatio(section.container)"
                :over="section.container.isOver"
                :percent-label="containerUsedPercentLabel(section.container)"
                :subtitle="t('budgeting.used')"
                :aria-label="section.container.name"
              />
              <div class="container-stats">
                <div class="stat-cell">
                  <span class="muted">{{ t('budgeting.container.today_allowance') }}</span>
                  <MoneyText :value-minor="section.container.todayAllowanceMinor ?? section.container.budgetMinor" />
                </div>
                <div class="stat-cell">
                  <span class="muted">{{ t('budgeting.used') }}</span>
                  <MoneyText :value-minor="section.container.spentMinor" />
                </div>
                <div class="stat-cell" :class="{ 'remain-over': section.container.isOver }">
                  <span class="muted">{{ t('budgeting.remaining') }}</span>
                  <MoneyText :value-minor="section.container.remainMinor" />
                </div>
              </div>
              <div class="container-stats container-stats-period">
                <div class="stat-cell">
                  <span class="muted">{{ containerBudgetLabel(section.container) }}</span>
                  <MoneyText :value-minor="section.container.periodBudgetMinor ?? section.container.amount_minor" />
                </div>
                <div class="stat-cell">
                  <span class="muted">{{ t('budgeting.container.period_spent') }}</span>
                  <MoneyText :value-minor="section.container.periodSpentMinor ?? 0" />
                </div>
                <div class="stat-cell" :class="{ 'remain-over': section.container.isPeriodOver }">
                  <span class="muted">{{ t('budgeting.container.period_remaining') }}</span>
                  <MoneyText :value-minor="section.container.periodRemainMinor ?? 0" />
                </div>
              </div>
            </button>
            <div class="container-actions">
              <button type="button" class="btn" @click="openContainerDetail(section.container)">{{ t('budgeting.container.view') }}</button>
            </div>
          </header>

          <h4 v-else class="unassigned-title">{{ t('budgeting.container.unassigned_title') }}</h4>

          <ul v-show="section.type !== 'container' || isContainerExpanded(section.container.id)" class="list">
            <li v-for="item in section.items" :key="item.id" class="item-row">
              <button
                type="button"
                class="item-card-btn"
                :class="{ 'item-over': isItemOverBudget(item) }"
                @click="openItemDetail(item)"
              >
                <div class="item-header row">
                  <span class="item-category">{{ categoryName(item.category_id) }}</span>
                  <span v-if="isDailyPoolChild(item)" class="pool-child-label muted">
                    {{ t('budgeting.container.daily_pool_child_label') }}
                  </span>
                  <MoneyText
                    v-else
                    class="item-budget-amount"
                    :value-minor="itemBudgetMinor(item)"
                  />
                </div>

                <BudgetProgressBar
                  v-if="!isDailyPoolChild(item)"
                  class="item-progress"
                  :ratio="itemUsedRatio(item)"
                  :over="isItemOverBudget(item)"
                  :percent-label="itemUsedPercentLabel(item)"
                  :subtitle="t('budgeting.used')"
                  :aria-label="categoryName(item.category_id)"
                />
                <p v-else class="muted pool-child-spent">
                  {{ t('budgeting.used') }} {{ formatMajor(itemSpentMinorForItem(item)) }}
                </p>

                <small v-if="isDailyAverageItem(item)" class="muted item-rule-hint">{{ itemDailyRuleSummary(item) }}</small>
                <div v-if="itemBudgetSaveEnabled(item)" class="row budget-save-inline-row">
                  <span class="budget-save-chip" :class="{ invalid: Boolean(itemBudgetSaveIssue(item)) }">
                    {{ itemBudgetSaveModeLabel(item) }}
                  </span>
                  <small class="muted budget-save-inline-copy">{{ itemBudgetSaveSummary(item) }}</small>
                </div>
                <p v-if="itemBudgetSaveIssue(item)" class="error-text">{{ itemBudgetSaveIssue(item) }}</p>

                <div class="item-footer">
                  <div v-if="!isDailyPoolChild(item)" class="footer-stat remain-line">
                    <small class="budget-label">{{ t('budgeting.remaining') }}</small>
                    <strong class="budget-value">{{ formatMajor(itemRemainMinor(item)) }}</strong>
                  </div>
                  <div class="footer-stat used-line">
                    <small class="budget-label">{{ t('budgeting.used') }}</small>
                    <strong class="budget-value">{{ formatMajor(itemSpentMinorForItem(item)) }}</strong>
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </section>

        <p v-if="budgetStore.items.length === 0 && budgetStore.containers.length === 0" class="muted empty-copy">
          {{ t('budgeting.empty') }}
        </p>
      </div>
    </article>

    <InputBottomSheet
      :open="isItemDetailOpen"
      :title="detailItem ? categoryName(detailItem.category_id) : t('budgeting.items_by_category')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeItemDetail"
    >
      <template v-if="detailItem">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.sheet.category') }}</small>
          <strong>{{ categoryName(detailItem.category_id) }}</strong>
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
      :account-groups="accountStore.groups"
      :savings-jar-accounts="accountStore.savingsJarAccounts"
      :regular-accounts="accountStore.regularAccounts"
      :duplicate-category-ids="duplicateBudgetSaveCategoryIds"
      :containers="budgetStore.containers"
      :container-budget-save-enabled-ids="containerBudgetSaveEnabledIds"
      :ledger-budget-period-mode="activeLedgerBudgetPeriodMode"
      :ledger-budget-pay-day="activeLedgerBudgetPayDay"
      @close="closeSheet"
      @save="saveItem"
    />

    <BudgetContainerSheet
      :open="isContainerSheetOpen"
      :container="editingContainer"
      :budget-month="budgetStore.monthKey"
      :child-items="containerSheetChildItems"
      :categories="categoryStore.expenseCategories"
      :category-groups="categoryStore.expenseCategoryGroups"
      :account-groups="accountStore.groups"
      :savings-jar-accounts="accountStore.savingsJarAccounts"
      :regular-accounts="accountStore.regularAccounts"
      :has-child-budget-save="containerSheetHasChildBudgetSave"
      :ledger-budget-period-mode="activeLedgerBudgetPeriodMode"
      :ledger-budget-pay-day="activeLedgerBudgetPayDay"
      @close="closeContainerSheet"
      @save="saveContainer"
    />

    <InputBottomSheet
      :open="isContainerDetailOpen"
      :title="detailContainer ? detailContainer.name : t('budgeting.container.title')"
      :body-class="'stack detail-sheet-body'"
      :show-footer="true"
      :close-text="t('budgeting.sheet.close')"
      @close="closeContainerDetail"
    >
      <template v-if="detailContainer">
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.container.amount') }}</small>
          <strong>{{ formatMajor(detailContainer.amount_minor) }}</strong>
        </div>
        <div class="detail-row-grid">
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.used') }}</small>
            <strong>{{ formatMajor(detailContainerStats?.spentMinor ?? 0) }}</strong>
          </div>
          <div class="detail-block">
            <small class="muted">{{ t('budgeting.remaining') }}</small>
            <strong>{{ formatMajor(detailContainerStats?.remainMinor ?? 0) }}</strong>
          </div>
        </div>
        <div class="detail-block">
          <small class="muted">{{ t('budgeting.budget_save.title') }}</small>
          <strong>{{ containerBudgetSaveEnabled(detailContainer) ? t('budgeting.budget_save.enabled') : t('budgeting.budget_save.disabled') }}</strong>
        </div>
      </template>

      <template #footer>
        <button class="btn" @click="requestDeleteContainerFromDetail">{{ t('budgeting.delete') }}</button>
        <button class="btn primary" @click="editContainerFromDetail">{{ t('budgeting.edit') }}</button>
      </template>
    </InputBottomSheet>

    <AppDialog
      :open="deleteContainerDialogOpen"
      :title="t('budgeting.container.delete_title')"
      :message="t('budgeting.container.confirm_delete')"
      :cancel-text="t('common.cancel')"
      :confirm-text="t('budgeting.delete')"
      :loading="deleteContainerLoading"
      @close="closeDeleteContainerDialog"
      @confirm="confirmDeleteContainer"
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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetItemSheet from '@/ui/components/budget/BudgetItemSheet.vue'
import BudgetContainerSheet from '@/ui/components/budget/BudgetContainerSheet.vue'
import BudgetProgressBar from '@/ui/components/budget/BudgetProgressBar.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import InputBottomSheet from '@/ui/components/common/InputBottomSheet.vue'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { buildAccountOptionGroups } from '@/ui/utils/account-option-groups'
import { isDailyPoolChildItem } from '@/core/services/budget.service'
import { APP_BUDGET_PERIOD_SYNC_EVENT } from '@/ui/composables/useHomePeriodFilter'

const budgetStore = useBudgetStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const uiStore = useUiStore()
const ledgerStore = useLedgerStore()
const { t, locale } = useI18n()

const isSheetOpen = ref(false)
const editingItem = ref(null)
const isContainerSheetOpen = ref(false)
const editingContainer = ref(null)
const detailContainer = ref(null)
const isContainerDetailOpen = ref(false)
const deleteContainerDialogOpen = ref(false)
const deleteContainerLoading = ref(false)
const pendingDeleteContainerId = ref('')
const expandedContainerIds = ref(new Set())
const detailItem = ref(null)
const isItemDetailOpen = ref(false)
const deleteDialogOpen = ref(false)
const deleteLoading = ref(false)
const periodSaving = ref(false)
const pendingDeleteItemId = ref('')
const totalSaveLoading = ref(false)
const isTotalBudgetSaveDetailOpen = ref(false)
const isTotalBudgetSaveConfigOpen = ref(false)
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
  'budgeting.budget_save.error.parent_conflict',
  'budgeting.budget_save.error.group_conflict',
  'budgeting.budget_item.error.conflict_range',
  'budgeting.container.error.name_required',
  'budgeting.container.error.not_found',
  'budgeting.container.error.not_found_range',
  'budgeting.container.error.invalid_month_range',
  'budgeting.container.error.name_conflict',
  'budgeting.container.error.name_conflict_range',
])
const retroactiveModeOptions = computed(() => ([
  { value: 'manual', label: t('budgeting.budget_save.retroactive.manual') },
  { value: 'delta', label: t('budgeting.budget_save.retroactive.delta') },
]))
const isPayCycleMode = computed(() => String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle')
const activeLedgerBudgetPeriodMode = computed(() => (
  String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle'
    ? 'pay_cycle'
    : 'calendar_month'
))
const activeLedgerBudgetPayDay = computed(() => clampPayDay(ledgerStore.activeLedger?.budget_pay_day))
const budgetPeriodTitle = computed(() => (
  isPayCycleMode.value ? t('budgeting.period.pay_cycle_budget') : t('budgeting.monthly_budget')
))

const containerBudgetSaveEnabledIds = computed(() => (
  budgetStore.containers
    .filter((container) => Number(container?.budget_save_enabled ?? 0) === 1)
    .map((container) => container.id)
))

const containerSheetHasChildBudgetSave = computed(() => {
  const containerId = String(editingContainer.value?.id ?? '').trim()
  if (!containerId) return false
  return budgetStore.items.some(
    (item) => String(item?.budget_container_id ?? '') === containerId
      && Number(item?.budget_save_enabled ?? 0) === 1,
  )
})

const containerSheetChildItems = computed(() => {
  const containerId = String(editingContainer.value?.id ?? '').trim()
  if (!containerId) return []
  return budgetStore.items.filter(
    (item) => String(item?.budget_container_id ?? '') === containerId,
  )
})

const detailContainerStats = computed(() => {
  const containerId = String(detailContainer.value?.id ?? '').trim()
  if (!containerId) return null
  return budgetStore.containersWithStats.find((entry) => String(entry.id) === containerId) ?? null
})

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
  detailItem.value ? formatMajor(itemSpentMinorForItem(detailItem.value)) : '-'
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
  () => budgetStore.containers.map((container) => container.id),
  (containerIds) => {
    const next = new Set(expandedContainerIds.value)
    for (const containerId of containerIds) {
      next.add(String(containerId))
    }
    expandedContainerIds.value = next
  },
  { immediate: true },
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

function refreshCurrentBudgetPeriod() {
  void budgetStore.loadCurrentPeriod()
}

onMounted(() => {
  refreshCurrentBudgetPeriod()
  if (typeof window === 'undefined') return
  window.addEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, refreshCurrentBudgetPeriod)
})

onUnmounted(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener(APP_BUDGET_PERIOD_SYNC_EVENT, refreshCurrentBudgetPeriod)
})

function pickMonth(monthKey) {
  if (!monthKey || monthKey === budgetStore.monthKey) return
  budgetStore.loadMonth(monthKey)
}

function categoryName(categoryId) {
  return categoryStore.categories.find((category) => category.id === categoryId)?.name ?? t('budgeting.deleted_category')
}

function itemSpentMinor(categoryId) {
  const spentMinor = Number(budgetStore.spentMap[categoryId] ?? 0)
  return Number.isFinite(spentMinor) ? spentMinor : 0
}

function itemTodaySpentMinor(categoryId) {
  const spentMinor = Number(budgetStore.todaySpentMap[categoryId] ?? 0)
  return Number.isFinite(spentMinor) ? spentMinor : 0
}

function isDailyPoolChild(item) {
  return isDailyPoolChildItem(item, budgetStore.containers)
}

function itemSpentMinorForItem(item) {
  return isDailyPoolChild(item)
    ? itemTodaySpentMinor(item?.category_id)
    : itemSpentMinor(item?.category_id)
}

function itemBudgetMinor(item) {
  if (isDailyPoolChild(item)) return 0
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
  if (isDailyPoolChild(item)) return 0
  return itemBudgetMinor(item) - itemSpentMinor(item?.category_id)
}

function itemUsedRatio(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) return 0
  const ratio = itemSpentMinor(item.category_id) / budgetMinor
  return Number.isFinite(ratio) ? ratio : 0
}

function itemUsedPercentLabel(item) {
  const budgetMinor = itemBudgetMinor(item)
  if (!budgetMinor) return '0%'
  const ratio = itemSpentMinor(item.category_id) / budgetMinor
  return `${Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)}%`
}

const monthUsedRatio = computed(() => {
  const budgetMinor = Number(budgetStore.totalBudgetMinor ?? 0)
  if (!Number.isFinite(budgetMinor) || budgetMinor <= 0) return 0
  const ratio = Number(budgetStore.totalSpentMinor ?? 0) / budgetMinor
  return Number.isFinite(ratio) ? ratio : 0
})

const monthUsedPercentLabel = computed(() => `${Math.round(monthUsedRatio.value * 100)}%`)

function isItemOverBudget(item) {
  return budgetStore.isItemOver(item)
}

function containerBudgetSaveEnabled(container) {
  return Number(container?.budget_save_enabled ?? 0) === 1
}

function containerPeriodLabel(container) {
  return String(container?.period_mode ?? container?.periodMode ?? '').trim() === 'daily'
    ? t('budgeting.container.period_mode.daily')
    : t('budgeting.container.period_mode.monthly')
}

function containerBudgetLabel(container) {
  return String(container?.period_mode ?? container?.periodMode ?? '').trim() === 'daily'
    ? t('budgeting.container.amount_daily')
    : t('budgeting.budget_total')
}

function containerUsedRatio(container) {
  const amountMinor = Number(container?.budgetMinor ?? container?.amount_minor ?? 0)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0
  const ratio = Number(container?.spentMinor ?? 0) / amountMinor
  return Number.isFinite(ratio) ? ratio : 0
}

function containerUsedPercentLabel(container) {
  return `${Math.round(containerUsedRatio(container) * 100)}%`
}

function isContainerExpanded(containerId) {
  return expandedContainerIds.value.has(String(containerId))
}

function toggleContainerExpanded(containerId) {
  const key = String(containerId)
  const next = new Set(expandedContainerIds.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedContainerIds.value = next
}

function openCreateContainer() {
  editingContainer.value = null
  isContainerSheetOpen.value = true
}

function openContainerDetail(container) {
  detailContainer.value = container
  isContainerDetailOpen.value = true
}

function closeContainerDetail() {
  isContainerDetailOpen.value = false
  detailContainer.value = null
}

function editContainerFromDetail() {
  if (!detailContainer.value) return
  const container = detailContainer.value
  closeContainerDetail()
  editingContainer.value = container
  isContainerSheetOpen.value = true
}

function closeContainerSheet() {
  isContainerSheetOpen.value = false
  editingContainer.value = null
}

async function saveContainer(payload) {
  const { ledgerBudgetPeriodSettings, ...containerPayload } = payload ?? {}
  try {
    if (shouldApplyBudgetPeriodSettings(ledgerBudgetPeriodSettings) && !containerPayload.id) {
      await applyBudgetPeriodSettings(ledgerBudgetPeriodSettings)
      await budgetStore.upsertContainer(containerPayload)
    } else {
      await budgetStore.upsertContainer(containerPayload)
      if (shouldApplyBudgetPeriodSettings(ledgerBudgetPeriodSettings)) {
        await applyBudgetPeriodSettings(ledgerBudgetPeriodSettings)
      }
    }
    uiStore.pushToast(t('budgeting.container.toast.saved'))
    closeContainerSheet()
  } catch (error) {
    uiStore.pushToast(resolveBudgetErrorMessage(error), 'error')
  }
}

function requestDeleteContainerFromDetail() {
  const containerId = String(detailContainer.value?.id ?? '').trim()
  if (!containerId) return
  closeContainerDetail()
  pendingDeleteContainerId.value = containerId
  deleteContainerDialogOpen.value = true
}

function closeDeleteContainerDialog() {
  if (deleteContainerLoading.value) return
  deleteContainerDialogOpen.value = false
  pendingDeleteContainerId.value = ''
}

async function confirmDeleteContainer() {
  if (!pendingDeleteContainerId.value || deleteContainerLoading.value) return
  deleteContainerLoading.value = true
  try {
    await budgetStore.deleteContainer(pendingDeleteContainerId.value)
    uiStore.pushToast(t('budgeting.container.toast.deleted'))
    deleteContainerDialogOpen.value = false
    pendingDeleteContainerId.value = ''
  } catch (error) {
    uiStore.pushToast(error.message ?? t('budgeting.toast.delete_failed'), 'error')
  } finally {
    deleteContainerLoading.value = false
  }
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
  return resolveIntlLocale(locale.value)
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
  if (key === 'budgeting.container.error.name_conflict_range') {
    const months = Array.isArray(error?.monthKeys) ? error.monthKeys.join(', ') : ''
    return t(key, { months })
  }
  if (key === 'budgeting.budget_item.error.conflict_range' || key === 'budgeting.container.error.not_found_range') {
    const months = Array.isArray(error?.monthKeys) ? error.monthKeys.join(', ') : ''
    return t(key, { months })
  }
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

async function saveItem(payload) {
  const { ledgerBudgetPeriodSettings, ...itemPayload } = payload ?? {}
  try {
    if (shouldApplyBudgetPeriodSettings(ledgerBudgetPeriodSettings) && !itemPayload.id) {
      await applyBudgetPeriodSettings(ledgerBudgetPeriodSettings)
      await budgetStore.upsertItem(itemPayload)
    } else {
      await budgetStore.upsertItem(itemPayload)
      if (shouldApplyBudgetPeriodSettings(ledgerBudgetPeriodSettings)) {
        await applyBudgetPeriodSettings(ledgerBudgetPeriodSettings)
      }
    }
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

function requestRemoveItemFromDetail() {
  const itemId = String(detailItem.value?.id ?? '').trim()
  if (!itemId) return
  closeItemDetail()
  removeItem(itemId)
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

function clampPayDay(value) {
  const day = Math.trunc(Number(value))
  if (!Number.isFinite(day)) return 1
  return Math.min(31, Math.max(1, day))
}

function normalizeBudgetPeriodSettings(settings = {}) {
  return {
    budgetPeriodMode: String(settings?.budgetPeriodMode ?? '') === 'pay_cycle' ? 'pay_cycle' : 'calendar_month',
    budgetPayDay: clampPayDay(settings?.budgetPayDay),
  }
}

function shouldApplyBudgetPeriodSettings(settings = {}) {
  if (!settings) return false
  const next = normalizeBudgetPeriodSettings(settings)
  return next.budgetPeriodMode !== activeLedgerBudgetPeriodMode.value
    || next.budgetPayDay !== activeLedgerBudgetPayDay.value
}

async function applyBudgetPeriodSettings(settings = {}) {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId || periodSaving.value) return
  if (!shouldApplyBudgetPeriodSettings(settings)) return
  const next = normalizeBudgetPeriodSettings(settings)
  periodSaving.value = true
  try {
    await ledgerStore.updateBudgetPeriodSettings(ledgerId, next)
    await budgetStore.loadCurrentPeriod()
  } finally {
    periodSaving.value = false
  }
}

function onBudgetPagePayDayChange(event) {
  const nextPayDay = clampPayDay(event?.target?.value)
  void applyBudgetPeriodSettings({
    budgetPeriodMode: 'pay_cycle',
    budgetPayDay: nextPayDay,
  })
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
  margin-top: 10px;
  gap: 12px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.stat-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.stat-cell .muted {
  font-size: 11px;
}
.stat-cell.remain-over,
.stat.month-over .remain-over {
  color: var(--danger, #d14343);
}
.container-progress {
  margin-top: 4px;
}
.grouped-list {
  margin-top: 12px;
  display: grid;
  gap: 14px;
}
.budget-section {
  display: grid;
  gap: 8px;
}
.container-head {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 94%, var(--surface-soft-accent) 6%);
}
.container-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 0;
}
.container-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.container-summary-line {
  display: grid;
  gap: 10px;
}
.container-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.container-stats-period {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--field-border) 70%, transparent);
}
.container-actions {
  display: flex;
  justify-content: flex-end;
}
.unassigned-title {
  margin: 0;
  font-size: 14px;
}
.empty-copy {
  margin: 0;
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
  border-radius: 12px;
}
.item-card-btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--card) 96%, var(--surface-soft-accent) 4%);
  color: inherit;
  text-align: left;
  display: grid;
  gap: 8px;
  transition: border-color var(--anim-fast) var(--anim-standard), background-color var(--anim-fast) var(--anim-standard);
}
.item-card-btn.item-over {
  border-color: color-mix(in srgb, var(--danger, #d14343) 34%, var(--border) 66%);
  background: color-mix(in srgb, var(--danger, #d14343) 5%, var(--card) 95%);
}
.item-header {
  align-items: baseline;
  gap: 8px;
}
.item-category {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-budget-amount {
  flex: 0 0 auto;
  font-weight: 700;
}
.item-progress {
  width: 100%;
}
.item-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.footer-stat {
  display: grid;
  gap: 2px;
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
.budget-label,
.budget-value {
  font-size: 12px;
  line-height: 1.2;
}
.budget-value {
  font-weight: 700;
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
.budget-period-card {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}
.period-field-head {
  display: grid;
  gap: 4px;
}
.ledger-period-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ledger-period-mode-btn {
  border: 1px solid var(--field-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.ledger-period-mode-btn.active {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--field-border) 54%);
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
  color: var(--primary);
}
.period-copy {
  margin: 4px 0 0;
  font-size: 12px;
}
.period-nav {
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
</style>
