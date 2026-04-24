<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_invoice_carrier.title', '電子發票載具') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel intro-panel">
      <div class="eyebrow">實驗性</div>
      <h3>{{ t('settings_invoice_carrier.management_title', '電子發票載具匯入') }}</h3>
      <p class="muted">
        {{ t('settings_invoice_carrier.management_desc', '目前正式支援 Android App 端內自動化。建立或重新驗證載具時，App 會直接在原生 WebView 內完成登入、驗證碼辨識、查詢與狀態保存。') }}
      </p>
      <p class="muted experimental-note">
        {{ t('settings_invoice_carrier.experimental_note', 'Web 僅提供診斷與說明；若站點流程變動導致自動化失效，狀態會改成「需重新驗證」或「自動化受阻」，不會偽裝成成功。') }}
      </p>
      <p v-if="!invoiceCarrierAutomationReady" class="warning-note">
        {{ invoiceCarrierApiMessage }}
      </p>
      <div class="row top-action-row">
        <RouterLink class="btn primary" :to="{ name: 'settings-invoice-carrier-create' }">
          {{ t('settings_invoice_carrier.add_carrier', '新增載具') }}
        </RouterLink>
        <button class="btn" :disabled="loadingState" :aria-busy="loadingState" @click="reloadState">
          {{ loadingState ? t('settings_invoice_carrier.refreshing', '重新整理中...') : t('settings_invoice_carrier.refresh', '重新整理') }}
        </button>
      </div>
    </article>

    <article v-if="store.error" class="card panel error-panel">
      <strong>{{ store.error }}</strong>
    </article>

    <article v-if="!connections.length" class="card panel">
      <p class="muted">{{ t('settings_invoice_carrier.empty', '尚未新增任何載具') }}</p>
    </article>

    <article v-for="connection in connections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div class="title-wrap">
          <h3>{{ connection.user_label || connection.mobile_phone }}</h3>
          <small class="muted">{{ connection.provider_connection_id || connection.provider }}</small>
        </div>
        <span class="status-chip" :class="`status-${connection.status}`">
          {{ connectionStatusText(connection.status) }}
        </span>
      </header>

      <ul class="meta-list">
        <li>
          <span class="muted">最後同步</span>
          <strong>{{ formatDateTime(connection.last_sync_at) }}</strong>
        </li>
        <li>
          <span class="muted">同步狀態</span>
          <strong>{{ syncStatusText(connection.last_sync_status) }}</strong>
        </li>
        <li>
          <span class="muted">可用載具</span>
          <strong>{{ Array.isArray(connection.carrier_options) ? connection.carrier_options.length : 0 }}</strong>
        </li>
      </ul>

      <p v-if="connection.status === 'reauth_required'" class="reauth-note">
        這組載具需要重新驗證後才能再同步。
      </p>
      <p v-else-if="connection.status === 'automation_blocked'" class="reauth-note">
        電子發票網站流程目前阻擋自動化，請在 Android App 內重新驗證或稍後再試。
      </p>
      <p v-if="connection.last_error" class="muted connection-error">
        {{ connection.last_error }}
      </p>

      <div class="row action-row">
        <RouterLink class="btn primary" :to="{ name: 'settings-invoice-carrier-connection', params: { id: connection.id } }">
          開啟
        </RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getInvoiceCarrierApiUnavailableMessage,
  isInvoiceCarrierApiConfigured,
} from '@/services/invoice-carrier/backend'

const { locale, t } = useI18n()
const store = useInvoiceCarrierStore()
const invoiceCarrierAutomationReady = isInvoiceCarrierApiConfigured()
const invoiceCarrierApiMessage = computed(() => getInvoiceCarrierApiUnavailableMessage())
const connections = computed(() => store.connections)
const loadingState = computed(() => store.loading)

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function connectionStatusText(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'connecting') return '連線中'
  if (normalized === 'syncing') return '同步中'
  if (normalized === 'reauth_required') return '需重新驗證'
  if (normalized === 'automation_blocked') return '自動化受阻'
  if (normalized === 'error') return '同步失敗'
  if (normalized === 'inactive') return '已停用'
  return '正常'
}

function syncStatusText(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'ok') return '成功'
  if (normalized === 'error') return '失敗'
  return '尚未同步'
}

async function reloadState() {
  await store.loadConnections()
}

onMounted(() => {
  void reloadState()
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.page-head,
.connection-head {
  justify-content: space-between;
  align-items: center;
}

h2,
h3 {
  margin: 0;
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--primary);
}

.muted {
  color: var(--muted);
}

.experimental-note,
.warning-note,
.connection-error,
.reauth-note {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.experimental-note {
  background: color-mix(in srgb, var(--primary) 10%, var(--card) 90%);
}

.warning-note,
.reauth-note {
  background: color-mix(in srgb, #e8a317 14%, var(--card) 86%);
}

.connection-error,
.error-panel {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
}

.top-action-row,
.action-row {
  gap: 10px;
  flex-wrap: wrap;
}

.title-wrap {
  min-width: 0;
}

.title-wrap small {
  display: block;
}

.status-chip {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  background: color-mix(in srgb, var(--success) 14%, var(--card) 86%);
  color: var(--success);
}

.status-error,
.status-reauth_required,
.status-automation_blocked {
  background: color-mix(in srgb, #e8a317 18%, var(--card) 82%);
  color: #8a5a00;
}

.status-connecting,
.status-syncing {
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
  color: var(--primary);
}

.status-inactive {
  background: color-mix(in srgb, var(--muted) 14%, var(--card) 86%);
  color: var(--muted);
}

.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.meta-list li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
</style>
