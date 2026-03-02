<template>
  <div v-if="showDisclaimer" class="notice-overlay" role="dialog" aria-modal="true" aria-labelledby="bank-sync-notice-title">
    <div class="card notice-dialog">
      <h3 id="bank-sync-notice-title">{{ t('settings_bank_sync.disclaimer.title') }}</h3>
      <p class="muted">
        {{ t('settings_bank_sync.disclaimer.line_1') }}
        {{ t('settings_bank_sync.disclaimer.line_2') }}
      </p>
      <div class="row notice-actions">
        <button class="btn primary" @click="acceptDisclaimer">{{ t('settings_bank_sync.disclaimer.confirm') }}</button>
      </div>
    </div>
  </div>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_bank_sync.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>{{ t('settings_bank_sync.management_title') }}</h3>
      <p class="muted">{{ t('settings_bank_sync.management_desc') }}</p>
      <p v-if="!bankSyncApiReady" class="muted bank-api-warning">{{ bankSyncApiMessage }}</p>
      <div class="row top-action-row">
        <RouterLink class="btn primary" :class="{ disabled: !bankSyncApiReady }" :to="bankSyncCreateLink">
          {{ t('settings_bank_sync.add_bank') }}
        </RouterLink>
        <button class="btn" :disabled="loadingState" :aria-busy="loadingState" @click="reloadState">
          {{ loadingState ? t('settings_bank_sync.refreshing') : t('settings_bank_sync.refresh') }}
        </button>
      </div>
    </article>

    <article v-if="!connections.length" class="card panel">
      <p class="muted">{{ t('settings_bank_sync.empty') }}</p>
    </article>

    <article v-for="connection in connections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div class="title-wrap">
          <h3>{{ connection.user_label || connection.provider }}</h3>
          <small class="muted">{{ connection.provider_connection_id }}</small>
        </div>
        <span class="status-chip" :class="`status-${connection.status}`">{{ connectionStatusText(connection.status) }}</span>
      </header>

      <ul class="meta-list">
        <li><span class="muted">{{ t('settings_bank_sync.meta.last_sync') }}</span><strong>{{ formatDateTime(connection.last_sync_at) }}</strong></li>
        <li><span class="muted">{{ t('settings_bank_sync.meta.sync_status') }}</span><strong>{{ syncStatusText(connection.last_sync_status) }}</strong></li>
        <li v-if="connection.last_error"><span class="muted">{{ t('settings_bank_sync.meta.error') }}</span><strong>{{ connection.last_error }}</strong></li>
      </ul>

      <div class="row action-row">
        <button class="btn" @click="openReview(connection.id)">{{ t('settings_bank_sync.actions.review') }}</button>
        <button
          class="btn primary"
          :disabled="syncingConnectionId === connection.id"
          :aria-busy="syncingConnectionId === connection.id"
          @click="syncConnection(connection.id)"
        >
          {{ syncingConnectionId === connection.id ? t('settings_bank_sync.actions.syncing') : t('settings_bank_sync.actions.sync_now') }}
        </button>
        <button
          class="btn"
          :disabled="disconnectingConnectionId === connection.id"
          :aria-busy="disconnectingConnectionId === connection.id"
          @click="disconnectConnection(connection.id)"
        >
          {{ disconnectingConnectionId === connection.id ? t('settings_bank_sync.actions.disconnecting') : t('settings_bank_sync.actions.disconnect') }}
        </button>
      </div>

      <section class="sub-panel">
        <h4>{{ t('settings_bank_sync.account_sync.title') }}</h4>
        <p class="muted">{{ t('settings_bank_sync.account_sync.desc') }}</p>
        <div v-for="account in connection.accounts" :key="account.id" class="account-row">
          <label class="check-row account-enable">
            <input v-model="account.enabledBool" type="checkbox" />
            <span>{{ account.account_name }}（{{ account.account_mask || '-' }}）</span>
          </label>
          <div class="account-config">
            <label class="field">
              {{ t('settings_bank_sync.account_sync.target_account') }}
              <CustomSelect v-model="account.mappedAccountIdDraft" :options="ledgerAccountOptions" :placeholder="t('settings_bank_sync.account_sync.choose_account')" />
            </label>
            <label class="field">
              {{ t('settings_bank_sync.account_sync.display_name') }}
              <input v-model.trim="account.userLabelDraft" class="input" type="text" :placeholder="t('settings_bank_sync.account_sync.display_name_placeholder')" />
            </label>
            <button
              class="btn"
              :disabled="savingAccountId === account.id"
              :aria-busy="savingAccountId === account.id"
              @click="saveAccount(connection.id, account)"
            >
              {{ savingAccountId === account.id ? t('settings_bank_sync.common.saving') : t('settings_bank_sync.account_sync.save') }}
            </button>
          </div>
        </div>
      </section>

      <section class="sub-panel">
        <h4>{{ t('settings_bank_sync.rule.title') }}</h4>
        <div class="rule-grid">
          <label class="field">
            {{ t('settings_bank_sync.rule.direction') }}
            <CustomSelect v-model="connection.ruleDraft.direction" :options="directionOptions" />
          </label>
          <label class="field">
            {{ t('settings_bank_sync.rule.min_amount') }}
            <input v-model.number="connection.ruleDraft.minAmountMajor" class="input" type="number" min="0" step="1" />
          </label>
          <label class="field">
            {{ t('settings_bank_sync.rule.lookback_days') }}
            <CustomSelect v-model="connection.ruleDraft.lookbackDays" :options="lookbackOptions" />
          </label>
          <label class="field keyword-field">
            {{ t('settings_bank_sync.rule.exclude_keywords') }}
            <textarea v-model="connection.ruleDraft.excludeKeywordText" class="input text-area" rows="2" :placeholder="t('settings_bank_sync.rule.exclude_keywords_placeholder')" />
          </label>
          <label class="check-row">
            <input v-model="connection.ruleDraft.includePending" type="checkbox" />
            <span>{{ t('settings_bank_sync.rule.include_pending') }}</span>
          </label>
          <button
            class="btn"
            :disabled="savingRuleConnectionId === connection.id"
            :aria-busy="savingRuleConnectionId === connection.id"
            @click="saveRule(connection)"
          >
            {{ savingRuleConnectionId === connection.id ? t('settings_bank_sync.common.saving') : t('settings_bank_sync.rule.save') }}
          </button>
        </div>
      </section>
    </article>

    <article v-if="activeConnection" class="card panel review-panel">
      <header class="row review-head">
        <h3>{{ t('settings_bank_sync.review.title', { name: activeConnection.user_label || activeConnection.provider }) }}</h3>
        <button class="btn" :disabled="reviewLoading" :aria-busy="reviewLoading" @click="loadReview(activeConnection.id)">
          {{ reviewLoading ? t('settings_bank_sync.common.loading') : t('settings_bank_sync.review.reload') }}
        </button>
      </header>

      <div v-if="!reviewRows.length" class="muted">{{ t('settings_bank_sync.review.empty') }}</div>
      <template v-else>
        <div class="row review-action-row">
          <button class="btn" @click="selectAllReviewRows">{{ t('settings_bank_sync.review.select_all') }}</button>
          <button class="btn" @click="clearReviewSelection">{{ t('settings_bank_sync.review.select_none') }}</button>
          <button class="btn" @click="invertReviewSelection">{{ t('settings_bank_sync.review.invert_selection') }}</button>
          <button class="btn" :disabled="markingSeen || !selectedReviewIds.length" :aria-busy="markingSeen" @click="markSelectedSeen">
            {{ markingSeen ? t('settings_bank_sync.review.marking_seen') : t('settings_bank_sync.review.mark_seen') }}
          </button>
          <button class="btn primary" :disabled="importing || !selectedReviewIds.length" :aria-busy="importing" @click="importSelected">
            {{ importing ? t('settings_bank_sync.review.importing') : t('settings_bank_sync.review.import_selected', { count: selectedReviewIds.length }) }}
          </button>
        </div>

        <ul class="review-list">
          <li v-for="row in reviewRows" :key="row.id" class="review-item">
            <label class="check-row item-head">
              <input :checked="selectedReviewIdSet.has(row.id)" type="checkbox" @change="toggleReviewSelection(row.id, $event)" />
              <span class="item-main">
                <strong>{{ formatAmountMinor(row.amount_minor, row.currency) }}</strong>
                <small class="muted">{{ formatDateTime(row.posted_at) }}</small>
              </span>
              <span class="status-chip" :class="`status-${row.status}`">{{ reviewStatusText(row.status) }}</span>
            </label>
            <div class="item-body">
              <div>{{ row.merchant || row.description || t('settings_bank_sync.review.no_description') }}</div>
              <small class="muted">
                {{ row.bank_account_user_label || row.bank_account_name || '-' }}
                → {{ row.mapped_account_name || t('settings_bank_sync.review.unmapped_account') }}
              </small>
            </div>
          </li>
        </ul>
      </template>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  disconnectBankConnection,
  getBankSyncState,
  importSelectedBankTransactions,
  listBankReviewTransactions,
  markBankReviewTransactionsSeen,
  saveBankAccountSettings,
  saveBankSyncRuleSettings,
  syncBankConnectionNow,
} from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage, isBankSyncApiConfigured } from '@/services/bank-sync/backend'

const { locale, t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()
const bankSyncApiReady = isBankSyncApiConfigured()
const bankSyncApiMessage = computed(() => getBankSyncApiUnavailableMessage())

const loadingState = ref(false)
const syncingConnectionId = ref('')
const disconnectingConnectionId = ref('')
const savingAccountId = ref('')
const savingRuleConnectionId = ref('')
const reviewLoading = ref(false)
const importing = ref(false)
const markingSeen = ref(false)
const DISCLAIMER_ACCEPTED_KEY = 'strawmoneybook.bank_sync.disclaimer.accepted'

const connections = ref([])
const activeConnectionId = ref('')
const reviewRows = ref([])
const selectedReviewIds = ref([])
const showDisclaimer = ref(false)

const directionOptions = computed(() => [
  { value: 'all', label: t('settings_bank_sync.direction.all') },
  { value: 'income', label: t('settings_bank_sync.direction.income') },
  { value: 'expense', label: t('settings_bank_sync.direction.expense') },
])

const lookbackOptions = computed(() => [
  { value: 0, label: t('settings_bank_sync.lookback_days.option', { days: 0 }) },
  { value: 1, label: t('settings_bank_sync.lookback_days.option', { days: 1 }) },
  { value: 3, label: t('settings_bank_sync.lookback_days.option', { days: 3 }) },
  { value: 7, label: t('settings_bank_sync.lookback_days.option', { days: 7 }) },
])

const ledgerAccountOptions = computed(() => {
  const options = accountStore.accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }))
  return [{ value: '__none__', label: t('settings_bank_sync.account_sync.no_target') }, ...options]
})

const activeConnection = computed(() => {
  return connections.value.find((item) => item.id === activeConnectionId.value) ?? null
})

const selectedReviewIdSet = computed(() => new Set(selectedReviewIds.value))
const bankSyncCreateLink = computed(() => {
  return bankSyncApiReady ? { name: 'settings-bank-sync-create' } : { name: 'settings-bank-sync' }
})

function resolveBankSyncErrorMessage(error, fallbackKey) {
  if (error?.code === 'bank_sync_api_unavailable') return bankSyncApiMessage.value
  return error?.message || t(fallbackKey)
}

function readDisclaimerAccepted() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(DISCLAIMER_ACCEPTED_KEY) === '1'
}

function acceptDisclaimer() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DISCLAIMER_ACCEPTED_KEY, '1')
  }
  showDisclaimer.value = false
}

function normalizeConnectionForView(connection) {
  const accounts = Array.isArray(connection?.accounts)
    ? connection.accounts.map((account) => ({
      ...account,
      enabledBool: Boolean(Number(account?.enabled ?? 0)),
      mappedAccountIdDraft: String(account?.mapped_account_id ?? '__none__') || '__none__',
      userLabelDraft: String(account?.user_label ?? ''),
    }))
    : []

  const rule = connection?.rule ?? {}
  return {
    ...connection,
    accounts,
    ruleDraft: {
      direction: String(rule.direction ?? 'all'),
      excludeKeywordText: String(rule.excludeKeywordText ?? ''),
      minAmountMajor: Number(rule.minAmountMinor ?? 0) / 100,
      includePending: Boolean(rule.includePending),
      lookbackDays: Number(rule.lookbackDays ?? 3) || 3,
    },
  }
}

function normalizeActiveConnection() {
  if (!connections.value.length) {
    activeConnectionId.value = ''
    return
  }
  const exists = connections.value.some((item) => item.id === activeConnectionId.value)
  if (exists) return
  activeConnectionId.value = connections.value[0].id
}

async function reloadState({ loadReviewAfter = true } = {}) {
  if (!bankSyncApiReady) {
    connections.value = []
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }
  if (!ledgerStore.activeLedgerId) {
    connections.value = []
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }

  loadingState.value = true
  try {
    await accountStore.load()
    const state = await getBankSyncState(ledgerStore.activeLedgerId)
    connections.value = state.map(normalizeConnectionForView)
    normalizeActiveConnection()
    if (loadReviewAfter && activeConnectionId.value) {
      await loadReview(activeConnectionId.value)
    }
  } finally {
    loadingState.value = false
  }
}

async function syncConnection(connectionId) {
  syncingConnectionId.value = connectionId
  try {
    const result = await syncBankConnectionNow(ledgerStore.activeLedgerId, connectionId)
    uiStore.pushToast(t('settings_bank_sync.toast.sync_done', { added: result.added.length, modified: result.modified.length }))
    await reloadState({ loadReviewAfter: false })
    activeConnectionId.value = connectionId
    await loadReview(connectionId)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.sync_failed'), 'error')
  } finally {
    syncingConnectionId.value = ''
  }
}

async function disconnectConnection(connectionId) {
  if (!window.confirm(t('settings_bank_sync.confirm_disconnect'))) return
  disconnectingConnectionId.value = connectionId
  try {
    await disconnectBankConnection(ledgerStore.activeLedgerId, connectionId, {
      softDelete: false,
      clearMirrorData: true,
    })
    uiStore.pushToast(t('settings_bank_sync.toast.disconnected'))
    await reloadState({ loadReviewAfter: true })
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.disconnect_failed'), 'error')
  } finally {
    disconnectingConnectionId.value = ''
  }
}

async function saveAccount(connectionId, account) {
  savingAccountId.value = account.id
  try {
    await saveBankAccountSettings(ledgerStore.activeLedgerId, account.id, {
      enabled: account.enabledBool,
      mappedAccountId: account.mappedAccountIdDraft === '__none__' ? null : account.mappedAccountIdDraft,
      userLabel: account.userLabelDraft,
    })
    uiStore.pushToast(t('settings_bank_sync.toast.account_saved'))
    await reloadState({ loadReviewAfter: false })
    if (activeConnectionId.value === connectionId) {
      await loadReview(connectionId)
    }
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.account_save_failed'), 'error')
  } finally {
    savingAccountId.value = ''
  }
}

async function saveRule(connection) {
  savingRuleConnectionId.value = connection.id
  try {
    await saveBankSyncRuleSettings(ledgerStore.activeLedgerId, connection.id, {
      direction: connection.ruleDraft.direction,
      excludeKeywordText: connection.ruleDraft.excludeKeywordText,
      minAmountMinor: Math.round(Number(connection.ruleDraft.minAmountMajor ?? 0) * 100),
      includePending: connection.ruleDraft.includePending,
      lookbackDays: Number(connection.ruleDraft.lookbackDays ?? 3),
    })
    uiStore.pushToast(t('settings_bank_sync.toast.rule_saved'))
    await reloadState({ loadReviewAfter: false })
    if (activeConnectionId.value === connection.id) {
      await loadReview(connection.id)
    }
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.rule_save_failed'), 'error')
  } finally {
    savingRuleConnectionId.value = ''
  }
}

function openReview(connectionId) {
  activeConnectionId.value = connectionId
  void loadReview(connectionId)
}

async function loadReview(connectionId) {
  if (!connectionId) {
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }
  reviewLoading.value = true
  try {
    const rows = await listBankReviewTransactions(ledgerStore.activeLedgerId, {
      connectionId,
      includeImported: false,
      limit: 300,
    })
    reviewRows.value = rows
    selectedReviewIds.value = rows.filter((item) => item.defaultSelected).map((item) => item.id)
    await markBankReviewTransactionsSeen(ledgerStore.activeLedgerId, rows.map((item) => item.id))
  } finally {
    reviewLoading.value = false
  }
}

function selectAllReviewRows() {
  selectedReviewIds.value = reviewRows.value.map((item) => item.id)
}

function clearReviewSelection() {
  selectedReviewIds.value = []
}

function invertReviewSelection() {
  const set = new Set(selectedReviewIds.value)
  selectedReviewIds.value = reviewRows.value.map((item) => item.id).filter((id) => !set.has(id))
}

function toggleReviewSelection(id, event) {
  const checked = Boolean(event?.target?.checked)
  const set = new Set(selectedReviewIds.value)
  if (checked) set.add(id)
  else set.delete(id)
  selectedReviewIds.value = Array.from(set)
}

async function importSelected() {
  if (!selectedReviewIds.value.length) return
  importing.value = true
  try {
    const result = await importSelectedBankTransactions(ledgerStore.activeLedgerId, selectedReviewIds.value)
    uiStore.pushToast(t('settings_bank_sync.toast.import_done', { imported: result.importedCount, skipped: result.skippedCount }))
    await transactionStore.refreshAfterWriteSafe(2500)
    await loadReview(activeConnectionId.value)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.import_failed'), 'error')
  } finally {
    importing.value = false
  }
}

async function markSelectedSeen() {
  if (!selectedReviewIds.value.length) return
  markingSeen.value = true
  try {
    await markBankReviewTransactionsSeen(ledgerStore.activeLedgerId, selectedReviewIds.value)
    uiStore.pushToast(t('settings_bank_sync.toast.marked_seen'))
    await loadReview(activeConnectionId.value)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.mark_failed'), 'error')
  } finally {
    markingSeen.value = false
  }
}

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function formatAmountMinor(amountMinor, currency) {
  const value = Number(amountMinor ?? 0) / 100
  const safeCurrency = String(currency ?? '').trim().toUpperCase() || 'TWD'
  try {
    return new Intl.NumberFormat(locale.value, {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${safeCurrency}`
  }
}

function connectionStatusText(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'active') return t('settings_bank_sync.status.active')
  if (normalized === 'revoked') return t('settings_bank_sync.status.revoked')
  return t('settings_bank_sync.status.error')
}

function syncStatusText(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'ok') return t('settings_bank_sync.sync_status.ok')
  if (normalized === 'error') return t('settings_bank_sync.sync_status.error')
  return t('settings_bank_sync.sync_status.idle')
}

function reviewStatusText(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'posted') return t('settings_bank_sync.review.status.posted')
  if (normalized === 'reversed') return t('settings_bank_sync.review.status.reversed')
  return t('settings_bank_sync.review.status.pending')
}

onMounted(() => {
  showDisclaimer.value = !readDisclaimerAccepted()
  void reloadState({ loadReviewAfter: true })
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void reloadState({ loadReviewAfter: true })
  },
)
</script>

<style scoped>.notice-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, #000 42%, transparent)
}
.notice-dialog {
  width: min(100%, 420px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px
}
.notice-actions {
  justify-content: flex-end
}
.panel {
  padding: 14px
}
.page-head {
  justify-content: space-between;
  align-items: center
}
h2 {
  margin: 0
}
h3, h4 {
  margin: 0
}
.top-action-row {
  gap: 10px;
  flex-wrap: wrap;
  align-items: center
}
.bank-api-warning {
  margin: 8px 0 0
}
.disabled {
  pointer-events: none;
  opacity: 0.5
}
.connection-card {
  display: flex;
  flex-direction: column;
  gap: 12px
}
.connection-head {
  justify-content: space-between;
  align-items: center;
  gap: 12px
}
.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px
}
.title-wrap > small {
  font-size: 12px
}
.status-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--panel) 80%, transparent)
}
.status-active,
.status-ok,
.status-posted {
  color: #0f7a3f;
  background: color-mix(in srgb, #0f7a3f 16%, transparent)
}
.status-revoked,
.status-error,
.status-reversed {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 14%, transparent)
}
.status-pending,
.status-idle {
  color: #7a5200;
  background: color-mix(in srgb, #7a5200 14%, transparent)
}
.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px
}
.meta-list > li {
  display: flex;
  flex-direction: column;
  gap: 2px
}
.action-row {
  gap: 8px;
  flex-wrap: wrap
}
.sub-panel {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px
}
.account-row {
  border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  padding-top: 10px
}
.account-row:first-of-type {
  border-top: none;
  padding-top: 0
}
.account-enable {
  margin-bottom: 8px
}
.account-config {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end
}
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  align-items: end
}
.keyword-field {
  grid-column: 1 / -1
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px
}
.text-area {
  resize: vertical;
  min-height: 72px
}
.check-row {
  display: flex;
  align-items: center;
  gap: 8px
}
.review-panel {
  display: flex;
  flex-direction: column;
  gap: 10px
}
.review-head {
  justify-content: space-between;
  align-items: center;
  gap: 10px
}
.review-action-row {
  gap: 8px;
  flex-wrap: wrap
}
.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px
}
.review-item {
  border: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  border-radius: 10px;
  padding: 8px
}
.item-head {
  justify-content: space-between;
  gap: 10px
}
.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1
}
.item-body {
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px
}
@media (max-width: 860px) {
  .account-config {
    grid-template-columns: 1fr
  }
}
</style>
