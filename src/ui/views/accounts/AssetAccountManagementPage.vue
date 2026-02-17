<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">資產帳戶管理</h2>
      <RouterLink class="btn back-btn" to="/assets">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <header class="row">
        <h3>資產帳戶</h3>
        <div class="header-actions">
          <button class="btn mini-btn" @click="addAccountFromHeader">新增帳號</button>
          <button class="btn mini-btn" @click="addGroup">新增群組</button>
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
              class="btn mini-btn icon-btn"
              :to="{ name: 'asset-account-group-detail', params: { id: group.id } }"
              aria-label="母分類設定"
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
                  <div class="account-row">
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
                    <font-awesome-icon icon="fa-solid fa-bars" class="drag-handle child-drag-bar" aria-label="拖動排序" />
                  </div>
                </li>
              </template>
            </draggable>
          </transition>
        </li>
      </ul>
    </article>

    <AppDialog
      :open="groupDialogOpen"
      title="新增群組"
      :confirm-disabled="!groupNameInput.trim()"
      confirm-text="儲存"
      @close="closeGroupDialog"
      @confirm="submitGroupDialog"
    >
      <label class="field">
        群組名稱
        <input v-model="groupNameInput" class="input" type="text" maxlength="40" placeholder="請輸入群組名稱" />
      </label>
    </AppDialog>

    <AppDialog
      :open="accountDialogOpen"
      title="新增帳戶"
      :confirm-disabled="!accountNameInput.trim() || !accountTargetGroupId || accountOpeningInvalid"
      confirm-text="儲存"
      @close="closeAccountDialog"
      @confirm="submitAccountDialog"
    >
      <label class="field">
        帳戶名稱
        <input v-model="accountNameInput" class="input" type="text" maxlength="40" placeholder="請輸入帳戶名稱" />
      </label>
      <label class="field">
        所屬群組
        <CustomSelect v-model="accountTargetGroupId" :options="groupOptions" placeholder="請選擇群組" />
      </label>
      <label class="field">
        帳戶 Icon
        <button class="icon-picker-btn" type="button" @click="openAccountIconPicker">
          <font-awesome-icon :icon="accountIconInput" />
          <span>選擇 icon</span>
        </button>
      </label>
      <label class="field">
        帳戶幣別
        <CustomSelect v-model="accountCurrencyCodeInput" :options="currencyOptions" placeholder="請選擇幣別" />
      </label>
      <label class="field">
        期初金額（元，可小數）
        <input v-model="accountOpeningInput" class="input" type="number" step="0.01" />
      </label>
      <p v-if="accountOpeningInvalid" class="error-text">期初金額格式錯誤</p>
    </AppDialog>
  </section>
</template>

<script setup>
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
const accountOpeningInput = ref('0')
const accountIconInput = ref(defaultAccountIcon)
const accountCurrencyCodeInput = ref('TWD')
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
    accountTargetGroupId.value = queryText(query.accountTargetGroupId) || accountStore.groups[0]?.id || ''
    accountNameInput.value = queryText(query.accountName)
    accountOpeningInput.value = queryText(query.accountOpening) || '0'
    accountIconInput.value = normalizeFaIcon(queryText(query.accountIcon), defaultAccountIcon)
    accountCurrencyCodeInput.value = normalizeCurrencyCode(queryText(query.accountCurrency), 'TWD')
    accountDialogOpen.value = true
  },
  { immediate: true },
)

const groupSummaries = computed(() => accountStore.groupSummaries)

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

const accountOpeningInvalid = computed(() => {
  return !Number.isFinite(Number(accountOpeningInput.value))
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
    uiStore.pushToast('請先新增群組', 'error')
    return
  }
  await addAccount(firstGroupId)
}

async function addAccount(groupId) {
  accountTargetGroupId.value = groupId
  accountNameInput.value = ''
  accountOpeningInput.value = '0'
  accountIconInput.value = defaultAccountIcon
  accountCurrencyCodeInput.value = 'TWD'
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
    uiStore.pushToast('群組已新增')
    closeGroupDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增失敗', 'error')
  }
}

function closeAccountDialog() {
  accountDialogOpen.value = false
  accountTargetGroupId.value = ''
  accountNameInput.value = ''
  accountOpeningInput.value = '0'
  accountIconInput.value = defaultAccountIcon
  accountCurrencyCodeInput.value = 'TWD'
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
      accountOpening: accountOpeningInput.value,
      accountIcon: accountIconInput.value,
      accountCurrency: accountCurrencyCodeInput.value,
    },
  })
}

async function submitAccountDialog() {
  const groupId = accountTargetGroupId.value
  const name = accountNameInput.value.trim()
  const openingMajor = Number(accountOpeningInput.value)
  if (!groupId || !name) return
  if (!Number.isFinite(openingMajor)) {
    uiStore.pushToast('期初金額格式錯誤', 'error')
    return
  }
  try {
    await accountStore.addAccount({
      groupId,
      name,
      accountType: 'asset',
      allowNegative: true,
      openingBalanceMinor: Math.round(openingMajor * 100),
      icon: normalizeFaIcon(accountIconInput.value),
      currencyCode: normalizeCurrencyCode(accountCurrencyCodeInput.value, 'TWD'),
    })
    uiStore.pushToast('帳戶已新增')
    closeAccountDialog()
  } catch (error) {
    uiStore.pushToast(error.message ?? '新增帳戶失敗', 'error')
  }
}

function clearAccountDialogQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.openAccountDialog
  delete nextQuery.accountTargetGroupId
  delete nextQuery.accountName
  delete nextQuery.accountOpening
  delete nextQuery.accountIcon
  delete nextQuery.accountCurrency
  delete nextQuery.current
  delete nextQuery.from
  delete nextQuery.scope
  void router.replace({ query: nextQuery })
}

function queryText(value) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
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
  background: color-mix(in srgb, var(--card) 76%, var(--surface-soft-accent) 24%);
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
  background: color-mix(in srgb, var(--card) 86%, #111 14%);
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 8%, transparent);
  padding: 16px 16px;
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
  color: #f7f7f7;
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

.collapse-fade-enter-active,
.collapse-fade-leave-active {
  transition: opacity 0.2s ease;
}

.collapse-fade-enter-from,
.collapse-fade-leave-to {
  opacity: 0;
}
</style>
