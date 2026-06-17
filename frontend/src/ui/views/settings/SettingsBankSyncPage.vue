<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-building-columns" class="title-icon" />{{ t('settings_bank_sync.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>{{ t('settings_bank_sync.management_title') }}</h3>
      <p class="muted">{{ t('settings_bank_sync.management_desc') }}</p>
      <div v-if="!hasBankSyncMembershipAccess" class="member-only-lock">
        <strong>{{ t('settings_bank_sync.member_only', '銀行同步僅限會員使用') }}</strong>
        <p class="muted compact">
          {{ t('settings_bank_sync.member_only_desc', '免費版可查看功能介紹，但建立連線、同步與匯入銀行交易都需要會員資格。') }}
        </p>
        <RouterLink class="btn" to="/settings/membership-benefits">
          {{ t('settings_bank_sync.view_membership', '查看會員權益') }}
        </RouterLink>
      </div>
      <template v-else>
        <p class="muted platform-note">{{ t('settings_bank_sync.platform_hint') }}</p>
        <p v-if="!bankSyncApiReady" class="muted bank-api-warning">{{ bankSyncApiMessage }}</p>
        <div class="row top-action-row">
          <RouterLink class="btn primary" :class="{ disabled: !bankSyncApiReady }" :to="bankSyncCreateLink">
            {{ t('settings_bank_sync.add_bank') }}
          </RouterLink>
          <button class="btn" :disabled="loadingState" :aria-busy="loadingState" @click="reloadState">
            {{ loadingState ? t('settings_bank_sync.refreshing') : t('settings_bank_sync.refresh') }}
          </button>
        </div>
      </template>
    </article>

    <article v-if="hasBankSyncMembershipAccess && !connections.length" class="card panel">
      <p class="muted">{{ t('settings_bank_sync.empty') }}</p>
    </article>

    <article v-for="connection in visibleConnections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div class="title-wrap">
          <h3>{{ connection.user_label || connection.provider }}</h3>
          <small class="muted">{{ connection.provider_connection_id }}</small>
        </div>
        <div class="chip-row">
          <span v-if="connection.pendingReviewCount > 0" class="status-chip pending-badge">
            {{ t('settings_bank_sync.summary.pending_review') }} {{ connection.pendingReviewCount }}
          </span>
          <span class="status-chip" :class="`status-${connection.status}`">{{ connectionStatusText(connection.status) }}</span>
        </div>
      </header>

      <article v-if="connection.isDeprecatedMock" class="deprecated-banner">
        <strong>{{ t('settings_bank_sync.deprecated_mock_title') }}</strong>
        <p class="muted compact">{{ t('settings_bank_sync.deprecated_mock_desc') }}</p>
      </article>

      <ul class="meta-list">
        <li>
          <span class="muted">{{ t('settings_bank_sync.meta.last_sync') }}</span>
          <strong>{{ formatDateTime(connection.last_sync_at) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_bank_sync.meta.sync_status') }}</span>
          <strong>{{ syncStatusText(connection.last_sync_status) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_bank_sync.summary.accounts', '銀行帳戶數') }}</span>
          <strong>{{ connection.accounts.length }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_bank_sync.summary.enabled_accounts', '已啟用同步') }}</span>
          <strong>{{ connection.enabledAccountCount }}</strong>
        </li>
      </ul>

      <p v-if="connection.last_error" class="muted connection-error">
        {{ connection.last_error }}
      </p>
      <p v-if="connection.needsReconnect" class="muted reconnect-hint">
        {{ t('settings_bank_sync.connection.error_hint') }}
      </p>

      <div class="row action-row">
        <RouterLink class="btn primary" :to="{ name: 'settings-bank-sync-connection', params: { id: connection.id } }">
          {{ connection.pendingReviewCount > 0 ? t('settings_bank_sync.actions.review') : t('settings_bank_sync.actions.open_connection', '開啟銀行頁面') }}
        </RouterLink>
      </div>
    </article>

    <AppDialog
      :open="showDisclaimer"
      :title="t('settings_bank_sync.disclaimer.title')"
      :message="disclaimerMessage"
      :cancel-text="t('common.close')"
      :confirm-text="t('settings_bank_sync.disclaimer.confirm')"
      @close="acceptDisclaimer"
      @confirm="acceptDisclaimer"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { getMembershipTierSnapshot, hasBankSyncMembershipAccess as hasBankSyncMembershipAccessForTier, subscribeMembershipSnapshot } from '@/core/services/membership.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useI18n } from '@/ui/services/i18n.service'
import { countBankReviewTransactionsByConnection, getBankSyncState } from '@/ui/services/bank-sync.service'
import { getBankSyncApiUnavailableMessage, isBankSyncApiConfigured } from '@/services/bank-sync/backend'
import { isMockProviderId, shouldRequireReconnectForStoredBankConnection } from '@/services/bank-sync/shared'

const { locale, t } = useI18n()
const ledgerStore = useLedgerStore()
const bankSyncApiReady = isBankSyncApiConfigured()
const bankSyncApiMessage = computed(() => getBankSyncApiUnavailableMessage())

const DISCLAIMER_ACCEPTED_KEY = 'strawmoneybook.bank_sync.disclaimer.accepted'

const loadingState = ref(false)
const connections = ref([])
const showDisclaimer = ref(false)
const membershipTier = ref(getMembershipTierSnapshot())

const hasBankSyncMembershipAccess = computed(() => hasBankSyncMembershipAccessForTier(membershipTier.value))
const visibleConnections = computed(() => (hasBankSyncMembershipAccess.value ? connections.value : []))

const bankSyncCreateLink = computed(() => {
  return bankSyncApiReady ? { name: 'settings-bank-sync-create' } : { name: 'settings-bank-sync' }
})

const disclaimerMessage = computed(() => {
  return `${t('settings_bank_sync.disclaimer.line_1')}\n${t('settings_bank_sync.disclaimer.line_2')}`
})

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

function normalizeConnectionForView(connection, pendingReviewCount = 0) {
  const accounts = Array.isArray(connection?.accounts) ? connection.accounts : []
  return {
    ...connection,
    accounts,
    enabledAccountCount: accounts.filter((account) => Boolean(Number(account?.enabled ?? 0))).length,
    pendingReviewCount,
    isDeprecatedMock: isMockProviderId(connection?.provider),
    needsReconnect: shouldRequireReconnectForStoredBankConnection(
      connection?.provider,
      connection?.status,
      connection?.last_error,
    ),
  }
}

async function reloadState() {
  if (!bankSyncApiReady || !ledgerStore.activeLedgerId || !hasBankSyncMembershipAccess.value) {
    connections.value = []
    return
  }

  loadingState.value = true
  try {
    const state = await getBankSyncState(ledgerStore.activeLedgerId)
    const bundles = await Promise.all(state.map(async (connection) => {
      const pendingReviewCount = await countBankReviewTransactionsByConnection(
        ledgerStore.activeLedgerId,
        connection.id,
      )
      return normalizeConnectionForView(connection, pendingReviewCount)
    }))
    connections.value = bundles
  } finally {
    loadingState.value = false
  }
}

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
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

onMounted(() => {
  unsubscribeMembership = subscribeMembershipSnapshot((next) => {
    membershipTier.value = String(next?.tier ?? getMembershipTierSnapshot())
  }, { emitCurrent: true })
  showDisclaimer.value = hasBankSyncMembershipAccess.value && !readDisclaimerAccepted()
  void reloadState()
})

let unsubscribeMembership = null

onBeforeUnmount(() => {
  if (typeof unsubscribeMembership === 'function') {
    unsubscribeMembership()
  }
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void reloadState()
  },
)

watch(
  () => hasBankSyncMembershipAccess.value,
  (allowed) => {
    if (!allowed) {
      connections.value = []
      showDisclaimer.value = false
      return
    }
    showDisclaimer.value = !readDisclaimerAccepted()
    void reloadState()
  },
)
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.page-head {
  justify-content: space-between;
  align-items: center;
}

h2,
h3 {
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

.top-action-row,
.action-row {
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.platform-note,
.bank-api-warning,
.connection-error,
.reconnect-hint {
  margin: 0;
}

.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.member-only-lock,
.deprecated-banner {
  margin-top: 2px;
  padding: 12px;
  border-radius: 14px;
  display: grid;
  gap: 8px;
  background: color-mix(in srgb, var(--primary) 12%, var(--card));
}

.connection-card {
  display: grid;
  gap: 12px;
}

.connection-head {
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.title-wrap,
.chip-row {
  display: grid;
  gap: 4px;
}

.chip-row {
  justify-items: end;
}

.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.meta-list > li {
  display: grid;
  gap: 2px;
}

.status-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--panel) 80%, transparent);
}

.pending-badge {
  color: #8a4b00;
  background: color-mix(in srgb, #f5a623 20%, transparent);
}

.status-active {
  color: #0f7a3f;
  background: color-mix(in srgb, #0f7a3f 16%, transparent);
}

.status-revoked,
.status-error {
  color: #b3261e;
  background: color-mix(in srgb, #b3261e 14%, transparent);
}
</style>
