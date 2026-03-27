<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('invoice_carrier.title', '發票載具') }}</h2>
      <RouterLink class="btn back-btn" to="/features">{{ t('common.back') }}</RouterLink>
    </header>

    <article v-if="featureEnabled" class="card panel">
      <p class="muted">{{ t('invoice_carrier.management_desc', '管理 Android App 內的手機條碼登入、同步條件與本地鏡像發票。') }}</p>
      <p v-if="!apiReady" class="muted warning-text">{{ apiUnavailableMessage }}</p>
      <div class="row action-row">
        <RouterLink class="btn primary" :class="{ disabled: !apiReady }" :to="{ name: 'invoice-carriers-create' }">
          {{ t('invoice_carrier.add_connection', '新增載具') }}
        </RouterLink>
        <button class="btn" :disabled="loading" :aria-busy="loading" @click="reload">
          {{ loading ? t('common.loading', '載入中...') : t('common.refresh', '重新整理') }}
        </button>
      </div>
    </article>

    <article v-if="!connections.length" class="card panel">
      <p class="muted">{{ t('invoice_carrier.empty', '尚未新增任何發票載具。') }}</p>
    </article>

    <article v-for="connection in connections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div>
          <h3>{{ connection.user_label || connection.provider_connection_id }}</h3>
          <small class="muted">{{ connection.provider_connection_id }}</small>
        </div>
        <span class="status-chip" :class="`status-${connection.status}`">{{ statusLabel(connection.status) }}</span>
      </header>

      <ul class="meta-list">
        <li>
          <span class="muted">{{ t('invoice_carrier.meta.last_sync', '上次同步') }}</span>
          <strong>{{ formatDateTime(connection.last_sync_at) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('invoice_carrier.meta.sync_status', '同步狀態') }}</span>
          <strong>{{ syncStatusLabel(connection.last_sync_status) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('invoice_carrier.meta.total_invoices', '本地發票數') }}</span>
          <strong>{{ connection.totalInvoiceCount }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('invoice_carrier.meta.unviewed_invoices', '未檢視') }}</span>
          <strong>{{ connection.unviewedInvoiceCount }}</strong>
        </li>
      </ul>

      <p v-if="connection.last_error" class="muted error-text">{{ connection.last_error }}</p>

      <div class="row action-row">
        <RouterLink class="btn primary" :to="{ name: 'invoice-carriers-detail', params: { id: connection.id } }">
          {{ t('invoice_carrier.open_detail', '開啟載具頁') }}
        </RouterLink>
        <button
          class="btn"
          :disabled="syncingConnectionId === connection.id || !apiReady"
          :aria-busy="syncingConnectionId === connection.id"
          @click="syncNow(connection.id)"
        >
          {{ syncingConnectionId === connection.id ? t('invoice_carrier.syncing', '同步中...') : t('invoice_carrier.sync_now', '立即同步') }}
        </button>
        <RouterLink v-if="connection.status === 'reauth_required'" class="btn" :to="{ name: 'invoice-carriers-create', query: { connectionId: connection.id } }">
          {{ t('invoice_carrier.reauth', '重新驗證') }}
        </RouterLink>
        <button
          class="btn danger"
          :disabled="disconnectingConnectionId === connection.id"
          :aria-busy="disconnectingConnectionId === connection.id"
          @click="removeConnection(connection)"
        >
          {{ disconnectingConnectionId === connection.id ? t('common.processing', '處理中') : t('common.delete', '刪除') }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import { disconnectInvoiceCarrier, getInvoiceCarrierState, syncInvoiceCarrierNow } from '@/ui/services/einvoice-carrier.service'
import {
  getEinvoiceCarrierApiUnavailableMessage,
  isEinvoiceCarrierApiConfigured,
  isEinvoiceCarrierFeatureEnabled,
} from '@/services/einvoice-carrier/backend'

const router = useRouter()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { locale, t } = useI18n()

const featureEnabled = isEinvoiceCarrierFeatureEnabled()
const apiReady = isEinvoiceCarrierApiConfigured()
const apiUnavailableMessage = getEinvoiceCarrierApiUnavailableMessage()
const loading = ref(false)
const syncingConnectionId = ref('')
const disconnectingConnectionId = ref('')
const connections = ref([])

function formatDateTime(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(locale.value)
}

function statusLabel(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'active') return t('invoice_carrier.status.active', '正常')
  if (normalized === 'reauth_required') return t('invoice_carrier.status.reauth_required', '需要重新驗證')
  return t('invoice_carrier.status.disabled', '已停用')
}

function syncStatusLabel(status) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'ok') return t('invoice_carrier.sync_status.ok', '成功')
  if (normalized === 'error') return t('invoice_carrier.sync_status.error', '失敗')
  return t('invoice_carrier.sync_status.idle', '尚未同步')
}

async function reload() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    connections.value = []
    return
  }
  loading.value = true
  try {
    connections.value = await getInvoiceCarrierState(ledgerId)
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '載入發票載具失敗'), 'error')
  } finally {
    loading.value = false
  }
}

async function syncNow(connectionId) {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  syncingConnectionId.value = connectionId
  try {
    const result = await syncInvoiceCarrierNow(ledgerId, connectionId)
    uiStore.pushToast(t('invoice_carrier.toast.sync_done', { count: result.syncedCount }, '已同步 {count} 筆發票'))
    await reload()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '發票載具同步失敗'), 'error')
    if (String(error?.code ?? '') === 'einvoice_session_expired') {
      await router.push({ name: 'invoice-carriers-create', query: { connectionId } })
    }
  } finally {
    syncingConnectionId.value = ''
  }
}

async function removeConnection(connection) {
  if (!window.confirm(`確定要刪除「${connection.user_label || connection.provider_connection_id}」嗎？`)) {
    return
  }
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) return
  disconnectingConnectionId.value = connection.id
  try {
    await disconnectInvoiceCarrier(ledgerId, connection.id)
    uiStore.pushToast(t('invoice_carrier.toast.deleted', '已刪除發票載具'))
    await reload()
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? '刪除發票載具失敗'), 'error')
  } finally {
    disconnectingConnectionId.value = ''
  }
}

onMounted(() => {
  if (!featureEnabled) {
    void router.replace({ name: 'features' })
    return
  }
  void reload()
})
</script>

<style scoped>
.panel {
  padding: 14px;
}
.page-head {
  align-items: center;
}
.connection-card {
  display: grid;
  gap: 12px;
}
.connection-head {
  align-items: flex-start;
}
.meta-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.meta-list li {
  display: grid;
  gap: 2px;
}
.warning-text,
.error-text {
  margin: 0;
}
.action-row {
  gap: 8px;
  flex-wrap: wrap;
}
.status-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.status-active {
  background: color-mix(in srgb, var(--ok) 14%, transparent);
  color: var(--ok);
}
.status-reauth_required {
  background: color-mix(in srgb, var(--warn) 16%, transparent);
  color: var(--warn);
}
.status-disabled {
  background: color-mix(in srgb, var(--muted) 16%, transparent);
  color: var(--muted);
}
.danger {
  color: var(--danger, #b42318);
}
</style>
