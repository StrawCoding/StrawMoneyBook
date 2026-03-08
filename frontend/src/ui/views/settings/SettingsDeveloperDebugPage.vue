<template>
  <section class="stack">
    <header class="row page-header">
      <h2 class="page-title">{{ t('debug_page.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings/version-info">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <p class="muted subtitle">{{ t('debug_page.subtitle') }}</p>

      <div class="action-row">
        <button class="btn" :disabled="loading" @click="refresh">{{ t('debug_page.refresh') }}</button>
      </div>

      <div class="detail-grid">
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.tier') }}</small>
          <strong>{{ snapshot.tier || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.plan') }}</small>
          <strong>{{ snapshot.plan || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.active') }}</small>
          <strong>{{ String(Boolean(snapshot.active)) }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.source') }}</small>
          <strong>{{ snapshot.source || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.reason') }}</small>
          <strong class="break-all">{{ snapshot.reason || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.cache_expires') }}</small>
          <strong class="break-all">{{ snapshot.membershipCacheExpiresAt || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.last_sync_at') }}</small>
          <strong class="break-all">{{ snapshot.lastSyncAt || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.last_sync_status') }}</small>
          <strong>{{ snapshot.lastSyncStatus || '-' }}</strong>
        </div>
        <div class="detail-row">
          <small class="muted">{{ t('debug_page.key.play_supported') }}</small>
          <strong>{{ String(playSupported) }}</strong>
        </div>
      </div>

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.key.play_calls') }}</small>
      </div>
      <div v-if="!playCalls.length" class="muted">{{ t('debug_page.play_calls.empty') }}</div>
      <div v-else class="trace-list">
        <article v-for="item in playCalls" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong>{{ item.operation || '-' }}</strong>
            <strong :class="item.status === 'ok' ? 'trace-ok' : item.status === 'error' ? 'trace-error' : ''">
              {{ item.status || '-' }}
            </strong>
          </div>
          <div class="trace-item-body">
            <small class="muted">{{ t('debug_page.key.play_call_started') }}: {{ item.startedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_ended') }}: {{ item.endedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_duration') }}: {{ formatDuration(item.durationMs) }}</small>
            <small v-if="item.errorCode" class="muted">{{ t('debug_page.key.play_call_error_code') }}: {{ item.errorCode }}</small>
            <small v-if="item.errorMessage" class="muted break-all">{{ t('debug_page.key.play_call_error_message') }}: {{ item.errorMessage }}</small>
          </div>
        </article>
      </div>

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.key.tx_failures') }}</small>
      </div>
      <div v-if="!txFailures.length" class="muted">{{ t('debug_page.tx_failures.empty') }}</div>
      <div v-else class="trace-list">
        <article v-for="item in txFailures" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong>{{ item.operation || '-' }}</strong>
            <strong class="trace-error">{{ item.reasonType || '-' }}</strong>
          </div>
          <div class="trace-item-body">
            <small class="muted">{{ t('debug_page.key.tx_failure_time') }}: {{ item.failedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.tx_failure_ledger') }}: {{ item.ledgerId || '-' }}</small>
            <small v-if="item.errorCode" class="muted">{{ t('debug_page.key.tx_failure_error_code') }}: {{ item.errorCode }}</small>
            <small class="muted break-all">{{ t('debug_page.key.tx_failure_error_message') }}: {{ item.errorMessage || '-' }}</small>
          </div>
        </article>
      </div>
    </article>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import {
  getGooglePlayCallTraceSnapshot,
  getMembershipTierSnapshot,
  isGooglePlayMembershipSupported,
  subscribeGooglePlayCallTrace,
  subscribeMembershipSnapshot,
  syncMembershipEntitlements,
} from '@/core/services/membership.service'
import {
  getTransactionFailureTraceSnapshot,
  subscribeTransactionFailureTrace,
} from '@/core/services/transaction.service'

const { t } = useI18n()
const loading = ref(false)
const playSupported = ref(false)
const playCalls = ref(getGooglePlayCallTraceSnapshot())
const txFailures = ref(getTransactionFailureTraceSnapshot())
const snapshot = reactive({
  tier: getMembershipTierSnapshot(),
  plan: '',
  active: false,
  source: '',
  reason: '',
  membershipCacheExpiresAt: '',
  lastSyncAt: '',
  lastSyncStatus: '',
})

let unsubscribe = null
let unsubscribePlayTrace = null
let unsubscribeTxFailureTrace = null

function formatDuration(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return '-'
  return `${Math.round(number)}ms`
}

function patchSnapshot(next) {
  if (!next || typeof next !== 'object') return
  snapshot.tier = String(next.tier ?? '')
  snapshot.plan = String(next.plan ?? '')
  snapshot.active = Boolean(next.active)
  snapshot.source = String(next.source ?? '')
  snapshot.reason = String(next.reason ?? '')
  snapshot.membershipCacheExpiresAt = String(next.membershipCacheExpiresAt ?? '')
  snapshot.lastSyncAt = String(next.lastSyncAt ?? '')
  snapshot.lastSyncStatus = String(next.lastSyncStatus ?? '')
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    playSupported.value = await isGooglePlayMembershipSupported({ forceRefresh: true })
    const next = await syncMembershipEntitlements('debug_page_refresh')
    patchSnapshot(next)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  unsubscribe = subscribeMembershipSnapshot((next) => {
    patchSnapshot(next)
  }, { emitCurrent: true })
  unsubscribePlayTrace = subscribeGooglePlayCallTrace((items) => {
    playCalls.value = Array.isArray(items) ? items : []
  }, { emitCurrent: true })
  unsubscribeTxFailureTrace = subscribeTransactionFailureTrace((items) => {
    txFailures.value = Array.isArray(items) ? items : []
  }, { emitCurrent: true })
  await refresh()
})

onBeforeUnmount(() => {
  if (typeof unsubscribe === 'function') {
    unsubscribe()
    unsubscribe = null
  }
  if (typeof unsubscribePlayTrace === 'function') {
    unsubscribePlayTrace()
    unsubscribePlayTrace = null
  }
  if (typeof unsubscribeTxFailureTrace === 'function') {
    unsubscribeTxFailureTrace()
    unsubscribeTxFailureTrace = null
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.page-title {
  margin: 0;
}

.page-header {
  align-items: center;
}

.subtitle {
  margin: 0;
}

.action-row {
  display: flex;
  justify-content: flex-start;
}

.detail-grid {
  display: grid;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.break-all {
  word-break: break-all;
  text-align: right;
}

.divider {
  border: 0;
  border-top: 1px solid var(--field-border);
  margin: 2px 0;
}

.trace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trace-list {
  display: grid;
  gap: 8px;
}

.trace-item {
  border: 1px solid var(--field-border);
  border-radius: 10px;
  padding: 8px;
  display: grid;
  gap: 6px;
  background: var(--surface-soft-accent);
}

.trace-item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.trace-item-body {
  display: grid;
  gap: 4px;
}

.trace-ok {
  color: var(--success);
}

.trace-error {
  color: var(--danger);
}
</style>
