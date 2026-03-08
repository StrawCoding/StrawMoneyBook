<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ isEditMode ? '編輯帳戶' : '帳戶明細' }}</h2>
      <button v-if="!isEditMode" class="btn back-btn" type="button" @click="goBack">{{ t('common.back') }}</button>
      <RouterLink v-else class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row">
        <h3 class="account-title">
          <font-awesome-icon v-if="editIcon" :icon="editIcon" class="account-icon" />
          <span>{{ accountName }}</span>
        </h3>
        <button v-if="isEditMode" class="btn primary" :disabled="!canSave || saving" @click="saveProfile">
          {{ saving ? '儲存中...' : '儲存變更' }}
        </button>
      </header>

      <template v-if="isEditMode">
        <label class="field">
          帳戶名稱
          <input v-model="editName" class="input" type="text" maxlength="40" placeholder="請輸入帳戶名稱" />
        </label>

        <div class="field">
          <span>帳戶 Icon</span>
          <button class="icon-picker-btn" type="button" @click.stop.prevent="openIconPicker">
            <font-awesome-icon :icon="editIcon || defaultAccountIcon" />
            <span>選擇 icon</span>
          </button>
        </div>

        <label class="field">
          所屬群組
          <CustomSelect v-model="editGroupId" :options="groupOptions" placeholder="請選擇群組" />
        </label>

        <label class="field">
          帳戶幣別
          <CustomSelect v-model="editCurrencyCode" :options="currencyOptions" placeholder="請選擇幣別" />
        </label>

        <label class="field">
          預設資金（元，可小數）
          <input v-model="editOpening" class="input" type="number" step="0.01" />
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
        <p v-if="openingInvalid" class="error-text">預設資金格式錯誤</p>
        <div class="row action-row">
          <button class="btn danger" :disabled="deleting" @click="removeAccountRecord">
            {{ deleting ? '處理中...' : '刪除/封存帳戶' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="detail-grid">
          <div class="detail-row">
            <small class="muted">所屬群組</small>
            <span>{{ accountGroupName }}</span>
          </div>
          <div class="detail-row">
            <small class="muted">帳戶幣別</small>
            <span>{{ accountCurrencyCode }}</span>
          </div>
          <div class="detail-row">
            <small class="muted">{{ t('account.include_in_assets_label') }}</small>
            <span>{{ accountIncludeInAssetsLabel }}</span>
          </div>
        </div>
      </template>
    </article>

    <article class="card panel">
      <header class="row">
        <h3>交易紀錄</h3>
        <button class="btn" :disabled="refreshing" @click="refreshTransactions">刷新</button>
      </header>
      <p class="muted">最近 {{ accountTransactions.length }} 筆交易</p>
      <ul class="tx-list">
        <li v-for="group in groupedAccountTransactions" :key="group.dateKey" class="tx-date-group">
          <div class="tx-date-head">
            <span>{{ group.label }}</span>
            <span class="tx-date-total">
              <small>收 <MoneyText :value-minor="group.incomeMinor" :currency="accountCurrencyCode" tone="income" /></small>
              <small>支 <MoneyText :value-minor="group.expenseMinor" :currency="accountCurrencyCode" tone="expense" /></small>
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
                  餘額 <MoneyText :value-minor="tx.balanceAfterMinor" :currency="accountCurrencyCode" />
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
        <li v-if="groupedAccountTransactions.length === 0" class="muted">目前沒有交易紀錄</li>
      </ul>

    </article>

    <AppDialog
      :open="deleteConfirmOpen"
      title="確認刪除/封存"
      :message="`確定要刪除/封存「${account?.name ?? ''}」？`"
      confirm-text="確認刪除"
      :loading="deleting"
      loading-text="處理中..."
      @close="closeDeleteConfirm"
      @confirm="confirmRemoveAccountRecord"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { listTransactionsByAccount } from '@/core/repositories/transaction.repo'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { addonDeltaMajorFromNote, addonDeltaTagText } from '@/ui/utils/addon-note'
import { defaultAccountIcon, normalizeFaIcon } from '@/ui/utils/fa-icon-options'
import { getSystemTransactionIcon, getSystemTransactionLabel } from '@/ui/utils/system-transaction-presenter'
import { currencyOptions, normalizeCurrencyCode } from '@/ui/constants/currency-options'
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
const editIncludeInAssets = ref(true)
const initializedAccountId = ref('')

const accountId = computed(() => String(route.params.id ?? ''))
const account = computed(() => accountStore.accounts.find((item) => item.id === accountId.value) ?? null)
const isEditMode = computed(() => queryText(route.query.mode) === 'edit')
const backLink = computed(() => (isEditMode.value ? '/assets/accounts' : '/assets'))

function goBack() {
  void goBackOrFallback(router, backLink.value)
}

const accountName = computed(() => account.value?.name || '帳戶')
const accountCurrencyCode = computed(() => normalizeCurrencyCode(account.value?.currency_code, 'TWD'))
const accountGroupName = computed(() => {
  const groupId = account.value?.group_id
  if (!groupId) return '-'
  return accountStore.groups.find((item) => item.id === groupId)?.name ?? '-'
})
const accountIncludeInAssetsLabel = computed(() => {
  return isAccountIncludedInAssets(account.value) ? t('account.include_in_assets_on') : t('account.include_in_assets_off')
})
const openingInvalid = computed(() => !Number.isFinite(Number(editOpening.value)))
const currentAccountBalanceMinor = computed(() => {
  const matched = accountStore.balances.find((item) => item.id === accountId.value)
  if (matched) return Number(matched.balance_minor ?? 0)
  return Number(account.value?.opening_balance_minor ?? 0)
})
const accountTransactions = computed(() => {
  const ownRows = transactions.value.filter((tx) => String(tx.account_id) === accountId.value)
  let cursor = currentAccountBalanceMinor.value
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

const groupOptions = computed(() => {
  return accountStore.groups.map((group) => ({
    value: group.id,
    label: group.name,
  }))
})
const canSave = computed(() => {
  if (!isEditMode.value || !account.value) return false
  const name = editName.value.trim()
  const icon = normalizeFaIcon(editIcon.value, defaultAccountIcon)
  const groupId = String(editGroupId.value ?? '').trim()
  const currencyCode = normalizeCurrencyCode(editCurrencyCode.value, 'TWD')
  const openingMajor = Number(editOpening.value)
  const includeInAssets = Boolean(editIncludeInAssets.value)
  if (!name || !groupId || !Number.isFinite(openingMajor)) return false
  const openingMinorNext = Math.round(openingMajor * 100)

  return (
    name !== String(account.value.name ?? '') ||
    groupId !== String(account.value.group_id ?? '') ||
    icon !== normalizeFaIcon(account.value.icon, defaultAccountIcon) ||
    currencyCode !== normalizeCurrencyCode(account.value.currency_code, 'TWD') ||
    openingMinorNext !== Number(account.value.opening_balance_minor ?? 0) ||
    includeInAssets !== isAccountIncludedInAssets(account.value)
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
    editCurrencyCode.value = normalizeCurrencyCode(next.currency_code, 'TWD')
    editOpening.value = String(Number(next.opening_balance_minor ?? 0) / 100)
    editIncludeInAssets.value = isAccountIncludedInAssets(next)
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
    void refreshTransactions()
  },
)

async function refreshTransactions() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !accountId.value) return

  refreshing.value = true
  try {
    transactions.value = await listTransactionsByAccount(ledgerId, accountId.value)
  } finally {
    refreshing.value = false
  }
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
    uiStore.pushToast(error?.message ?? '開啟 icon 選擇器失敗', 'error')
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
    uiStore.pushToast('帳戶 icon 已更新')
  } catch (error) {
    editIcon.value = current
    uiStore.pushToast(error?.message ?? '更新帳戶 icon 失敗', 'error')
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
    const nextCurrencyCode = normalizeCurrencyCode(editCurrencyCode.value, 'TWD')
    const nextOpeningBalanceMinor = Math.round(Number(editOpening.value) * 100)

    await accountStore.updateAccountProfile(accountId.value, {
      name: nextName,
      groupId: nextGroupId,
      icon: nextIcon,
      currencyCode: nextCurrencyCode,
      openingBalanceMinor: nextOpeningBalanceMinor,
      includeInAssets: editIncludeInAssets.value,
    })
    uiStore.pushToast('帳戶資料已更新')
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? '更新帳戶資料失敗', 'error')
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
    uiStore.pushToast('帳戶已處理')
    deleteConfirmOpen.value = false
    await router.push('/assets/accounts')
  } catch (error) {
    uiStore.pushToast(error.message ?? '刪除帳戶失敗', 'error')
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
  if (!tx) return '調整'
  if (tx.origin_type === 'reimbursement') return '報銷'
  if (tx.origin_type === 'loan_payment') return loanTransactionLabel(tx)
  const systemLabel = getSystemTransactionLabel(tx)
  if (systemLabel) return systemLabel
  const directName = String(tx.category_name ?? '').trim()
  if (directName) return directName
  const category = categoryStore.categories.find((item) => item.id === tx.category_id)
  if (category?.name) return category.name
  if (tx.type === 'expense') return '支出'
  if (tx.type === 'income') return '收入'
  if (tx.type === 'transfer') return '轉帳'
  return '調整'
}

function loanTransactionLabel(tx) {
  const loanDirection = loanStore.items.find((item) => item.id === tx.external_ref_id)?.direction
  if (loanDirection === 'lend') return tx.type === 'income' ? '收回' : '借出'
  if (loanDirection === 'borrow') return tx.type === 'expense' ? '歸還' : '借入'
  return tx.type === 'income' ? '收回' : '借出'
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
  return new Date(iso).toLocaleString('zh-TW', {
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
</style>
