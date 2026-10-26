<template>
  <HabitatPageShell
    :title="t('assets_page.manage')"
    :kicker="t('assets_page.habitat_hello')"
    test-id="asset-account-manage-view"
    back-to="/assets"
  >

    <section class="habitat-flow-section">
      <header class="row">
        <h3>{{ t('common.asset_accounts') }}</h3>
        <div class="header-actions">
          <button class="btn mini-btn" @click="addAccountFromHeader">{{ t('common.add_account') }}</button>
          <button class="btn mini-btn" @click="addGroup">{{ t('common.add_group') }}</button>
        </div>
      </header>

      <ul class="group-list">
        <li v-for="group in groupSummaries" :key="group.id" class="group-item">
          <div class="row group-head" :class="{ open: isGroupExpanded(group.id) }">
            <button
              type="button"
              class="group-toggle-btn"
              :aria-expanded="isGroupExpanded(group.id) ? 'true' : 'false'"
              @click="toggleGroup(group.id)"
            >
              <h3 class="group-title">{{ group.name }}</h3>
              <font-awesome-icon icon="fa-solid fa-chevron-down" class="group-chevron" />
            </button>
            <RouterLink
              class="btn habitat-manage-btn"
              :to="{ name: 'asset-account-group-detail', params: { id: group.id } }"
              :aria-label="t('common.parent_group_settings')"
              :title="t('common.parent_group_settings')"
            >
              <font-awesome-icon icon="fa-solid fa-gear" />
            </RouterLink>
          </div>

          <transition name="collapse-fade">
            <draggable
              v-if="isGroupExpanded(group.id)"
              :model-value="accountItemsByGroup(group.id)"
              item-key="id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              :force-fallback="true"
              :delay-on-touch-only="true"
              :delay="120"
              class="account-list"
              @update:model-value="(items) => setAccountItems(group.id, items)"
              @end="onAccountSortEnd(group.id)"
            >
              <template #item="{ element: account }">
                <li class="account-item-row">
                  <div class="account-row" :class="{ excluded: !isAccountIncludedInAssets(account) }">
                    <RouterLink
                      :to="{ name: 'account-detail', params: { id: account.id }, query: { mode: 'edit' } }"
                      class="account-link"
                    >
                      <span class="account-left">
                        <span class="account-icon-wrap">
                          <font-awesome-icon v-if="account.icon" :icon="account.icon" class="account-icon" />
                        </span>
                        <span class="account-text">
                          <span class="account-name">{{ account.name }}</span>
                        </span>
                      </span>
                    </RouterLink>
                    <font-awesome-icon icon="fa-solid fa-bars" class="drag-handle child-drag-bar" :aria-label="t('common.drag_sort')" />
                  </div>
                </li>
              </template>
            </draggable>
          </transition>
        </li>
      </ul>
    </section>

    <AppDialog
      :open="groupDialogOpen"
      presentation="sheet"
      :title="t('common.add_group')"
      :confirm-disabled="!groupNameInput.trim()"
      :confirm-text="t('common.save')"
      @close="closeGroupDialog"
      @confirm="submitGroupDialog"
    >
      <label class="field">
        {{ t('common.group_name') }}
        <input v-model="groupNameInput" class="input" type="text" maxlength="40" :placeholder="t('common.please_enter_group_name')" />
      </label>
    </AppDialog>

    <AppDialog
      :open="accountDialogOpen"
      presentation="sheet"
      :title="t('settings_bank_sync_create.account_mode_create')"
      :confirm-disabled="!accountNameInput.trim() || !accountTargetGroupId || accountAmountInvalid || accountCreditLimitInvalid || accountReminderDayInvalid"
      :confirm-text="t('common.save')"
      @close="closeAccountDialog"
      @confirm="submitAccountDialog"
    >
      <label class="field">
        {{ t('common.account_name') }}
        <input v-model="accountNameInput" class="input" type="text" maxlength="40" :placeholder="t('common.please_enter_account_name')" />
      </label>
      <label v-if="accountKindInput !== 'credit'" class="field">
        {{ t('common.belonging_group') }}
        <CustomSelect v-model="accountTargetGroupId" :options="groupOptions" :placeholder="t('common.select_group')" />
      </label>
      <p v-else class="muted credit-group-hint">{{ t('account.credit_use_cards_page') }}</p>
      <label class="field">
        {{ t('common.account_icon') }}
        <button class="icon-picker-btn" type="button" @click="openAccountIconPicker">
          <font-awesome-icon :icon="accountIconInput" />
          <span>{{ t('common.choose_icon') }}</span>
        </button>
      </label>
      <label class="field">
        {{ t('common.account_type') }}
        <CustomSelect v-model="accountKindInput" :options="accountKindOptions" />
      </label>
      <label class="field">
        {{ t('welcome.account_currency') }}
        <CustomSelect v-model="accountCurrencyCodeInput" :options="currencyOptions" :placeholder="t('common.please_select_currency')" />
      </label>
      <label v-if="accountKindInput === 'cash'" class="field">
        {{ t('account.opening_amount_alt') }}
        <input v-model="accountOpeningInput" class="input" type="number" step="0.01" />
      </label>
      <label v-else class="field">
        {{ t('account.current_debt') }}
        <input v-model="accountCurrentDebtInput" class="input" type="number" min="0" step="0.01" />
      </label>
      <label v-if="accountKindInput === 'credit'" class="field">
        {{ t('account.credit_limit') }}
        <input v-model="accountCreditLimitInput" class="input" type="number" min="0" step="0.01" />
      </label>
      <label v-if="accountKindInput === 'credit'" class="field">
        {{ t('account.repay_day') }}
        <input v-model="accountRepaymentReminderDayInput" class="input" type="number" min="1" max="31" step="1" :placeholder="t('common.example_15')" />
      </label>
      <div class="field">
        <span>{{ t('account.include_in_assets_label') }}</span>
        <button
          type="button"
          class="switch-row"
          :class="{ active: accountIncludeInAssetsInput }"
          role="switch"
          :aria-checked="accountIncludeInAssetsInput ? 'true' : 'false'"
          @click="accountIncludeInAssetsInput = !accountIncludeInAssetsInput"
        >
          <span class="switch-copy">
            <strong>{{ accountIncludeInAssetsInput ? t('account.include_in_assets_on') : t('account.include_in_assets_off') }}</strong>
            <small class="muted">{{ t('account.include_in_assets_hint') }}</small>
          </span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>
      </div>
      <div v-if="accountKindInput !== 'credit'" class="field">
        <span>{{ t('account.include_in_group_statistics_label') }}</span>
        <button
          type="button"
          class="switch-row"
          :class="{ active: accountIncludeInGroupStatisticsInput }"
          role="switch"
          :aria-checked="accountIncludeInGroupStatisticsInput ? 'true' : 'false'"
          @click="accountIncludeInGroupStatisticsInput = !accountIncludeInGroupStatisticsInput"
        >
          <span class="switch-copy">
            <strong>{{ accountIncludeInGroupStatisticsInput ? t('account.include_in_group_statistics_on') : t('account.include_in_group_statistics_off') }}</strong>
            <small class="muted">{{ t('account.include_in_group_statistics_hint') }}</small>
          </span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>
      </div>
      <p v-if="accountAmountInvalid" class="error-text">{{ accountKindInput === 'credit' ? t('common.current_debt_invalid') : t('account.opening_alt_invalid') }}</p>
      <p v-if="accountCreditLimitInvalid" class="error-text">{{ t('common.credit_limit_invalid') }}</p>
      <p v-if="accountReminderDayInvalid" class="error-text">{{ t('common.repay_day_range') }}</p>
    </AppDialog>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { defaultAccountIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'
import { currencyOptions, normalizeCurrencyCode } from '@/ui/constants/currency-options'

const accountStore = useAccountStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const groupDialogOpen = ref(false)
const groupNameInput = ref('')
const accountDialogOpen = ref(false)
const accountTargetGroupId = ref('')
const accountNameInput = ref('')
const accountKindInput = ref('cash')
const accountOpeningInput = ref('0')
const accountCurrentDebtInput = ref('0')
const accountCreditLimitInput = ref('0')
const accountRepaymentReminderDayInput = ref('')
const accountIconInput = ref(defaultAccountIcon)
const accountCurrencyCodeInput = ref('TWD')
const accountIncludeInAssetsInput = ref(true)
const accountIncludeInGroupStatisticsInput = ref(true)
const accountItemsMap = ref({})
const expandedGroupIds = ref(new Set())
const expandedInitialized = ref(false)
const expandedStateStorageKey = 'asset-account-management:expanded-group-ids'

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    expandedInitialized.value = false
    expandedGroupIds.value = new Set()
  },
  { immediate: true },
)

watch(
  () => route.query,
  (query) => {
    if (queryText(query.openAccountDialog) !== '1') return
    // 信用卡改由 /credit-cards 新增，不走資產母分類
    if (normalizeAccountKind(queryText(query.accountKind)) === 'credit') {
      router.replace({ name: 'credit-cards' })
      return
    }
    accountTargetGroupId.value = queryText(query.accountTargetGroupId) || accountStore.groups[0]?.id || ''
    accountNameInput.value = queryText(query.accountName)
    accountKindInput.value = 'cash'
    accountOpeningInput.value = queryText(query.accountOpening) || '0'
    accountCurrentDebtInput.value = queryText(query.accountCurrentDebt) || '0'
    accountCreditLimitInput.value = queryText(query.accountCreditLimit) || '0'
    accountRepaymentReminderDayInput.value = queryText(query.accountRepaymentReminderDay)
    accountIconInput.value = normalizeFaIcon(queryText(query.accountIcon), defaultAccountIcon)
    accountCurrencyCodeInput.value = normalizeCurrencyCode(queryText(query.accountCurrency), 'TWD')
    accountIncludeInAssetsInput.value = queryBoolean(query.accountIncludeInAssets, true)
    accountIncludeInGroupStatisticsInput.value = queryBoolean(query.accountIncludeInGroupStatistics, true)
    accountDialogOpen.value = true
  },
  { immediate: true },
)

const groupSummaries = computed(() => {
  return (accountStore.groupSummaries ?? []).filter((group) => {
    return (accountItemsMap.value[group.id] ?? []).length > 0
  })
})

watch(
  groupSummaries,
  (groups) => {
    if (!expandedInitialized.value) {
      const stored = readExpandedGroupState()
      if (stored.exists) {
        expandedGroupIds.value = new Set(groups.filter((group) => stored.ids.has(group.id)).map((group) => group.id))
      } else {
        expandedGroupIds.value = new Set(groups.map((group) => group.id))
      }
      expandedInitialized.value = true
      persistExpandedGroupState()
      return
    }

    const nextExpanded = new Set()
    for (const group of groups) {
      if (expandedGroupIds.value.has(group.id)) {
        nextExpanded.add(group.id)
      }
    }
    expandedGroupIds.value = nextExpanded
    persistExpandedGroupState()
  },
  { immediate: true },
)

watch(
  () => accountStore.accounts,
  (accounts) => {
    const nextMap = {}
    for (const account of accounts) {
      // 信用卡不出現在資產母分類管理
      if (String(account?.account_kind ?? '').toLowerCase() === 'credit') continue
      if (!nextMap[account.group_id]) nextMap[account.group_id] = []
      nextMap[account.group_id].push(account)
    }
    accountItemsMap.value = nextMap
  },
  { immediate: true },
)

function accountItemsByGroup(groupId) {
  return accountItemsMap.value[groupId] ?? []
}

function isAccountIncludedInAssets(account) {
  return Number(account?.include_in_assets ?? 1) === 1
}

function setAccountItems(groupId, items) {
  accountItemsMap.value = {
    ...accountItemsMap.value,
    [groupId]: items,
  }
}

function isGroupExpanded(groupId) {
  return expandedGroupIds.value.has(groupId)
}

function toggleGroup(groupId) {
  const nextExpanded = new Set(expandedGroupIds.value)
  if (nextExpanded.has(groupId)) {
    nextExpanded.delete(groupId)
  } else {
    nextExpanded.add(groupId)
  }
  expandedGroupIds.value = nextExpanded
  persistExpandedGroupState()
}

const accountKindOptions = computed(() => ([
  { value: 'cash', label: t('common.cash_account') },
]))
const accountAmountInvalid = computed(() => {
  const rawValue = accountKindInput.value === 'credit' ? accountCurrentDebtInput.value : accountOpeningInput.value
  return !Number.isFinite(Number(rawValue))
})
const accountCreditLimitInvalid = computed(() => {
  if (accountKindInput.value !== 'credit') return false
  const numeric = Number(accountCreditLimitInput.value)
  return !Number.isFinite(numeric) || numeric < 0
})
const accountReminderDayInvalid = computed(() => {
  if (accountKindInput.value !== 'credit' || accountRepaymentReminderDayInput.value === '') return false
  const numeric = Math.trunc(Number(accountRepaymentReminderDayInput.value))
  return !Number.isFinite(numeric) || numeric < 1 || numeric > 31
})
const groupOptions = computed(() => {
  return accountStore.groups.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})

async function addGroup() {
  groupNameInput.value = ''
  groupDialogOpen.value = true
}

async function addAccountFromHeader() {
  const firstGroupId = groupSummaries.value[0]?.id || accountStore.groups[0]?.id || ''
  if (!firstGroupId) {
    uiStore.pushToast(t('account.create_group_first'), 'error')
    return
  }
  await addAccount(firstGroupId)
}

async function addAccount(groupId) {
  accountTargetGroupId.value = groupId
  accountNameInput.value = ''
  accountKindInput.value = 'cash'
  accountOpeningInput.value = '0'
  accountCurrentDebtInput.value = '0'
  accountCreditLimitInput.value = '0'
  accountRepaymentReminderDayInput.value = ''
  accountIconInput.value = defaultAccountIcon
  accountCurrencyCodeInput.value = 'TWD'
  accountIncludeInAssetsInput.value = true
  accountIncludeInGroupStatisticsInput.value = true
  accountDialogOpen.value = true
}

function closeGroupDialog() {
  groupDialogOpen.value = false
  groupNameInput.value = ''
}

async function submitGroupDialog() {
  const name = groupNameInput.value.trim()
  if (!name) return
  try {
    await accountStore.addGroup({
      name,
      type: 'other',
      sortOrder: accountStore.groups.length,
    })
    uiStore.pushToast(t('common.group_created'))
    closeGroupDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('quick_add.toast.create_failed'), 'error')
  }
}

function closeAccountDialog() {
  accountDialogOpen.value = false
  accountTargetGroupId.value = ''
  accountNameInput.value = ''
  accountKindInput.value = 'cash'
  accountOpeningInput.value = '0'
  accountCurrentDebtInput.value = '0'
  accountCreditLimitInput.value = '0'
  accountRepaymentReminderDayInput.value = ''
  accountIconInput.value = defaultAccountIcon
  accountCurrencyCodeInput.value = 'TWD'
  accountIncludeInAssetsInput.value = true
  accountIncludeInGroupStatisticsInput.value = true
  clearAccountDialogQuery()
}

function openAccountIconPicker() {
  void router.push({
    name: 'icon-picker',
    query: {
      ...route.query,
      from: 'asset-account-management',
      scope: 'account',
      current: accountIconInput.value,
      openAccountDialog: '1',
      accountTargetGroupId: accountTargetGroupId.value,
      accountName: accountNameInput.value,
      accountKind: accountKindInput.value,
      accountOpening: accountOpeningInput.value,
      accountCurrentDebt: accountCurrentDebtInput.value,
      accountCreditLimit: accountCreditLimitInput.value,
      accountRepaymentReminderDay: accountRepaymentReminderDayInput.value,
      accountIcon: accountIconInput.value,
      accountCurrency: accountCurrencyCodeInput.value,
      accountIncludeInAssets: accountIncludeInAssetsInput.value ? '1' : '0',
      accountIncludeInGroupStatistics: accountIncludeInGroupStatisticsInput.value ? '1' : '0',
    },
  })
}

async function submitAccountDialog() {
  const groupId = accountTargetGroupId.value
  const name = accountNameInput.value.trim()
  const accountKind = normalizeAccountKind(accountKindInput.value)
  const openingMajor = Number(accountOpeningInput.value)
  const currentDebtMajor = Number(accountCurrentDebtInput.value)
  const creditLimitMajor = Number(accountCreditLimitInput.value)
  const reminderDay = parseRepaymentReminderDay(accountRepaymentReminderDayInput.value)
  if (!groupId || !name) return
  if (accountKind === 'cash' && !Number.isFinite(openingMajor)) {
    uiStore.pushToast(t('account.opening_alt_invalid'), 'error')
    return
  }
  if (accountKind === 'credit' && !Number.isFinite(currentDebtMajor)) {
    uiStore.pushToast(t('common.current_debt_invalid'), 'error')
    return
  }
  if (accountKind === 'credit' && (!Number.isFinite(creditLimitMajor) || creditLimitMajor < 0)) {
    uiStore.pushToast(t('common.credit_limit_invalid'), 'error')
    return
  }
  if (accountKind === 'credit' && accountRepaymentReminderDayInput.value !== '' && reminderDay == null) {
    uiStore.pushToast(t('common.repay_day_range'), 'error')
    return
  }
  try {
    await accountStore.addAccount({
      groupId,
      name,
      accountType: 'asset',
      allowNegative: true,
      accountKind,
      openingBalanceMinor: accountKind === 'credit'
        ? Math.round(Math.abs(currentDebtMajor) * 100) * -1
        : Math.round(openingMajor * 100),
      icon: normalizeFaIcon(accountIconInput.value),
      currencyCode: normalizeCurrencyCode(accountCurrencyCodeInput.value, 'TWD'),
      creditLimitMinor: accountKind === 'credit' ? Math.round(Math.abs(creditLimitMajor) * 100) : 0,
      repaymentReminderDay: accountKind === 'credit' ? reminderDay : null,
      includeInAssets: accountIncludeInAssetsInput.value,
      includeInGroupStatistics: accountIncludeInGroupStatisticsInput.value,
    })
    uiStore.pushToast(t('welcome.toast.account_created'))
    closeAccountDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('welcome.toast.create_account_failed'), 'error')
  }
}

function clearAccountDialogQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.openAccountDialog
  delete nextQuery.accountTargetGroupId
  delete nextQuery.accountName
  delete nextQuery.accountKind
  delete nextQuery.accountOpening
  delete nextQuery.accountCurrentDebt
  delete nextQuery.accountCreditLimit
  delete nextQuery.accountRepaymentReminderDay
  delete nextQuery.accountIcon
  delete nextQuery.accountCurrency
  delete nextQuery.accountIncludeInAssets
  delete nextQuery.accountIncludeInGroupStatistics
  delete nextQuery.current
  delete nextQuery.from
  delete nextQuery.scope
  void router.replace({ query: nextQuery })
}

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

function queryBoolean(value, fallback = true) {
  const text = queryText(value).trim().toLowerCase()
  if (!text) return fallback
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  return fallback
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

async function onAccountSortEnd(groupId) {
  await accountStore.reorderAccounts(groupId, accountItemsByGroup(groupId).map((item) => item.id))
}

function readExpandedGroupState() {
  if (typeof window === 'undefined') {
    return { exists: false, ids: new Set() }
  }
  try {
    const storageKey = expandedStateStorageKeyForLedger()
    if (!storageKey) return { exists: false, ids: new Set() }
    const raw = window.localStorage.getItem(storageKey)
    if (raw == null) return { exists: false, ids: new Set() }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { exists: true, ids: new Set() }
    return { exists: true, ids: new Set(parsed.map((item) => String(item))) }
  } catch {
    return { exists: false, ids: new Set() }
  }
}

function persistExpandedGroupState() {
  if (!expandedInitialized.value || typeof window === 'undefined') return
  try {
    const storageKey = expandedStateStorageKeyForLedger()
    if (!storageKey) return
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedGroupIds.value)))
  } catch {
    // Ignore storage failures silently (e.g. private mode quota limits).
  }
}

function expandedStateStorageKeyForLedger() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) return ''
  return `${expandedStateStorageKey}:${ledgerId}`
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
}

.page-title {
  font-size: 24px;
}

.page-header {
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-list,
.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.summary-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.summary-link {
  width: 100%;
  text-align: left;
  color: inherit;
  background: color-mix(in srgb, var(--card) 82%, var(--surface-soft-accent) 18%);
  cursor: pointer;
}

.summary-head {
  align-items: center;
}

.summary-hint {
  font-size: 11px;
}

.group-list {
  margin-top: 12px;
  display: grid;
  gap: 16px;
}

.group-item {
  border: 0;
  border-radius: 0;
  padding: 0;
}

.group-title {
  font-size: 18px;
  font-weight: 700;
}

.group-head {
  align-items: center;
  margin-bottom: 8px;
}

.group-toggle-btn {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}

.group-chevron {
  color: var(--muted);
  transition: transform 0.18s ease;
}

.group-head.open .group-chevron {
  transform: rotate(180deg);
}

.icon-btn {
  text-decoration: none;
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.account-list {
  margin-top: 0;
  display: grid;
  gap: 12px;
}

.account-item-row {
  list-style: none;
}

a {
  color: var(--text);
  text-decoration: none;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 24px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--card) 72%, var(--surface-soft-accent) 28%),
      color-mix(in srgb, var(--card) 86%, var(--primary) 14%)
    );
  border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border) 86%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 20%, transparent);
  padding: 16px 16px;
}
.account-row.excluded {
  background: color-mix(in srgb, var(--card) 92%, var(--surface-soft-accent) 8%);
  border-color: color-mix(in srgb, var(--muted) 28%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--muted) 14%, transparent);
}

.account-link {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
}

.account-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.account-text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.account-name {
  font-size: 18px;
  line-height: 1.15;
  color: var(--text);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-row.excluded .account-name {
  color: color-mix(in srgb, var(--text) 58%, var(--muted) 42%);
}

.account-balance {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
}

.account-right {
  display: grid;
  justify-items: end;
  gap: 3px;
  flex-shrink: 0;
}

.account-subtitle {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
}

.account-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.account-icon {
  font-size: 22px;
  color: color-mix(in srgb, var(--primary) 68%, var(--text) 32%);
}
.account-row.excluded .account-icon {
  color: color-mix(in srgb, var(--muted) 78%, var(--text) 22%);
}

.drag-handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
}

.child-drag-bar {
  flex-shrink: 0;
  font-size: 16px;
  padding: 4px;
}

.drag-ghost {
  opacity: 0.55;
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

.danger {
  background: var(--surface-danger);
  color: var(--danger-text);
}

.mini-btn {
  padding: 10px 12px;
  font-size: inherit;
  border-radius: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.error-text {
  margin: 0;
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

@media (prefers-color-scheme: dark) {
  .account-row {
    background: color-mix(in srgb, var(--card) 86%, #111 14%);
    border-color: color-mix(in srgb, var(--text) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, white 8%, transparent);
  }

  .account-row.excluded {
    background: color-mix(in srgb, var(--card) 92%, #000 8%);
  }

  .account-icon {
    color: #f7f7f7;
  }

  .account-row.excluded .account-icon {
    color: color-mix(in srgb, var(--muted) 78%, #f7f7f7 22%);
  }
}

.collapse-fade-enter-active,
.collapse-fade-leave-active {
  transition: opacity var(--anim-fast) var(--anim-standard);
}

.collapse-fade-enter-from,
.collapse-fade-leave-to {
  opacity: 0;
}
</style>
