<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_invoice_carrier.title', '電子發票載具') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>{{ t('settings_invoice_carrier.management_title', '載具管理') }}</h3>
      <p class="muted">{{ t('settings_invoice_carrier.management_desc', '連結台灣電子發票載具，匯入發票到帳目記錄') }}</p>
      <div class="row top-action-row">
        <RouterLink class="btn primary" to="/settings/invoice-carrier/new">
          {{ t('settings_invoice_carrier.add_carrier', '新增載具') }}
        </RouterLink>
        <button class="btn" :disabled="loading" :aria-busy="loading" @click="reloadState">
          {{ loading ? t('settings_invoice_carrier.refreshing') : t('settings_invoice_carrier.refresh') }}
        </button>
      </div>
    </article>

    <article v-if="!connections.length" class="card panel">
      <p class="muted">{{ t('settings_invoice_carrier.empty', '尚未新增任何載具') }}</p>
    </article>

    <article v-for="connection in connections" :key="connection.id" class="card panel connection-card">
      <header class="row connection-head">
        <div class="title-wrap">
          <h3>{{ connection.user_label || connection.mobile_phone }}</h3>
          <small class="muted">{{ connection.provider }}</small>
        </div>
        <span class="status-chip" :class="`status-${connection.status}`">
          {{ connection.status === 'active' ? '活躍' : '停用' }}
        </span>
      </header>

      <ul class="meta-list">
        <li>
          <span class="muted">最後同步</span>
          <strong>{{ formatDateTime(connection.last_sync_at) }}</strong>
        </li>
        <li>
          <span class="muted">同步狀態</span>
          <strong>{{ connection.last_sync_status || '未同步' }}</strong>
        </li>
      </ul>

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
import { RouterLink } from 'vue-router'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useI18n } from '@/ui/services/i18n.service'
import { computed, onMounted } from 'vue'

const { t } = useI18n()
const store = useInvoiceCarrierStore()

const connections = computed(() => store.connections)
const loading = computed(() => store.loading)

function formatDateTime(isoString) {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-TW')
}

async function reloadState() {
  await store.loadConnections()
}

onMounted(() => {
  store.loadConnections()
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2, h3 {
  margin: 0;
}

h2 {
  font-size: 18px;
}

.top-action-row {
  gap: 8px;
  margin-top: 12px;
}

.connection-card {
  margin-top: 12px;
}

.connection-head {
  margin-bottom: 12px;
  align-items: center;
  justify-content: space-between;
}

.title-wrap h3 {
  font-size: 14px;
  margin-bottom: 2px;
}

.title-wrap small {
  display: block;
  font-size: 12px;
}

.status-chip {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}

.status-active {
  background: color-mix(in srgb, var(--success) 12%, var(--card) 88%);
  color: var(--success);
}

.status-inactive {
  background: color-mix(in srgb, var(--muted) 12%, var(--card) 88%);
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
  align-items: center;
}

.connection-error {
  margin-top: 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
  border-radius: 6px;
  color: var(--error);
  font-size: 12px;
}

.action-row {
  gap: 8px;
  margin-top: 12px;
}

.btn {
  font-size: 13px;
  padding: 8px 12px;
}
</style>
