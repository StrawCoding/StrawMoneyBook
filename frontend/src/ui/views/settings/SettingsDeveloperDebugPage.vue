<template>
  <HabitatPageShell
    :title="t('settings_developer.title')"
    :kicker="t('settings_developer.habitat_hello')"
    test-id="settings-dev-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >

    <HabitatSection>
      <p class="muted subtitle">{{ t('debug_page.subtitle') }}</p>

      <div class="debug-toggle-block" data-testid="bank-sync-debug-toggle">
        <button
          type="button"
          class="switch-row"
          :class="{ active: bankSyncDebugEnabled }"
          role="switch"
          :aria-checked="bankSyncDebugEnabled ? 'true' : 'false'"
          :disabled="bankSyncDebugEnvForced"
          @click="toggleBankSyncDebug"
        >
          <span>{{ t('debug_page.bank_sync_debug.toggle', '銀行同步 Debug Console') }}</span>
          <span class="switch-track"><span class="switch-thumb"></span></span>
        </button>
        <p class="muted compact">
          {{ bankSyncDebugEnvForced
            ? t('debug_page.bank_sync_debug.env_forced', '目前為 debug / 開發模式，Console 紀錄與網頁銀行同步已強制開啟。')
            : t('debug_page.bank_sync_debug.desc', '開啟後所有銀行同步動作會印到瀏覽器 Console，並在修正期開放網頁使用銀行同步流程。') }}
        </p>
      </div>

      <div class="action-row">
        <button class="btn" :disabled="loading" @click="refresh">{{ t('debug_page.refresh') }}</button>
        <button class="btn" :disabled="exporting" @click="exportDebugLogs">
          {{ exporting ? t('common.loading', '載入中...') : t('debug_page.export', '匯出 log') }}
        </button>
      </div>
      <small v-if="lastExportLocation" class="muted break-all">
        {{ t('debug_page.key.export_location', '匯出位置') }}: {{ lastExportLocation }}
      </small>

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

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.key.einvoice_calls') }}</small>
      </div>
      <div v-if="!einvoiceCalls.length" class="muted">{{ t('debug_page.einvoice_calls.empty') }}</div>
      <div v-else class="trace-list">
        <article v-for="item in einvoiceCalls" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong>{{ item.operation || '-' }}</strong>
            <strong :class="item.status === 'ok' ? 'trace-ok' : item.status === 'error' ? 'trace-error' : ''">
              {{ item.status || '-' }}
            </strong>
          </div>
          <div class="trace-item-body">
            <small v-if="item.maskedCarrierBarcode" class="muted">{{ t('debug_page.key.einvoice_carrier_barcode') }}: {{ item.maskedCarrierBarcode }}</small>
            <small v-if="item.dateFrom" class="muted">{{ t('debug_page.key.einvoice_date_from') }}: {{ item.dateFrom }}</small>
            <small v-if="item.dateTo" class="muted">{{ t('debug_page.key.einvoice_date_to') }}: {{ item.dateTo }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_started') }}: {{ item.startedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_ended') }}: {{ item.endedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_duration') }}: {{ formatDuration(item.durationMs) }}</small>
            <small v-if="item.invoiceCount >= 0" class="muted">{{ t('debug_page.key.einvoice_invoice_count') }}: {{ item.invoiceCount }}</small>
            <small v-if="item.importedCount >= 0" class="muted">{{ t('debug_page.key.einvoice_imported_count') }}: {{ item.importedCount }}</small>
            <small v-if="item.skippedCount >= 0" class="muted">{{ t('debug_page.key.einvoice_skipped_count') }}: {{ item.skippedCount }}</small>
            <small v-if="item.failedCount >= 0" class="muted">{{ t('debug_page.key.einvoice_failed_count') }}: {{ item.failedCount }}</small>
            <small v-if="item.errorCode" class="muted">{{ t('debug_page.key.play_call_error_code') }}: {{ item.errorCode }}</small>
            <small v-if="item.errorMessage" class="muted break-all">{{ t('debug_page.key.play_call_error_message') }}: {{ item.errorMessage }}</small>
          </div>
        </article>
      </div>

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.key.error_logs') }}</small>
      </div>
      <div v-if="!errorLogs.length" class="muted">{{ t('debug_page.error_logs.empty') }}</div>
      <div v-else class="trace-list">
        <article v-for="item in errorLogs" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong class="break-all">{{ item.message || '-' }}</strong>
            <strong class="trace-error">{{ item.source || '-' }}</strong>
          </div>
          <div class="trace-item-body">
            <small class="muted">{{ t('debug_page.key.error_log_time') }}: {{ item.loggedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_error_code') }}: {{ item.code || '-' }}</small>
            <small v-if="item.routePath" class="muted">{{ t('debug_page.key.error_log_route') }}: {{ item.routePath }}</small>
            <small v-if="item.component" class="muted">{{ t('debug_page.key.error_log_component') }}: {{ item.component }}</small>
          </div>
        </article>
      </div>

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.bank_sync_debug.console_title', '銀行同步 Console Log') }}</small>
      </div>
      <div v-if="!bankSyncConsoleLogs.length" class="muted">{{ t('debug_page.bank_sync_debug.console_empty', '尚未有 Console 紀錄。開啟 Debug 後執行銀行同步即可看到。') }}</div>
      <div v-else class="trace-list console-list" data-testid="bank-sync-console-log">
        <article v-for="item in bankSyncConsoleLogs" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong class="break-all">{{ item.action || '-' }}</strong>
            <small class="muted">{{ item.at || '-' }}</small>
          </div>
          <pre v-if="item.details" class="console-details">{{ formatConsoleDetails(item.details) }}</pre>
        </article>
      </div>

      <hr class="divider" />

      <div class="trace-header">
        <small class="muted">{{ t('debug_page.key.bank_sync_calls') }}</small>
      </div>
      <div v-if="!bankSyncCalls.length" class="muted">{{ t('debug_page.bank_sync_calls.empty') }}</div>
      <div v-else class="trace-list">
        <article v-for="item in bankSyncCalls" :key="item.id" class="trace-item">
          <div class="trace-item-top">
            <strong>{{ item.operation || '-' }}</strong>
            <strong :class="item.status === 'ok' ? 'trace-ok' : item.status === 'error' ? 'trace-error' : ''">
              {{ item.status || '-' }}
            </strong>
          </div>
          <div class="trace-item-body">
            <small class="muted">{{ t('debug_page.key.bank_sync_provider') }}: {{ item.provider || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.bank_sync_connection') }}: {{ item.connectionId || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.bank_sync_ledger') }}: {{ item.ledgerId || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_started') }}: {{ item.startedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_ended') }}: {{ item.endedAt || '-' }}</small>
            <small class="muted">{{ t('debug_page.key.play_call_duration') }}: {{ formatDuration(item.durationMs) }}</small>
            <small v-if="item.errorCode" class="muted">{{ t('debug_page.key.play_call_error_code') }}: {{ item.errorCode }}</small>
            <small v-if="item.errorMessage" class="muted break-all">{{ t('debug_page.key.play_call_error_message') }}: {{ item.errorMessage }}</small>
            <small v-if="item.debugHint" class="muted break-all">{{ t('debug_page.key.bank_sync_debug_hint') }}: {{ item.debugHint }}</small>
            <small v-if="item.debugLastStep" class="muted">{{ t('debug_page.key.bank_sync_last_step') }}: {{ item.debugLastStep }}</small>
          </div>
          <div v-if="item.steps?.length" class="trace-step-list">
            <small class="muted">{{ t('debug_page.key.bank_sync_steps') }}</small>
            <div v-for="(step, index) in item.steps" :key="`${item.id}-${index}`" class="trace-step-item">
              <strong>{{ step.step || '-' }}</strong>
              <small :class="step.status === 'ok' ? 'trace-ok' : step.status === 'error' ? 'trace-error' : 'muted'">
                {{ step.status || '-' }}
              </small>
              <small class="muted break-all">{{ step.message || '-' }}</small>
            </div>
          </div>
        </article>
      </div>

    </HabitatSection>
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import HabitatSection from '@/ui/components/layout/habitat/HabitatSection.vue'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { downloadJsonFile, saveJsonFileToDevice } from '@/core/services/export.service'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
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
import {
  getBankSyncConsoleLogSnapshot,
  getBankSyncDebugTraceSnapshot,
  isBankSyncDebugEnabled,
  isBankSyncDebugEnvForced,
  setBankSyncDebugEnabled,
  subscribeBankSyncConsoleLog,
  subscribeBankSyncDebugMode,
  subscribeBankSyncDebugTrace,
} from '@/core/services/bank-sync-debug.service'
import {
  getEInvoiceDebugTraceSnapshot,
  subscribeEInvoiceDebugTrace,
} from '@/core/services/einvoice-debug.service'
import {
  getErrorLogSnapshot,
  subscribeErrorLog,
} from '@/ui/services/error-log.service'
const uiStore = useUiStore()
const { t } = useI18n()
const loading = ref(false)
const exporting = ref(false)
const lastExportLocation = ref('')
const playSupported = ref(false)
const playCalls = ref(getGooglePlayCallTraceSnapshot())
const txFailures = ref(getTransactionFailureTraceSnapshot())
const einvoiceCalls = ref(getEInvoiceDebugTraceSnapshot())
const bankSyncCalls = ref(getBankSyncDebugTraceSnapshot())
const bankSyncConsoleLogs = ref(getBankSyncConsoleLogSnapshot())
const bankSyncDebugEnabled = ref(isBankSyncDebugEnabled())
const bankSyncDebugEnvForced = ref(isBankSyncDebugEnvForced())
const errorLogs = ref(getErrorLogSnapshot())
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
let unsubscribeEInvoiceTrace = null
let unsubscribeBankSyncTrace = null
let unsubscribeBankSyncConsole = null
let unsubscribeBankSyncDebugMode = null
let unsubscribeErrorLog = null

function formatDuration(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return '-'
  return `${Math.round(number)}ms`
}

function formatConsoleDetails(details) {
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details ?? '')
  }
}

function toggleBankSyncDebug() {
  if (bankSyncDebugEnvForced.value) return
  setBankSyncDebugEnabled(!bankSyncDebugEnabled.value)
}

function createExportTimestamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hour}${minute}${second}`
}

function buildDebugExportPayload() {
  return {
    exported_at: new Date().toISOString(),
    membership_snapshot: {
      tier: snapshot.tier,
      plan: snapshot.plan,
      active: snapshot.active,
      source: snapshot.source,
      reason: snapshot.reason,
      membershipCacheExpiresAt: snapshot.membershipCacheExpiresAt,
      lastSyncAt: snapshot.lastSyncAt,
      lastSyncStatus: snapshot.lastSyncStatus,
      playSupported: playSupported.value,
    },
    traces: {
      play_calls: Array.isArray(playCalls.value) ? playCalls.value : [],
      transaction_failures: Array.isArray(txFailures.value) ? txFailures.value : [],
      einvoice_calls: Array.isArray(einvoiceCalls.value) ? einvoiceCalls.value : [],
      bank_sync_calls: Array.isArray(bankSyncCalls.value) ? bankSyncCalls.value : [],
      bank_sync_console: Array.isArray(bankSyncConsoleLogs.value) ? bankSyncConsoleLogs.value : [],
      error_logs: Array.isArray(errorLogs.value) ? errorLogs.value : [],
    },
  }
}

async function exportDebugLogs() {
  if (exporting.value) return
  exporting.value = true
  try {
    const filename = `strawmoneybook-debug-log_${createExportTimestamp()}.json`
    const payload = buildDebugExportPayload()
    const saved = await saveJsonFileToDevice(filename, payload, { category: 'debug' })
    if (saved?.saved && saved.location) {
      lastExportLocation.value = saved.location
    } else {
      downloadJsonFile(filename, payload)
      lastExportLocation.value = `Downloads/${filename}`
    }
    uiStore.pushToast(t('debug_page.toast.export_done', 'Debug log 已匯出'))
  } catch (error) {
    uiStore.pushToast(String(error?.message ?? t('debug_page.toast.export_failed', '匯出 Debug log 失敗')), 'error')
  } finally {
    exporting.value = false
  }
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
  unsubscribeEInvoiceTrace = subscribeEInvoiceDebugTrace((items) => {
    einvoiceCalls.value = Array.isArray(items) ? items : []
  }, { emitCurrent: true })
  unsubscribeBankSyncTrace = subscribeBankSyncDebugTrace((items) => {
    bankSyncCalls.value = Array.isArray(items) ? items : []
  }, { emitCurrent: true })
  unsubscribeBankSyncConsole = subscribeBankSyncConsoleLog((items) => {
    bankSyncConsoleLogs.value = Array.isArray(items) ? items : []
  }, { emitCurrent: true })
  unsubscribeBankSyncDebugMode = subscribeBankSyncDebugMode((state) => {
    bankSyncDebugEnabled.value = Boolean(state?.enabled)
    bankSyncDebugEnvForced.value = Boolean(state?.envForced)
  }, { emitCurrent: true })
  unsubscribeErrorLog = subscribeErrorLog((items) => {
    errorLogs.value = Array.isArray(items) ? items : []
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
  if (typeof unsubscribeEInvoiceTrace === 'function') {
    unsubscribeEInvoiceTrace()
    unsubscribeEInvoiceTrace = null
  }
  if (typeof unsubscribeBankSyncTrace === 'function') {
    unsubscribeBankSyncTrace()
    unsubscribeBankSyncTrace = null
  }
  if (typeof unsubscribeBankSyncConsole === 'function') {
    unsubscribeBankSyncConsole()
    unsubscribeBankSyncConsole = null
  }
  if (typeof unsubscribeBankSyncDebugMode === 'function') {
    unsubscribeBankSyncDebugMode()
    unsubscribeBankSyncDebugMode = null
  }
  if (typeof unsubscribeErrorLog === 'function') {
    unsubscribeErrorLog()
    unsubscribeErrorLog = null
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
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

.debug-toggle-block {
  display: grid;
  gap: 8px;
  padding: 4px 0 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.switch-row {
  width: 100%;
  border: 1px solid var(--field-border);
  background: var(--surface-popover);
  color: var(--text);
  border-radius: 14px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 700;
}

.switch-row.active {
  border-color: color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, var(--card) 86%);
}

.switch-row:disabled {
  opacity: 0.72;
}

.switch-track {
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--field-border) 75%, #000 0%);
  position: relative;
  flex: 0 0 auto;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.18s ease;
}

.switch-row.active .switch-thumb {
  transform: translateX(18px);
}

.compact {
  margin: 0;
}

.console-list {
  max-height: 360px;
  overflow: auto;
}

.console-details {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  color: var(--text-muted, var(--muted));
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

.trace-step-list {
  display: grid;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--field-border);
}

.trace-step-item {
  display: grid;
  gap: 2px;
}

.trace-ok {
  color: var(--success);
}

.trace-error {
  color: var(--danger);
}
</style>
