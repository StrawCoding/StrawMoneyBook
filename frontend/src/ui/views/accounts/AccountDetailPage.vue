<template>
  <HabitatPageShell
    :title="t('account.detail_title')"
    :kicker="t('assets_page.habitat_hello')"
    test-id="account-detail-view"
    back-to="/assets"
  >

    <article class="card panel">
      <header class="row">
        <h3 class="account-title">
          <font-awesome-icon v-if="editIcon" :icon="editIcon" class="account-icon" />
          <span>{{ accountName }}</span>
        </h3>
        <button v-if="isEditMode" class="btn primary" :disabled="!canSave || saving" @click="saveProfile">
          {{ saving ? t('settings_ledger_detail.saving') : t('settings_ledger_detail.save_changes') }}
        </button>
      </header>

      <template v-if="isEditMode">
        <label class="field">
          {{ t('common.account_name') }}
          <input v-model="editName" class="input" type="text" maxlength="40" :placeholder="t('common.please_enter_account_name')" />
        </label>

        <div class="field">
          <span>{{ t('common.account_icon') }}</span>
          <button class="icon-picker-btn" type="button" @click.stop.prevent="openIconPicker">
            <font-awesome-icon :icon="editIcon || defaultAccountIcon" />
            <span>{{ t('common.choose_icon') }}</span>
          </button>
        </div>

        <label v-if="!isCreditAccount" class="field">
          {{ t('common.belonging_group') }}
          <CustomSelect v-model="editGroupId" :options="groupOptions" :placeholder="t('common.select_group')" />
        </label>
        <p v-else class="muted">{{ t('account.credit_no_group_hint') }}</p>

        <label class="field">
          {{ t('common.account_type') }}
          <CustomSelect v-model="editAccountKind" :options="accountKindOptions" :placeholder="t('common.please_select_type')" />
        </label>

        <label class="field">
          {{ t('welcome.account_currency') }}
          <CustomSelect v-model="editCurrencyCode" :options="currencyOptions" :placeholder="t('common.please_select_currency')" />
        </label>

        <label v-if="editAccountKind === 'cash'" class="field">
          {{ t('account.opening_amount') }}
          <input v-model="editOpening" class="input" type="number" step="0.01" />
        </label>
        <label v-else class="field">
          {{ t('account.current_debt') }}
          <input v-model="editCurrentDebt" class="input" type="number" min="0" step="0.01" />
        </label>
        <label v-if="editAccountKind === 'credit'" class="field">
          {{ t('account.credit_limit') }}
          <input v-model="editCreditLimit" class="input" type="number" min="0" step="0.01" />
        </label>
        <label v-if="editAccountKind === 'credit'" class="field">
          {{ t('account.repay_day') }}
          <input v-model="editRepaymentReminderDay" class="input" type="number" min="1" max="31" step="1" :placeholder="t('common.example_15')" />
        </label>
        <label v-if="editAccountKind === 'credit'" class="field">
          {{ t('credit_cards_page.close_day') }}（1-31）
          <input v-model="editStatementCloseDay" class="input" type="number" min="1" max="31" step="1" :placeholder="t('common.example_25')" />
        </label>
        <label v-if="editAccountKind === 'credit'" class="field">
          {{ t('credit_cards_page.due_day') }}（1-31）
          <input v-model="editPaymentDueDay" class="input" type="number" min="1" max="31" step="1" :placeholder="t('common.example_15')" />
        </label>
        <div class="field">
          <span>{{ t('account.include_in_assets_label') }}</span>
          <button
            type="button"
            class="switch-row"
            :class="{ active: editIncludeInAssets }"
            role="switch"
            :aria-checked="editIncludeInAssets ? 'true' : 'false'"
            @click="editIncludeInAssets = !editIncludeInAssets"
          >
            <span class="switch-copy">
              <strong>{{ editIncludeInAssets ? t('account.include_in_assets_on') : t('account.include_in_assets_off') }}</strong>
              <small class="muted">{{ t('account.include_in_assets_hint') }}</small>
            </span>
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </button>
        </div>
        <div v-if="!isCreditAccount" class="field">
          <span>{{ t('account.include_in_group_statistics_label') }}</span>
          <button
            type="button"
            class="switch-row"
            :class="{ active: editIncludeInGroupStatistics }"
            role="switch"
            :aria-checked="editIncludeInGroupStatistics ? 'true' : 'false'"
            @click="editIncludeInGroupStatistics = !editIncludeInGroupStatistics"
          >
            <span class="switch-copy">
              <strong>{{ editIncludeInGroupStatistics ? t('account.include_in_group_statistics_on') : t('account.include_in_group_statistics_off') }}</strong>
              <small class="muted">{{ t('account.include_in_group_statistics_hint') }}</small>
            </span>
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </button>
        </div>
        <p v-if="openingInvalid" class="error-text">{{ editAccountKind === 'credit' ? t('common.current_debt_invalid') : t('account.opening_invalid') }}</p>
        <p v-if="creditLimitInvalid" class="error-text">{{ t('common.credit_limit_invalid') }}</p>
        <p v-if="repaymentReminderDayInvalid" class="error-text">{{ t('common.repay_day_range') }}</p>
        <div class="row action-row">
          <button class="btn danger" :disabled="deleting" @click="removeAccountRecord">
            {{ deleting ? t('common.processing') : t('account.delete_archive') }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="detail-grid">
          <div class="detail-row">
            <small class="muted">{{ t('common.belonging_group') }}</small>
            <span>{{ accountGroupName }}</span>
          </div>
          <div class="detail-row">
            <small class="muted">{{ t('common.account_type') }}</small>
            <span>{{ accountKindLabel }}</span>
          </div>
          <div class="detail-row">
            <small class="muted">{{ t('welcome.account_currency') }}</small>
            <span class="currency-with-flag">
              <span v-if="accountCurrencyDisplay.flag" class="currency-flag" aria-hidden="true">{{ accountCurrencyDisplay.flag }}</span>
              <span>{{ accountCurrencyDisplay.label }}</span>
            </span>
          </div>
          <div v-if="isCreditAccount" class="detail-row">
            <small class="muted">{{ t('account.current_debt_label') }}</small>
            <MoneyText :value-minor="currentCreditDebtMinor" :currency="accountCurrencyCode" />
          </div>
          <div v-if="isCreditAccount" class="detail-row">
            <small class="muted">{{ t('credit_cards_page.limit') }}</small>
            <MoneyText :value-minor="accountCreditLimitMinor" :currency="accountCurrencyCode" />
          </div>
          <div v-if="isCreditAccount" class="detail-row">
            <small class="muted">{{ t('account.available_credit') }}</small>
            <MoneyText :value-minor="availableCreditMinor" :currency="accountCurrencyCode" />
          </div>
          <div v-if="isCreditAccount" class="detail-row">
            <small class="muted">{{ t('account.repay_day_label') }}</small>
            <span>{{ repaymentReminderDayLabel }}</span>
          </div>
          <div v-if="isCreditAccount" class="detail-row" data-testid="account-credit-close-day">
            <small class="muted">{{ t('credit_cards_page.close_day') }}</small>
            <span>{{ accountCloseDayLabel }}</span>
          </div>
          <div v-if="isCreditAccount" class="detail-row" data-testid="account-credit-due-day">
            <small class="muted">{{ t('credit_cards_page.due_day') }}</small>
            <span>{{ accountDueDayLabel }}</span>
          </div>
          <div v-if="isCreditAccount" class="detail-row">
            <RouterLink class="btn" to="/credit-cards" data-testid="account-credit-module-link">
              {{ t('credit_cards_page.open_module') }}
            </RouterLink>
          </div>
          <div class="detail-row">
            <small class="muted">{{ t('account.include_in_assets_label') }}</small>
            <span>{{ accountIncludeInAssetsLabel }}</span>
          </div>
          <div v-if="!isCreditAccount" class="detail-row">
            <small class="muted">{{ t('account.include_in_group_statistics_label') }}</small>
            <span>{{ accountIncludeInGroupStatisticsLabel }}</span>
          </div>
        </div>
      </template>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>{{ t('home_tx.title') }}</h3>
        <button class="btn" :disabled="refreshing" @click="refreshTransactions">{{ t('common.refresh') }}</button>
      </header>
      <p class="muted">{{ t('account.tx_page_status', { total: accountTransactionTotal, page: accountTransactionPage, pages: accountTransactionTotalPages }) }}</p>
      <ul class="tx-list">
        <li v-for="group in groupedAccountTransactions" :key="group.dateKey" class="tx-date-group">
          <div class="tx-date-head">
            <span>{{ group.label }}</span>
            <span class="tx-date-total">
              <small>{{ t('home_tx.date_income_short') }} <MoneyText :value-minor="group.incomeMinor" :currency="accountCurrencyCode" tone="income" /></small>
              <small>{{ t('home_tx.date_expense_short') }} <MoneyText :value-minor="group.expenseMinor" :currency="accountCurrencyCode" tone="expense" /></small>
            </span>
          </div>
          <ul class="tx-day-list">
            <li
              v-for="tx in group.items"
              :key="tx.id"
              class="tx-item"
              role="button"
              tabindex="0"
              @click="openEdit(tx)"
              @keydown.enter.prevent="openEdit(tx)"
            >
              <div class="tx-icon-col">
                <font-awesome-icon v-if="categoryIconOfTransaction(tx)" :icon="categoryIconOfTransaction(tx)" class="tx-icon" />
              </div>
              <div class="tx-main">
              <div class="tx-type">{{ labelOfTransaction(tx) }}</div>
              <div class="tx-meta-row">
                  <small class="muted">{{ timeNoteText(tx) }}</small>
              </div>
            </div>
              <div class="tx-side">
                <MoneyText :value-minor="tx.amount_minor" :currency="tx.account_currency_code" :tone="tx.type" />
                <small class="tx-balance">
                  {{ t('settings_bank_sync.review.balance') }} <MoneyText :value-minor="tx.balanceAfterMinor" :currency="accountCurrencyCode" />
                </small>
                <small
                  v-if="showAddonDeltaTag(tx)"
                  class="addon-delta"
                  :class="{ plus: addonDeltaMajor(tx.note) > 0, minus: addonDeltaMajor(tx.note) < 0 }"
                >
                  {{ addonDeltaTag(tx.note) }}
                </small>
              </div>
            </li>
          </ul>
        </li>
        <li v-if="groupedAccountTransactions.length === 0" class="muted">{{ t('savings_jar.activity.empty') }}</li>
      </ul>

      <nav v-if="accountTransactionTotal > 0" class="pagination-bar" :aria-label="t('account.tx_pagination')">
        <button class="btn" :disabled="!canGoPreviousAccountTransactionPage" @click="goPreviousAccountTransactionPage">{{ t('common.previous_page') }}</button>
        <span class="muted page-status">
          {{ t('common.page_range', { start: accountTransactionPageStart, end: accountTransactionPageEnd, total: accountTransactionTotal }) }}
        </span>
        <button class="btn" :disabled="!canGoNextAccountTransactionPage" @click="goNextAccountTransactionPage">{{ t('common.next_page') }}</button>
      </nav>

    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      :title="t('common.confirm_delete_archive')"
      :message="t('account.confirm_delete_name', { name: account?.name ?? '' })"
      :confirm-text="t('common.confirm_delete')"
      :loading="deleting"
      :loading-text="t('common.processing')"
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveAccountRecord"
    />
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n, resolveIntlLocale } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listTransactionPageForAccount } from '@/core/services/transaction-query.service'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { addonDeltaMajorFromNote, addonDeltaTagText } from '@/ui/utils/addon-note'
import { defaultAccountIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { currencyOptions, getCurrencyOption, normalizeCurrencyCode } from '@/ui/constants/currency-options'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const loanStore = useLoanStore()
const uiStore = useUiStore()

const transactions = ref([])
const accountTransactionTotal = ref(0)
const accountTransactionPage = ref(1)
const accountTransactionTotalPages = ref(1)
const accountTransactionBeforeAmountMinor = ref(0)
const refreshing = ref(false)
const saving = ref(false)
const iconSaving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)
const editName = ref('')
const editGroupId = ref('')
const editIcon = ref(defaultAccountIcon)
const editCurrencyCode = ref('TWD')
const editOpening = ref('0')
const editAccountKind = ref('cash')
const editCurrentDebt = ref('0')
const editCreditLimit = ref('0')
const editRepaymentReminderDay = ref('')
const editStatementCloseDay = ref('')
const editPaymentDueDay = ref('')
const editIncludeInAssets = ref(true)
const editIncludeInGroupStatistics = ref(true)
const initializedAccountId = ref('')

const accountId = computed(() => String(route.params.id ?? ''))
const account = computed(() => accountStore.accounts.find((item) => item.id === accountId.value) ?? null)
const isEditMode = computed(() => queryText(route.query.mode) === 'edit')
const backLink = computed(() => (isEditMode.value ? '/assets/accounts' : '/assets'))

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

const accountName = computed(() => account.value?.name || t('common.account'))
const accountCurrencyCode = computed(() => normalizeCurrencyCode(account.value?.currency_code, 'TWD'))
const accountCurrencyDisplay = computed(() => getCurrencyOption(accountCurrencyCode.value) ?? {
  value: accountCurrencyCode.value,
  label: accountCurrencyCode.value,
  flag: '',
})
const accountGroupName = computed(() => {
  const groupId = account.value?.group_id
  if (!groupId) return '-'
  return accountStore.groups.find((item) => item.id === groupId)?.name ?? '-'
})
const currentAccountBalanceMinor = computed(() => {
  const matched = accountStore.balances.find((item) => item.id === accountId.value)
  if (matched) return Number(matched.balance_minor ?? 0)
  return Number(account.value?.opening_balance_minor ?? 0)
})
const accountIncludeInAssetsLabel = computed(() => {
  return isAccountIncludedInAssets(account.value) ? t('account.include_in_assets_on') : t('account.include_in_assets_off')
})
const accountIncludeInGroupStatisticsLabel = computed(() => (
  isAccountIncludedInGroupStatistics(account.value)
    ? t('account.include_in_group_statistics_on')
    : t('account.include_in_group_statistics_off')
))
const accountKindLabel = computed(() => (isCreditAccount.value ? t('common.credit_account') : t('common.cash_account')))
const accountCreditLimitMinor = computed(() => Math.max(0, Number(account.value?.credit_limit_minor ?? 0)))
const currentCreditDebtMinor = computed(() => Math.max(0, Number(currentAccountBalanceMinor.value ?? 0) * -1))
const availableCreditMinor = computed(() => Math.max(0, accountCreditLimitMinor.value - currentCreditDebtMinor.value))
const repaymentReminderDayLabel = computed(() => formatRepaymentReminderDay(account.value?.repayment_reminder_day))
const accountCloseDayLabel = computed(() => formatRepaymentReminderDay(account.value?.statement_close_day))
const accountDueDayLabel = computed(() => formatRepaymentReminderDay(account.value?.payment_due_day))
const isCreditAccount = computed(() => normalizeAccountKind(account.value?.account_kind) === 'credit')
const openingInvalid = computed(() => {
  const rawValue = editAccountKind.value === 'credit' ? editCurrentDebt.value : editOpening.value
  return !Number.isFinite(Number(rawValue))
})
const creditLimitInvalid = computed(() => {
  if (editAccountKind.value !== 'credit') return false
  const numeric = Number(editCreditLimit.value)
  return !Number.isFinite(numeric) || numeric < 0
})
const repaymentReminderDayInvalid = computed(() => {
  if (editAccountKind.value !== 'credit' || editRepaymentReminderDay.value === '') return false
  const numeric = Math.trunc(Number(editRepaymentReminderDay.value))
  return !Number.isFinite(numeric) || numeric < 1 || numeric > 31
})
const accountTransactions = computed(() => {
  const ownRows = transactions.value.filter((tx) => String(tx.account_id) === accountId.value)
  let cursor = currentAccountBalanceMinor.value - accountTransactionBeforeAmountMinor.value
  return ownRows.map((tx) => {
    const balanceAfterMinor = cursor
    cursor -= Number(tx.amount_minor ?? 0)
    return {
      ...tx,
      balanceAfterMinor,
    }
  })
})
const groupedAccountTransactions = computed(() => {
  const grouped = []
  const groupMap = new Map()
  for (const tx of accountTransactions.value) {
    const key = dateKeyOf(tx.occurred_at)
    if (!groupMap.has(key)) {
      const group = { dateKey: key, label: dateLabelOf(tx.occurred_at), items: [], incomeMinor: 0, expenseMinor: 0 }
      groupMap.set(key, group)
      grouped.push(group)
    }
    const group = groupMap.get(key)
    group.items.push(tx)
    if (tx.type === 'income') {
      group.incomeMinor += Math.abs(Math.round(Number(tx.amount_minor ?? 0)))
    } else if (tx.type === 'expense') {
      group.expenseMinor += Math.abs(Math.round(Number(tx.amount_minor ?? 0)))
    }
  }
  return grouped
})
const accountTransactionPageStart = computed(() => {
  if (accountTransactionTotal.value <= 0) return 0
  return ((accountTransactionPage.value - 1) * 300) + 1
})
const accountTransactionPageEnd = computed(() => Math.min(accountTransactionTotal.value, accountTransactionPage.value * 300))
const canGoPreviousAccountTransactionPage = computed(() => accountTransactionPage.value > 1)
const canGoNextAccountTransactionPage = computed(() => accountTransactionPage.value < accountTransactionTotalPages.value)

const groupOptions = computed(() => {
  return accountStore.groups.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})
const accountKindOptions = computed(() => ([
  { value: 'cash', label: t('common.cash_account') },
  { value: 'credit', label: t('common.credit_account') },
]))
const canSave = computed(() => {
  if (!isEditMode.value || !account.value) return false
  const name = editName.value.trim()
  const icon = normalizeFaIcon(editIcon.value, defaultAccountIcon)
  const groupId = String(editGroupId.value ?? '').trim()
  const accountKind = normalizeAccountKind(editAccountKind.value)
  const currencyCode = normalizeCurrencyCode(editCurrencyCode.value, 'TWD')
  const openingMajor = Number(editOpening.value)
  const currentDebtMajor = Number(editCurrentDebt.value)
  const creditLimitMajor = Number(editCreditLimit.value)
  const creditLimitMinor = Math.round(Math.abs(creditLimitMajor) * 100)
  const repaymentReminderDay = parseRepaymentReminderDay(editRepaymentReminderDay.value)
  const includeInAssets = Boolean(editIncludeInAssets.value)
  const includeInGroupStatistics = Boolean(editIncludeInGroupStatistics.value)
  if (!name || !groupId) return false
  if (accountKind === 'cash' && !Number.isFinite(openingMajor)) return false
  if (accountKind === 'credit' && (!Number.isFinite(currentDebtMajor) || !Number.isFinite(creditLimitMajor) || creditLimitMajor < 0)) return false
  if (accountKind === 'credit' && editRepaymentReminderDay.value !== '' && repaymentReminderDay == null) return false
  const openingMinorNext = accountKind === 'credit'
    ? Math.round(Math.abs(currentDebtMajor) * 100) * -1
    : Math.round(openingMajor * 100)

  return (
    name !== String(account.value.name ?? '') ||
    groupId !== String(account.value.group_id ?? '') ||
    icon !== normalizeFaIcon(account.value.icon, defaultAccountIcon) ||
    accountKind !== normalizeAccountKind(account.value.account_kind) ||
    currencyCode !== normalizeCurrencyCode(account.value.currency_code, 'TWD') ||
    openingMinorNext !== Number(account.value.opening_balance_minor ?? 0) ||
    creditLimitMinor !== Math.max(0, Number(account.value.credit_limit_minor ?? 0)) ||
    repaymentReminderDay !== parseRepaymentReminderDay(account.value.repayment_reminder_day) ||
    includeInAssets !== isAccountIncludedInAssets(account.value) ||
    includeInGroupStatistics !== isAccountIncludedInGroupStatistics(account.value)
  )
})

watch(
  () => account.value,
  (next) => {
    if (!next) return
    const nextId = String(next.id ?? '')
    if (!nextId) return
    if (initializedAccountId.value === nextId) return

    editName.value = String(next.name ?? '')
    editGroupId.value = String(next.group_id ?? '')
    editIcon.value = normalizeFaIcon(next.icon, defaultAccountIcon)
    editAccountKind.value = normalizeAccountKind(next.account_kind)
    editCurrencyCode.value = normalizeCurrencyCode(next.currency_code, 'TWD')
    editOpening.value = String(Number(next.opening_balance_minor ?? 0) / 100)
    editCurrentDebt.value = String(Math.max(0, Number(next.opening_balance_minor ?? 0) * -1) / 100)
    editCreditLimit.value = String(Math.max(0, Number(next.credit_limit_minor ?? 0)) / 100)
    editRepaymentReminderDay.value = next.repayment_reminder_day == null ? '' : String(next.repayment_reminder_day)
    editStatementCloseDay.value = next.statement_close_day == null ? '' : String(next.statement_close_day)
    editPaymentDueDay.value = next.payment_due_day == null ? '' : String(next.payment_due_day)
    editIncludeInAssets.value = isAccountIncludedInAssets(next)
    editIncludeInGroupStatistics.value = isAccountIncludedInGroupStatistics(next)
    initializedAccountId.value = nextId
  },
  { immediate: true },
)

watch(
  () => route.query.editAccountIcon,
  async (value) => {
    if (!isEditMode.value || !accountId.value) return
    const picked = normalizeFaIcon(queryText(value), '')
    if (!picked) return
    const current = normalizeFaIcon(editIcon.value, defaultAccountIcon)
    clearIconQuery()
    if (picked === current) return
    editIcon.value = picked
    await persistPickedIcon(picked)
  },
  { immediate: true },
)

watch(
  () => accountId.value,
  () => {
    accountTransactionPage.value = 1
    void refreshTransactions()
  },
)

async function refreshTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !accountId.value) return

  refreshing.value = true
  try {
    const result = await listTransactionPageForAccount(ledgerId, accountId.value, {
      page: accountTransactionPage.value,
    })
    if (result.page > result.totalPages) {
      accountTransactionPage.value = result.totalPages
      await refreshTransactions()
      return
    }
    transactions.value = result.items
    accountTransactionTotal.value = result.total
    accountTransactionTotalPages.value = result.totalPages
    accountTransactionBeforeAmountMinor.value = result.beforeAmountMinor
  } finally {
    refreshing.value = false
  }
}

function setAccountTransactionPage(page) {
  const nextPage = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), accountTransactionTotalPages.value)
  if (nextPage === accountTransactionPage.value) return
  accountTransactionPage.value = nextPage
  void refreshTransactions()
}

function goPreviousAccountTransactionPage() {
  if (!canGoPreviousAccountTransactionPage.value) return
  setAccountTransactionPage(accountTransactionPage.value - 1)
}

function goNextAccountTransactionPage() {
  if (!canGoNextAccountTransactionPage.value) return
  setAccountTransactionPage(accountTransactionPage.value + 1)
}

async function openIconPicker() {
  if (!accountId.value || !isEditMode.value || !account.value) return
  try {
    await router.push({
      name: 'icon-picker',
      query: {
        from: 'account-detail',
        scope: 'account',
        current: editIcon.value,
        accountId: accountId.value,
        mode: 'edit',
      },
    })
  } catch (error) {
    uiStore.pushToast(error?.message ?? t('settings_category_page.toast.open_icon_failed'), 'error')
  }
}

function clearIconQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.current
  delete nextQuery.from
  delete nextQuery.scope
  delete nextQuery.editAccountIcon
  delete nextQuery.accountId
  void router.replace({ query: nextQuery })
}

async function persistPickedIcon(icon) {
  if (!accountId.value) return
  const normalized = normalizeFaIcon(icon, defaultAccountIcon)
  const current = normalizeFaIcon(account.value?.icon, defaultAccountIcon)
  if (!normalized || normalized === current) return
  if (iconSaving.value) return

  iconSaving.value = true
  try {
    await accountStore.updateAccountIcon(accountId.value, normalized)
    uiStore.pushToast(t('account.icon_updated'))
  } catch (error) {
    editIcon.value = current
    uiStore.pushToast(error?.message ?? t('account.icon_update_failed'), 'error')
  } finally {
    iconSaving.value = false
  }
}

async function saveProfile() {
  if (!accountId.value || !canSave.value) return

  saving.value = true
  try {
    const nextName = editName.value.trim()
    const nextGroupId = String(editGroupId.value ?? '').trim()
    const nextIcon = normalizeFaIcon(editIcon.value, defaultAccountIcon)
    const nextAccountKind = normalizeAccountKind(editAccountKind.value)
    const nextCurrencyCode = normalizeCurrencyCode(editCurrencyCode.value, 'TWD')
    const nextOpeningBalanceMinor = nextAccountKind === 'credit'
      ? Math.round(Math.abs(Number(editCurrentDebt.value)) * 100) * -1
      : Math.round(Number(editOpening.value) * 100)
    const nextCreditLimitMinor = nextAccountKind === 'credit'
      ? Math.round(Math.abs(Number(editCreditLimit.value)) * 100)
      : 0
    const nextRepaymentReminderDay = nextAccountKind === 'credit'
      ? parseRepaymentReminderDay(editRepaymentReminderDay.value)
      : null
    const nextStatementCloseDay = nextAccountKind === 'credit'
      ? parseRepaymentReminderDay(editStatementCloseDay.value)
      : null
    const nextPaymentDueDay = nextAccountKind === 'credit'
      ? parseRepaymentReminderDay(editPaymentDueDay.value)
      : null

    await accountStore.updateAccountProfile(accountId.value, {
      name: nextName,
      groupId: nextGroupId,
      icon: nextIcon,
      accountKind: nextAccountKind,
      currencyCode: nextCurrencyCode,
      openingBalanceMinor: nextOpeningBalanceMinor,
      creditLimitMinor: nextCreditLimitMinor,
      repaymentReminderDay: nextRepaymentReminderDay,
      statementCloseDay: nextStatementCloseDay,
      paymentDueDay: nextPaymentDueDay,
      includeInAssets: editIncludeInAssets.value,
      includeInGroupStatistics: editIncludeInGroupStatistics.value,
    })
    uiStore.pushToast(t('account.data_updated'))
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('account.data_update_failed'), 'error')
  } finally {
    saving.value = false
  }
}

async function removeAccountRecord() {
  if (!isEditMode.value || !accountId.value || !account.value) return
  deleteConfirmOpen.value = true
}

function closeDeleteConfirm() {
  if (deleting.value) return
  deleteConfirmOpen.value = false
}

async function confirmRemoveAccountRecord() {
  if (!isEditMode.value || !accountId.value || !account.value) return
  deleting.value = true
  try {
    await accountStore.removeAccount(accountId.value)
    uiStore.pushToast(t('common.account_processed'))
    deleteConfirmOpen.value = false
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? t('account.delete_failed'), 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  if (!accountStore.accounts.length || !accountStore.groups.length) {
    await accountStore.load()
  }
  if (!categoryStore.categories.length) {
    await categoryStore.load()
  }
  await refreshTransactions()
})

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function addonDeltaMajor(note) {
  return addonDeltaMajorFromNote(note)
}

function addonDeltaTag(note) {
  return addonDeltaTagText(note)
}

function showAddonDeltaTag(tx) {
  if (!tx) return false
  if (tx.type === 'transfer' && Number(tx.amount_minor ?? 0) > 0) return false
  return Boolean(addonDeltaTag(tx.note))
}

function labelOfTransaction(tx) {
  if (!tx) return t('transaction_search.label.adjustment')
  if (tx.origin_type === 'reimbursement') return t('transaction_search.label.reimbursement')
  if (tx.origin_type === 'loan_payment') return loanTransactionLabel(tx)
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  if (tx.type === 'expense') return t('transaction.type.expense')
  if (tx.type === 'income') return t('transaction.type.income')
  if (tx.type === 'transfer') return t('transaction.type.transfer')
  return t('transaction_search.label.adjustment')
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? t('loans.collect') : t('loans.lend')
  if (loanDirection === 'borrow') return tx.type === 'expense' ? t('loans.repay') : t('loans.borrow')
  return tx.type === 'income' ? t('loans.collect') : t('loans.lend')
}

function categoryIconOfTransaction(tx) {
  if (!tx) return ''
  const systemIcon = getSystemTransactionIcon(tx)
  if (systemIcon) return systemIcon
  const directIcon = String(tx.category_icon ?? '').trim()
  if (directIcon) return directIcon
  if (tx.type === 'transfer') return 'fa-solid fa-arrow-right-arrow-left'
  if (tx.origin_type === 'reimbursement') return 'fa-solid fa-receipt'
  if (tx.origin_type === 'loan_payment') return loanTransactionIcon(tx)
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  return category?.icon ?? ''
}

function loanTransactionIcon(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
  if (loanDirection === 'borrow') return tx.type === 'expense' ? 'fa-solid fa-money-bill-transfer' : 'fa-solid fa-arrow-down'
  return tx.type === 'income' ? 'fa-solid fa-hand-holding-dollar' : 'fa-solid fa-arrow-up'
}

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(resolveIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeNoteText(tx) {
  const note = String(tx?.note ?? '').trim() || '-'
  return `${formatTime(tx?.occurred_at)} ${note}`
}

function dateKeyOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'invalid-date'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function openEdit(tx) {
  if (!tx) return
  void router.push({ name: 'transaction-about', params: { id: tx.id } })
}

function isAccountIncludedInAssets(value) {
  return Number(value?.include_in_assets ?? 1) === 1
}

function isAccountIncludedInGroupStatistics(value) {
  return Number(value?.include_in_group_statistics ?? 1) === 1
}

function normalizeAccountKind(value) {
  return String(value ?? '').trim().toLowerCase() === 'credit' ? 'credit' : 'cash'
}

function parseRepaymentReminderDay(value) {
  if (value === '' || value === null || value === undefined) return null
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 31) return null
  return numeric
}

function formatRepaymentReminderDay(value) {
  const day = parseRepaymentReminderDay(value)
  if (day == null) return t('savings_jar.auto_save.status.off')
  return t('account.monthly_day', { day })
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-title,
h3 {
  margin: 0;
}

.page-header {
  align-items: center;
}

.account-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.account-icon {
  width: 16px;
  color: var(--primary-soft);
}

.field {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.icon-picker-btn {
  width: 100%;
  justify-content: space-between;
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  border-radius: 10px;
  color: var(--text);
  min-height: 40px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
}

.error-text {
  margin: 6px 0 0;
  color: var(--danger-text);
  font-size: 12px;
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

.action-row {
  margin-top: 10px;
}

.detail-grid {
  margin-top: 8px;
  display: grid;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tx-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.tx-date-group {
  display: grid;
  gap: 6px;
}

.tx-date-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 15px;
  color: var(--muted);
  font-weight: 700;
  padding: 0 2px 2px;
}

.tx-date-total {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.tx-date-total small {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.tx-day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.tx-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 90%, transparent);
  cursor: pointer;
  outline: none;
}

.tx-item:focus,
.tx-item:focus-visible {
  outline: none;
  box-shadow: none;
}

.tx-icon-col {
  height: 100%;
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tx-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.tx-main {
  flex: 1;
  min-width: 0;
}

.tx-type {
  font-weight: 700;
  margin-bottom: 4px;
}

.tx-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-side {
  display: grid;
  justify-items: end;
  gap: 2px;
  flex-shrink: 0;
  text-align: right;
}

.tx-balance {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.2;
  text-align: right;
}

.addon-delta {
  font-size: 12px;
  line-height: 1.2;
}

.addon-delta.plus {
  color: var(--delta-plus);
}

.addon-delta.minus {
  color: var(--delta-minus);
}

.pagination-bar {
  margin-top: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.page-status {
  text-align: center;
  min-width: 0;
}

@media (max-width: 420px) {
  .pagination-bar {
    grid-template-columns: 1fr 1fr;
  }

  .page-status {
    grid-column: 1 / -1;
    grid-row: 1;
    font-size: 12px;
  }
}
</style>
