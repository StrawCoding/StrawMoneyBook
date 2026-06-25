<template>
  <section class="stack">
    <header class="row page-head">
      <div class="title-wrap">
        <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-building-columns" class="title-icon" />{{ pageTitle }}</h2>
        <small v-if="connection" class="muted">{{ connection.provider_connection_id }}</small>
      </div>
      <RouterLink class="btn back-btn" to="/settings/bank-sync">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="!connection && !loadingState" class="card panel">
      <template v-if="!hasBankSyncMembershipAccess">
        <h3>{{ t('settings_bank_sync.member_only', '銀行同步僅限會員使用') }}</h3>
        <p class="muted">{{ t('settings_bank_sync.member_only_desc', '免費版可查看功能介紹，但建立連線、同步與匯入銀行交易都需要會員資格。') }}</p>
        <RouterLink class="btn" to="/settings/membership-benefits">
          {{ t('settings_bank_sync.view_membership', '查看會員權益') }}
        </RouterLink>
      </template>
      <template v-else>
      <h3>{{ t('settings_bank_sync.connection.not_found', '找不到這組銀行連線') }}</h3>
      <p class="muted">{{ t('settings_bank_sync.connection.not_found_desc', '這筆銀行連線可能已被移除，請返回銀行同步列表重新確認。') }}</p>
      </template>
    </article>

    <template v-else-if="connection">
      <article v-if="!hasSyncableAccount(connection)" class="card panel mapping-banner">
        <p class="muted">{{ t('settings_bank_sync.account_sync.mapping_banner') }}</p>
      </article>

      <article class="card panel connection-card">
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
          <button
            class="btn primary"
            :disabled="syncingConnectionId === connection.id || !canSyncConnection(connection)"
            :aria-busy="syncingConnectionId === connection.id"
            @click="syncConnection(connection.id)"
          >
            {{ syncingConnectionId === connection.id ? t('settings_bank_sync.actions.syncing') : t('settings_bank_sync.actions.sync_now') }}
          </button>
          <button
            class="btn"
            :disabled="disconnectingConnectionId === connection.id"
            :aria-busy="disconnectingConnectionId === connection.id"
            @click="openDisconnectDialog"
          >
            {{ disconnectingConnectionId === connection.id ? t('settings_bank_sync.actions.deleting') : t('settings_bank_sync.actions.delete') }}
          </button>
        </div>

        <p v-if="!hasSyncableAccount(connection)" class="muted connection-hint">
          {{ t('settings_bank_sync.account_sync.required_hint') }}
        </p>
        <p v-else-if="shouldRequireReconnect(connection)" class="muted connection-hint">
          {{ t('settings_bank_sync.connection.error_hint') }}
        </p>
        <p v-else-if="String(connection.status ?? '').toLowerCase() === 'error'" class="muted connection-hint">
          {{ t('settings_bank_sync.connection.retry_hint') }}
        </p>
      </article>

      <article class="card panel">
        <section class="sub-panel">
          <div class="row section-head">
            <h4>{{ t('settings_bank_sync.account_sync.title') }}</h4>
            <button
              class="btn"
              :disabled="savingAllAccounts"
              :aria-busy="savingAllAccounts"
              @click="saveAllAccounts(connection.id)"
            >
              {{ savingAllAccounts ? t('settings_bank_sync.common.saving') : t('settings_bank_sync.account_sync.save_all') }}
            </button>
          </div>
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
      </article>

      <article class="card panel accordion-panel">
        <button class="accordion-toggle" type="button" @click="showAdvancedSettings = !showAdvancedSettings">
          <span>{{ t('settings_bank_sync.advanced_settings') }}</span>
          <span>{{ showAdvancedSettings ? '−' : '+' }}</span>
        </button>

        <template v-if="showAdvancedSettings">
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

        <section class="sub-panel">
          <h4>{{ t('settings_bank_sync.import_rule.title', '銀行匯入自動規則') }}</h4>
          <p class="muted">
            {{ t('settings_bank_sync.import_rule.desc', '匯入銀行交易時會套用「自動識別」規則。若建立轉帳規則並把來源帳戶留空，就會沿用目前這個銀行對應帳戶。') }}
          </p>
          <div class="row action-row">
            <RouterLink class="btn" :to="{ name: 'settings-auto-fill-rules' }">
              {{ t('settings_bank_sync.import_rule.manage', '管理自動識別規則') }}
            </RouterLink>
          </div>
        </section>
        </template>
      </article>

      <article class="card panel">
        <section class="sub-panel">
          <h4>{{ t('settings_bank_sync.csv_import.title') }}</h4>
          <p class="muted">{{ t('settings_bank_sync.csv_import.desc') }}</p>
          <label class="field">
            {{ t('settings_bank_sync.csv_import.account') }}
            <CustomSelect v-model="csvImportBankAccountId" :options="csvImportAccountOptions" :placeholder="t('settings_bank_sync.csv_import.choose_account')" />
          </label>
          <input ref="csvInputRef" class="input" type="file" accept=".csv,text/csv" @change="onImportCsvFile" />
          <div class="row action-row">
            <button class="btn" :disabled="importingCsv || !csvImportBankAccountId" :aria-busy="importingCsv" @click="openCsvImportPicker">
              {{ importingCsv ? t('settings_bank_sync.csv_import.importing') : t('settings_bank_sync.csv_import.import') }}
            </button>
          </div>
        </section>
      </article>

      <article class="card panel review-panel">
        <header class="row review-head">
          <h3>{{ t('settings_bank_sync.review.title', { name: connection.user_label || connection.provider }) }}</h3>
          <button class="btn" :disabled="reviewLoading" :aria-busy="reviewLoading" @click="loadReview(connection.id)">
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
                <div>{{ row.summary || row.merchant || row.description || t('settings_bank_sync.review.no_description') }}</div>
                <small v-if="row.transaction_type" class="muted">
                  {{ t('settings_bank_sync.review.transaction_type') }}: {{ row.transaction_type }}
                </small>
                <small v-if="row.note" class="muted">
                  {{ t('settings_bank_sync.review.note') }}: {{ row.note }}
                </small>
                <small v-if="row.balance_minor !== null && row.balance_minor !== undefined" class="muted">
                  {{ t('settings_bank_sync.review.balance') }}: {{ formatAmountMinor(row.balance_minor, row.currency) }}
                </small>
                <small class="muted">
                  {{ row.bank_account_user_label || row.bank_account_name || '-' }}
                  → {{ row.mapped_account_name || t('settings_bank_sync.review.unmapped_account') }}
                </small>
              </div>
            </li>
          </ul>
        </template>
      </article>
    </template>

    <AppDialog
      :open="disconnectDialogOpen"
      :title="t('settings_bank_sync.delete_dialog.title', '確認刪除銀行連線')"
      :message="t('settings_bank_sync.confirm_delete')"
      :confirm-text="t('settings_bank_sync.actions.delete')"
      :loading="disconnectingConnectionId === connection?.id"
      @close="disconnectDialogOpen = false"
      @confirm="confirmDisconnect"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { getMembershipTierSnapshot, hasBankSyncMembershipAccess as hasBankSyncMembershipAccessForTier, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { shouldRequireReconnectForStoredBankConnection } from '@/services/bank-sync/shared'
import {
  disconnectBankConnection,
  getBankSyncConnectionDetail,
  importBankStatementCsv,
  importSelectedBankTransactions,
  listBankReviewTransactions,
  markBankReviewTransactionsSeen,
  saveBankAccountSettings,
  saveBankAccountsSettings,
  saveBankSyncRuleSettings,
  syncBankConnectionNow,
} from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage } from '@/services/bank-sync/backend'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const transactionStore = useTransactionStore()
const uiStore = useUiStore()

const connection = ref(null)
const loadingState = ref(false)
const syncingConnectionId = ref('')
const disconnectingConnectionId = ref('')
const savingAccountId = ref('')
const savingAllAccounts = ref(false)
const savingRuleConnectionId = ref('')
const showAdvancedSettings = ref(false)
const reviewLoading = ref(false)
const importing = ref(false)
const markingSeen = ref(false)
const reviewRows = ref([])
const selectedReviewIds = ref([])
const disconnectDialogOpen = ref(false)
const csvInputRef = ref(null)
const csvImportBankAccountId = ref('')
const importingCsv = ref(false)
const membershipTier = ref(getMembershipTierSnapshot())

const pageTitle = computed(() => {
  return connection.value?.user_label || connection.value?.provider || t('settings_bank_sync.connection.page_title', '銀行同步')
})
const hasBankSyncMembershipAccess = computed(() => hasBankSyncMembershipAccessForTier(membershipTier.value))

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

const csvImportAccountOptions = computed(() => {
  const accounts = Array.isArray(connection.value?.accounts) ? connection.value.accounts : []
  return accounts.map((account) => ({
    value: account.id,
    label: `${account.account_name}（${account.account_mask || '-'}）`,
  }))
})

const selectedReviewIdSet = computed(() => new Set(selectedReviewIds.value))

function resolveBankSyncErrorMessage(error, fallbackKey) {
  if (error?.code === 'bank_sync_api_unavailable') return getBankSyncApiUnavailableMessage()
  return error?.message || t(fallbackKey)
}

function normalizeConnectionForView(source) {
  if (!source) return null
  const accounts = Array.isArray(source?.accounts)
    ? source.accounts.map((account) => ({
      ...account,
      enabledBool: Boolean(Number(account?.enabled ?? 0)),
      mappedAccountIdDraft: String(account?.mapped_account_id ?? '__none__') || '__none__',
      userLabelDraft: String(account?.user_label ?? ''),
    }))
    : []

  const rule = source?.rule ?? {}
  return {
    ...source,
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

function hasSyncableAccount(currentConnection) {
  return Array.isArray(currentConnection?.accounts) && currentConnection.accounts.some((account) => {
    const mappedAccountId = String(account?.mappedAccountIdDraft ?? account?.mapped_account_id ?? '').trim()
    return Boolean(account?.enabledBool ?? Number(account?.enabled ?? 0))
      && Boolean(mappedAccountId)
      && mappedAccountId !== '__none__'
  })
}

function shouldRequireReconnect(currentConnection) {
  return shouldRequireReconnectForStoredBankConnection(
    currentConnection?.provider,
    currentConnection?.status,
    currentConnection?.last_error,
  )
}

function canSyncConnection(currentConnection) {
  return hasSyncableAccount(currentConnection)
    && !shouldRequireReconnect(currentConnection)
}

async function loadConnection({ loadReviewAfter = true } = {}) {
  const connectionId = String(route.params.id ?? '').trim()
  if (!ledgerStore.activeLedgerId || !connectionId || !hasBankSyncMembershipAccess.value) {
    connection.value = null
    reviewRows.value = []
    selectedReviewIds.value = []
    return
  }

  loadingState.value = true
  try {
    await accountStore.load()
    const detail = await getBankSyncConnectionDetail(ledgerStore.activeLedgerId, connectionId)
    connection.value = normalizeConnectionForView(detail)
    if (!csvImportBankAccountId.value && connection.value?.accounts?.length) {
      csvImportBankAccountId.value = connection.value.accounts[0].id
    }
    if (connection.value && loadReviewAfter) {
      await loadReview(connection.value.id)
    } else if (!connection.value) {
      reviewRows.value = []
      selectedReviewIds.value = []
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
    await loadConnection({ loadReviewAfter: false })
    await loadReview(connectionId)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.sync_failed'), 'error')
  } finally {
    syncingConnectionId.value = ''
  }
}

function openDisconnectDialog() {
  disconnectDialogOpen.value = true
}

async function confirmDisconnect() {
  if (!connection.value) return
  disconnectingConnectionId.value = connection.value.id
  try {
    await disconnectBankConnection(ledgerStore.activeLedgerId, connection.value.id, {
      softDelete: true,
      clearMirrorData: true,
    })
    uiStore.pushToast(t('settings_bank_sync.toast.deleted'))
    disconnectDialogOpen.value = false
    await router.push({ name: 'settings-bank-sync' })
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.delete_failed'), 'error')
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
    await loadConnection({ loadReviewAfter: false })
    await loadReview(connectionId)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.account_save_failed'), 'error')
  } finally {
    savingAccountId.value = ''
  }
}

async function saveAllAccounts(connectionId) {
  if (!connection.value) return
  savingAllAccounts.value = true
  try {
    await saveBankAccountsSettings(
      ledgerStore.activeLedgerId,
      connection.value.accounts.map((account) => ({
        bankAccountId: account.id,
        enabled: account.enabledBool,
        mappedAccountId: account.mappedAccountIdDraft === '__none__' ? null : account.mappedAccountIdDraft,
        userLabel: account.userLabelDraft,
      })),
    )
    uiStore.pushToast(t('settings_bank_sync.toast.account_saved'))
    await loadConnection({ loadReviewAfter: false })
    await loadReview(connectionId)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.account_save_failed'), 'error')
  } finally {
    savingAllAccounts.value = false
  }
}

async function saveRule(currentConnection) {
  savingRuleConnectionId.value = currentConnection.id
  try {
    await saveBankSyncRuleSettings(ledgerStore.activeLedgerId, currentConnection.id, {
      direction: currentConnection.ruleDraft.direction,
      excludeKeywordText: currentConnection.ruleDraft.excludeKeywordText,
      minAmountMinor: Math.round(Number(currentConnection.ruleDraft.minAmountMajor ?? 0) * 100),
      includePending: currentConnection.ruleDraft.includePending,
      lookbackDays: Number(currentConnection.ruleDraft.lookbackDays ?? 3),
    })
    uiStore.pushToast(t('settings_bank_sync.toast.rule_saved'))
    await loadConnection({ loadReviewAfter: false })
    await loadReview(currentConnection.id)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.rule_save_failed'), 'error')
  } finally {
    savingRuleConnectionId.value = ''
  }
}

function openCsvImportPicker() {
  csvInputRef.value?.click()
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file)
  })
}

async function onImportCsvFile(event) {
  const file = event?.target?.files?.[0]
  event.target.value = ''
  if (!file || !connection.value || !csvImportBankAccountId.value) return

  importingCsv.value = true
  try {
    const csvText = await readFileAsText(file)
    const result = await importBankStatementCsv(
      ledgerStore.activeLedgerId,
      connection.value.id,
      csvImportBankAccountId.value,
      csvText,
    )
    uiStore.pushToast(t('settings_bank_sync.toast.csv_import_done', {
      added: result.addedCount,
      skipped: result.skippedCount,
    }))
    await loadReview(connection.value.id)
  } catch (error) {
    uiStore.pushToast(resolveBankSyncErrorMessage(error, 'settings_bank_sync.toast.csv_import_failed'), 'error')
  } finally {
    importingCsv.value = false
  }
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
    if (result.importedCount > 0) {
      await router.push({ name: 'transaction-search' })
    } else {
      await transactionStore.refreshAfterWriteSafe(2500)
      await loadReview(connection.value?.id)
    }
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
    await loadReview(connection.value?.id)
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
  unsubscribeMembership = subscribeMembershipSnapshot((next) => {
    membershipTier.value = String(next?.tier ?? getMembershipTierSnapshot())
  }, { emitCurrent: true })
  void loadConnection()
})

let unsubscribeMembership = null

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') {
    unsubscribeMembership()
  }
})

watch(
  () => [ledgerStore.activeLedgerId, route.params.id],
  () => {
    disconnectDialogOpen.value = false
    void loadConnection()
  },
)

watch(
  () => hasBankSyncMembershipAccess.value,
  () => {
    disconnectDialogOpen.value = false
    void loadConnection()
  },
)
</script>

<style scoped>
.panel {
  padding: 14px;
}

.page-head,
.connection-head,
.review-head {
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

h2,
h3,
h4 {
  margin: 0;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
}

.mapping-banner {
  background: color-mix(in srgb, var(--primary) 10%, var(--card));
}

.section-head {
  justify-content: space-between;
  align-items: center;
}

.accordion-panel {
  display: grid;
  gap: 10px;
}

.accordion-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
}

.connection-card,
.review-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title-wrap {
  display: grid;
  gap: 4px;
}

.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.meta-list > li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-row,
.review-action-row {
  gap: 8px;
  flex-wrap: wrap;
}

.connection-hint {
  margin: 0;
}

.sub-panel {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-row {
  border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  padding-top: 10px;
}

.account-row:first-of-type {
  border-top: none;
  padding-top: 0;
}

.account-enable {
  margin-bottom: 8px;
}

.account-config {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  align-items: end;
}

.keyword-field {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.text-area {
  resize: vertical;
  min-height: 72px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.review-item {
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.item-head {
  justify-content: space-between;
  align-items: flex-start;
}

.item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.item-body {
  display: grid;
  gap: 4px;
}

.status-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--panel) 80%, transparent);
}

.status-active,
.status-ok,
.status-posted {
  color: #0f7a3f;
  background: color-mix(in srgb, #0f7a3f 16%, transparent);
}

.status-revoked,
.status-error,
.status-reversed {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 14%, transparent);
}

.status-pending,
.status-idle {
  color: #7a5200;
  background: color-mix(in srgb, #7a5200 14%, transparent);
}

@media (max-width: 860px) {
  .account-config {
    grid-template-columns: 1fr;
  }
}
</style>
