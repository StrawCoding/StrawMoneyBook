<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="title-icon" />{{ t('settings_auto_backup.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel" :class="{ working: isWorking }">
      <h3>{{ t('settings_auto_backup.google_panel_title') }}</h3>
      <p class="muted">{{ t('settings_auto_backup.google_panel_desc') }}</p>

      <div class="row backup-action-row">
        <button class="btn" :class="{ busy: googleConnecting }" :aria-busy="googleConnecting" :disabled="googleConnecting" @click="connectGoogle">
          {{
            googleConnecting
              ? t('settings_auto_backup.google_signing_in')
              : (googleBackupState.connected ? t('settings_auto_backup.google_sign_in_again') : t('settings_auto_backup.google_sign_in'))
          }}
        </button>
        <button
          class="btn"
          :class="{ busy: googleDisconnecting }"
          :aria-busy="googleDisconnecting"
          :disabled="!googleBackupState.connected || googleDisconnecting"
          @click="disconnectGoogle"
        >
          {{ googleDisconnecting ? t('settings_auto_backup.google_signing_out') : t('settings_auto_backup.google_sign_out') }}
        </button>
      </div>

      <label class="check-row">
        <input v-model="googleAutoEnabled" type="checkbox" :disabled="!googleBackupState.connected" />
        <span>{{ t('settings_auto_backup.enable_auto_backup') }}</span>
      </label>

      <label class="field">
        {{ t('settings_auto_backup.interval_label') }}
        <CustomSelect v-model="googleIntervalHours" :options="googleIntervalOptions" :disabled="!googleBackupState.connected" />
        <span class="inline-check">
          <input v-model="googleDataChangeAutoEnabled" type="checkbox" :disabled="!googleBackupState.connected || !googleAutoEnabled" />
          <span>{{ t('settings_auto_backup.data_change_auto_backup') }}</span>
        </span>
      </label>

      <div class="row backup-action-row">
        <button
          class="btn"
          :class="{ busy: googleSavingSettings }"
          :aria-busy="googleSavingSettings"
          :disabled="!googleBackupState.connected || googleSavingSettings"
          @click="saveGoogleBackupSettings"
        >
          {{ googleSavingSettings ? t('settings_auto_backup.saving') : t('settings_auto_backup.save_settings') }}
        </button>
        <button
          class="btn primary"
          :class="{ busy: googleBackingUpNow }"
          :aria-busy="googleBackingUpNow"
          :disabled="!googleBackupState.connected || googleBackingUpNow"
          @click="backupNowToGoogle"
        >
          {{ googleBackingUpNow ? t('settings_auto_backup.backing_up') : t('settings_auto_backup.backup_now') }}
        </button>
        <button
          class="btn"
          :class="{ busy: googleRestoringNow }"
          :aria-busy="googleRestoringNow"
          :disabled="!googleBackupState.connected || googleRestoringNow"
          @click="openRestoreConfirm('google')"
        >
          {{ googleRestoringNow ? t('settings_auto_backup.restoring') : t('settings_auto_backup.restore_now') }}
        </button>
      </div>

      <ul class="backup-meta-list">
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.connection') }}</span>
          <strong>{{ googleBackupState.connected ? t('settings_auto_backup.status.connected') : t('settings_auto_backup.status.disconnected') }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.google_account') }}</span>
          <strong>{{ googleBackupState.accountEmail || '-' }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.last_backup') }}</span>
          <strong>{{ formatBackupTime(googleBackupState.lastBackupAt) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.filename') }}</span>
          <strong>{{ googleBackupState.lastBackupFilename || '-' }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.auto_check') }}</span>
          <strong>{{ describeAutoBackupCheck(googleBackupState) }}</strong>
        </li>
        <li v-if="googleBackupState.lastAutoCheckAt">
          <span class="muted">{{ t('settings_auto_backup.status.last_check') }}</span>
          <strong>{{ formatBackupTime(googleBackupState.lastAutoCheckAt) }}</strong>
        </li>
        <li v-if="googleBackupState.lastBackupStatus === 'error' && googleBackupState.lastError">
          <span class="muted">{{ t('settings_auto_backup.status.error') }}</span>
          <strong>{{ googleBackupState.lastError }}</strong>
        </li>
      </ul>

    </article>
    <article class="card panel" :class="{ working: isWorking }">
      <h3>{{ t('settings_auto_backup.webdav_panel_title') }}</h3>
      <p class="muted">{{ t('settings_auto_backup.webdav_panel_desc') }}</p>

      <label class="field">
        {{ t('settings_auto_backup.webdav.endpoint_label') }}
        <input
          v-model.trim="webdavEndpointInput"
          type="text"
          class="input"
          :placeholder="t('settings_auto_backup.webdav.endpoint_placeholder')"
        />
      </label>

      <label class="field">
        {{ t('settings_auto_backup.webdav.username_label') }}
        <input v-model.trim="webdavUsernameInput" type="text" class="input" :placeholder="t('settings_auto_backup.webdav.username_placeholder')" />
      </label>

      <label class="field">
        {{ t('settings_auto_backup.webdav.password_label') }}
        <input v-model="webdavPasswordInput" type="password" class="input" :placeholder="t('settings_auto_backup.webdav.password_placeholder')" />
      </label>

      <label class="field">
        {{ t('settings_auto_backup.webdav.remote_dir_label') }}
        <input v-model.trim="webdavRemoteDirInput" type="text" class="input" :placeholder="t('settings_auto_backup.webdav.remote_dir_placeholder')" />
      </label>

      <div class="row backup-action-row">
        <button class="btn" :class="{ busy: webdavConnecting }" :aria-busy="webdavConnecting" :disabled="webdavConnecting" @click="connectWebdav">
          {{
            webdavConnecting
              ? t('settings_auto_backup.webdav.connecting')
              : (webdavBackupState.connected ? t('settings_auto_backup.webdav.reconnect') : t('settings_auto_backup.webdav.connect'))
          }}
        </button>
        <button
          class="btn"
          :class="{ busy: webdavDisconnecting }"
          :aria-busy="webdavDisconnecting"
          :disabled="!webdavBackupState.connected || webdavDisconnecting"
          @click="disconnectWebdav"
        >
          {{ webdavDisconnecting ? t('settings_auto_backup.webdav.disconnecting') : t('settings_auto_backup.webdav.disconnect') }}
        </button>
      </div>

      <label class="check-row">
        <input v-model="webdavAutoEnabled" type="checkbox" :disabled="!webdavBackupState.connected" />
        <span>{{ t('settings_auto_backup.enable_auto_backup') }}</span>
      </label>

      <label class="field">
        {{ t('settings_auto_backup.interval_label') }}
        <CustomSelect v-model="webdavIntervalHours" :options="webdavIntervalOptions" :disabled="!webdavBackupState.connected" />
        <span class="inline-check">
          <input v-model="webdavDataChangeAutoEnabled" type="checkbox" :disabled="!webdavBackupState.connected || !webdavAutoEnabled" />
          <span>{{ t('settings_auto_backup.data_change_auto_backup') }}</span>
        </span>
      </label>

      <div class="row backup-action-row">
        <button
          class="btn"
          :class="{ busy: webdavSavingSettings }"
          :aria-busy="webdavSavingSettings"
          :disabled="!webdavBackupState.connected || webdavSavingSettings"
          @click="saveWebdavBackupSettings"
        >
          {{ webdavSavingSettings ? t('settings_auto_backup.saving') : t('settings_auto_backup.save_settings') }}
        </button>
        <button
          class="btn primary"
          :class="{ busy: webdavBackingUpNow }"
          :aria-busy="webdavBackingUpNow"
          :disabled="!webdavBackupState.connected || webdavBackingUpNow"
          @click="backupNowToWebdav"
        >
          {{ webdavBackingUpNow ? t('settings_auto_backup.backing_up') : t('settings_auto_backup.backup_now') }}
        </button>
        <button
          class="btn"
          :class="{ busy: webdavRestoringNow }"
          :aria-busy="webdavRestoringNow"
          :disabled="!webdavBackupState.connected || webdavRestoringNow"
          @click="openRestoreConfirm('webdav')"
        >
          {{ webdavRestoringNow ? t('settings_auto_backup.restoring') : t('settings_auto_backup.restore_now') }}
        </button>
      </div>

      <ul class="backup-meta-list">
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.connection') }}</span>
          <strong>{{ webdavBackupState.connected ? t('settings_auto_backup.status.connected') : t('settings_auto_backup.status.disconnected') }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.endpoint') }}</span>
          <strong>{{ webdavBackupState.endpoint || '-' }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.last_backup') }}</span>
          <strong>{{ formatBackupTime(webdavBackupState.lastBackupAt) }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.filename') }}</span>
          <strong>{{ webdavBackupState.lastBackupFilename || '-' }}</strong>
        </li>
        <li>
          <span class="muted">{{ t('settings_auto_backup.status.auto_check') }}</span>
          <strong>{{ describeAutoBackupCheck(webdavBackupState) }}</strong>
        </li>
        <li v-if="webdavBackupState.lastAutoCheckAt">
          <span class="muted">{{ t('settings_auto_backup.status.last_check') }}</span>
          <strong>{{ formatBackupTime(webdavBackupState.lastAutoCheckAt) }}</strong>
        </li>
        <li v-if="webdavBackupState.lastBackupStatus === 'error' && webdavBackupState.lastError">
          <span class="muted">{{ t('settings_auto_backup.status.error') }}</span>
          <strong>{{ webdavBackupState.lastError }}</strong>
        </li>
      </ul>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section
          v-if="isRestoreConfirmOpen"
          class="sheet-mask restore-mask"
          data-testid="auto-backup-restore-confirm"
          @click.self="closeRestoreConfirm"
        >
          <article class="card restore-dialog">
            <header class="row">
              <h3>{{ t('settings_auto_backup.restore.confirm_title', '確認還原並清空本機資料') }}</h3>
            </header>
            <p class="muted">
              {{
                t(
                  'settings_auto_backup.restore.confirm_desc',
                  '還原前會先建立本機 recovery 備份，再清空本機並以雲端備份內容還原。此動作可取消。',
                )
              }}
            </p>
            <footer class="row action-row">
              <button class="btn" @click="closeRestoreConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button
                class="btn danger-btn"
                :disabled="restoreCountdown > 0 || googleRestoringNow || webdavRestoringNow"
                data-testid="auto-backup-restore-confirm-button"
                @click="confirmRestoreFromBackup"
              >
                {{ restoreConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useI18n } from '@/ui/services/i18n.service'
import {
  autoConnectGoogleBackup,
  connectGoogleBackup,
  disconnectGoogleBackup,
  getGoogleBackupState,
  restoreGoogleBackupJson,
  updateGoogleBackupState,
} from '@/ui/services/google-backup.service'
import {
  connectWebdavBackup,
  disconnectWebdavBackup,
  getWebdavBackupState,
  restoreWebdavBackupJson,
  updateWebdavBackupState,
} from '@/ui/services/webdav-backup.service'
import { runManualAutoBackupProvider } from '@/ui/services/auto-backup-orchestrator.service'
import {
  downloadJsonFile,
  exportAllLedgersJson,
  saveJsonFileToDevice,
} from '@/core/services/export.service'
import { importBackupJsonAsNewLedgers } from '@/core/services/import.service'
import {
  DATA_WIPE_REASON,
  LEDGER_REPAIR_REASON,
  RECOVERY_BACKUP_REQUIRED_CODE,
  runConfirmedWipeAfterRecoveryBackup,
} from '@/core/services/data-wipe-guard.service'
import { createVerifiedRecoveryBackupBeforeWipe } from '@/core/services/recovery-backup.service'
import { resetDatabase } from '@/core/db/sqlite'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()
const AUTO_BACKUP_STATE_UPDATED_EVENT = 'app:auto-backup-state-updated'

const webdavBackupState = ref({
  connected: false,
  endpoint: '',
  username: '',
  password: '',
  remoteDir: '',
  autoEnabled: false,
  dataChangeAutoEnabled: false,
  intervalHours: 24,
  lastBackupAt: '',
  lastBackupFilename: '',
  lastBackupStatus: 'idle',
  lastError: '',
  lastAutoCheckAt: '',
  lastAutoCheckStatus: 'idle',
  lastAutoCheckReason: '',
})
const googleBackupState = ref({
  connected: false,
  accountEmail: '',
  accountName: '',
  accountImageUrl: '',
  autoEnabled: false,
  dataChangeAutoEnabled: false,
  intervalHours: 24,
  lastBackupAt: '',
  lastBackupFilename: '',
  lastBackupStatus: 'idle',
  lastError: '',
  lastAutoCheckAt: '',
  lastAutoCheckStatus: 'idle',
  lastAutoCheckReason: '',
})
const webdavEndpointInput = ref('')
const webdavUsernameInput = ref('')
const webdavPasswordInput = ref('')
const webdavRemoteDirInput = ref('')
const webdavAutoEnabled = ref(false)
const webdavDataChangeAutoEnabled = ref(false)
const webdavIntervalHours = ref(24)
const webdavConnecting = ref(false)
const webdavDisconnecting = ref(false)
const webdavSavingSettings = ref(false)
const webdavBackingUpNow = ref(false)
const webdavRestoringNow = ref(false)
const googleAutoEnabled = ref(false)
const googleDataChangeAutoEnabled = ref(false)
const googleIntervalHours = ref(24)
const googleConnecting = ref(false)
const googleDisconnecting = ref(false)
const googleSavingSettings = ref(false)
const googleBackingUpNow = ref(false)
const googleRestoringNow = ref(false)
const isRestoreConfirmOpen = ref(false)
const restoreCountdown = ref(0)
const pendingRestoreProvider = ref('')
let restoreTimerId = null
const intervalHourValues = [6, 12, 24, 48]
const webdavIntervalOptions = computed(() =>
  intervalHourValues.map((hours) => ({
    value: hours,
    label: t('settings_auto_backup.interval.every_hours', { hours }),
  })),
)
const googleIntervalOptions = webdavIntervalOptions
const isWorking = computed(() => {
  return (
    webdavConnecting.value ||
    webdavDisconnecting.value ||
    webdavSavingSettings.value ||
    webdavBackingUpNow.value ||
    webdavRestoringNow.value ||
    googleConnecting.value ||
    googleDisconnecting.value ||
    googleSavingSettings.value ||
    googleBackingUpNow.value ||
    googleRestoringNow.value
  )
})

const restoreConfirmLabel = computed(() => {
  if (googleRestoringNow.value || webdavRestoringNow.value) {
    return t('settings_auto_backup.restoring')
  }
  if (restoreCountdown.value > 0) {
    return t('settings_auto_backup.restore.confirm_countdown', { count: restoreCountdown.value }, '確認還原（{count}）')
  }
  return t('settings_auto_backup.restore.confirm', '確認還原並清空本機')
})

function buildEmptyWebdavBackupState() {
  return {
    connected: false,
    endpoint: '',
    username: '',
    password: '',
    remoteDir: '',
    autoEnabled: false,
    dataChangeAutoEnabled: false,
    intervalHours: 24,
    lastBackupAt: '',
    lastBackupFilename: '',
    lastBackupStatus: 'idle',
    lastError: '',
    lastAutoCheckAt: '',
    lastAutoCheckStatus: 'idle',
    lastAutoCheckReason: '',
  }
}

function buildEmptyGoogleBackupState() {
  return {
    connected: false,
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
    autoEnabled: false,
    dataChangeAutoEnabled: false,
    intervalHours: 24,
    lastBackupAt: '',
    lastBackupFilename: '',
    lastBackupStatus: 'idle',
    lastError: '',
    lastAutoCheckAt: '',
    lastAutoCheckStatus: 'idle',
    lastAutoCheckReason: '',
  }
}

function applyWebdavBackupStateToForm(state, { preservePasswordInput = false } = {}) {
  webdavBackupState.value = state
  webdavEndpointInput.value = state.endpoint || ''
  webdavUsernameInput.value = state.username || ''
  if (!preservePasswordInput) {
    webdavPasswordInput.value = ''
  }
  webdavRemoteDirInput.value = state.remoteDir || ''
  webdavAutoEnabled.value = Boolean(state.autoEnabled)
  webdavDataChangeAutoEnabled.value = Boolean(state.dataChangeAutoEnabled)
  webdavIntervalHours.value = Number(state.intervalHours || 24)
}

function applyGoogleBackupStateToForm(state) {
  googleBackupState.value = state
  googleAutoEnabled.value = Boolean(state.autoEnabled)
  googleDataChangeAutoEnabled.value = Boolean(state.dataChangeAutoEnabled)
  googleIntervalHours.value = Number(state.intervalHours || 24)
}

async function loadWebdavBackupState() {
  if (!ledgerStore.activeLedgerId) {
    return buildEmptyWebdavBackupState()
  }
  return getWebdavBackupState(ledgerStore.activeLedgerId)
}

async function loadGoogleBackupState() {
  if (!ledgerStore.activeLedgerId) {
    return buildEmptyGoogleBackupState()
  }
  return autoConnectGoogleBackup(ledgerStore.activeLedgerId, {
    allowInteractive: false,
  })
}

let refreshCoordinatorTicket = 0

async function refreshAutoBackupState({ preservePasswordInput = false } = {}) {
  const ticket = ++refreshCoordinatorTicket
  const [webdavState, googleState] = await Promise.all([
    loadWebdavBackupState(),
    loadGoogleBackupState(),
  ])
  if (ticket !== refreshCoordinatorTicket) return
  applyWebdavBackupStateToForm(webdavState, { preservePasswordInput })
  applyGoogleBackupStateToForm(googleState)
}

function shouldRefreshFromAutoBackupEvent(detail) {
  const eventLedgerId = String(detail?.ledgerId ?? '').trim()
  const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!eventLedgerId || !activeLedgerId) return false
  return eventLedgerId === activeLedgerId
}

async function handleAutoBackupStateUpdated(event) {
  if (!shouldRefreshFromAutoBackupEvent(event?.detail)) return
  await refreshAutoBackupState({
    preservePasswordInput: Boolean(webdavPasswordInput.value),
  })
}

function formatBackupTime(isoText) {
  if (!isoText) return '-'
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(locale.value || 'zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeAutoBackupCheck(state) {
  const status = String(state?.lastAutoCheckStatus ?? 'idle').trim() || 'idle'
  const reason = String(state?.lastAutoCheckReason ?? '').trim()

  if (status === 'ok') {
    if (reason === 'data_change_backup_completed') {
      return t('settings_auto_backup.auto_check.data_change_backup_completed')
    }
    return t('settings_auto_backup.auto_check.backup_completed')
  }

  if (status === 'error') {
    if (reason === 'reauth_required') {
      return t('settings_auto_backup.auto_check.reauth_required')
    }
    return t('settings_auto_backup.auto_check.backup_failed')
  }

  if (status === 'skipped') {
    if (reason === 'connect_restore_failed') {
      return t('settings_auto_backup.auto_check.connect_restore_failed')
    }
    if (reason === 'not_connected') {
      return t('settings_auto_backup.auto_check.not_connected')
    }
    if (reason === 'auto_disabled') {
      return t('settings_auto_backup.auto_check.auto_disabled')
    }
    if (reason === 'data_change_disabled') {
      return t('settings_auto_backup.auto_check.data_change_disabled')
    }
    if (reason === 'offline') {
      return t('settings_auto_backup.auto_check.offline')
    }
    if (reason === 'platform_unsupported') {
      return t('settings_auto_backup.auto_check.platform_unsupported')
    }
    if (reason === 'not_due') {
      return t('settings_auto_backup.auto_check.not_due')
    }
  }

  return t('settings_auto_backup.auto_check.idle')
}

function restoreCheckHint(imported) {
  const integrity = imported?.integrityCheck
  if (!integrity) return ''
  if (Number(integrity.beforeIssueCount ?? 0) <= 0) {
    return t('settings_auto_backup.restore.check_done')
  }
  if (Number(integrity.afterIssueCount ?? 0) <= 0) {
    return t('settings_auto_backup.restore.check_auto_fixed', {
      count: Number(integrity.fixedCount ?? 0),
    })
  }
  if (Number(integrity.fixedCount ?? 0) > 0) {
    return t('settings_auto_backup.restore.check_fixed_remaining', {
      fixed: Number(integrity.fixedCount ?? 0),
      remaining: Number(integrity.afterIssueCount ?? 0),
    })
  }
  return t('settings_auto_backup.restore.check_detected', {
    count: Number(integrity.afterIssueCount ?? 0),
  })
}

function errorMessage(error, fallback) {
  if (typeof error === 'string' && error.trim()) return error.trim()

  const pick = (...values) => {
    for (const value of values) {
      const text = String(value ?? '').trim()
      if (text) return text
    }
    return ''
  }

  const baseMessage = pick(
    error?.message,
    error?.error_description,
    error?.errorDescription,
    error?.errorMessage,
    error?.details,
    error?.error,
    error?.cause?.message,
    error?.data?.message,
    error?.response?.data?.message,
  )
  if (baseMessage) return baseMessage

  const code = pick(error?.code, error?.errorCode, error?.status, error?.errorNumber)
  if (code) return `${fallback} (code=${code})`
  return fallback
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })
  return Promise.race([task, timeoutPromise]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId)
  })
}

function notifyAutoBackupConfigUpdated(reason) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  const checkedAt = new Date().toISOString()
  const detail = {
    reason: String(reason ?? '').trim() || 'settings_updated',
    ledgerId: String(ledgerStore.activeLedgerId ?? '').trim(),
    provider: 'all',
    mode: 'config',
    status: 'completed',
    checkedAt,
  }
  if (typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('app:auto-backup-config-updated', { detail }))
    return
  }
  window.dispatchEvent(new Event('app:auto-backup-config-updated'))
}

async function connectWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavConnecting.value = true
  try {
    webdavBackupState.value = await connectWebdavBackup(ledgerStore.activeLedgerId, {
      endpoint: webdavEndpointInput.value,
      username: webdavUsernameInput.value,
      password: webdavPasswordInput.value || webdavBackupState.value.password,
      remoteDir: webdavRemoteDirInput.value,
    })
    webdavAutoEnabled.value = Boolean(webdavBackupState.value.autoEnabled)
    webdavDataChangeAutoEnabled.value = Boolean(webdavBackupState.value.dataChangeAutoEnabled)
    webdavIntervalHours.value = Number(webdavBackupState.value.intervalHours || 24)
    notifyAutoBackupConfigUpdated('webdav_connected')
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_connected'))
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.webdav_connect_failed')), 'error')
  } finally {
    webdavConnecting.value = false
  }
}

async function disconnectWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavDisconnecting.value = true
  try {
    webdavBackupState.value = await disconnectWebdavBackup(ledgerStore.activeLedgerId)
    webdavAutoEnabled.value = false
    webdavDataChangeAutoEnabled.value = false
    notifyAutoBackupConfigUpdated('webdav_disconnected')
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_disconnected'))
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.disconnect_failed')), 'error')
  } finally {
    webdavDisconnecting.value = false
  }
}

async function saveWebdavBackupSettings() {
  if (!ledgerStore.activeLedgerId) return false
  if (!webdavBackupState.value.connected) {
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_connect_required'), 'error')
    return false
  }
  webdavSavingSettings.value = true
  try {
    const patch = {
      endpoint: webdavEndpointInput.value,
      username: webdavUsernameInput.value,
      remoteDir: webdavRemoteDirInput.value,
      autoEnabled: Boolean(webdavAutoEnabled.value),
      dataChangeAutoEnabled: Boolean(webdavDataChangeAutoEnabled.value && webdavAutoEnabled.value),
      intervalHours: Number(webdavIntervalHours.value || 24),
    }
    if (webdavPasswordInput.value) {
      patch.password = webdavPasswordInput.value
    }
    webdavBackupState.value = await updateWebdavBackupState(ledgerStore.activeLedgerId, patch)
    notifyAutoBackupConfigUpdated('webdav_settings_saved')
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_settings_updated'))
    return true
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.save_settings_failed')), 'error')
    return false
  } finally {
    webdavSavingSettings.value = false
  }
}

async function backupNowToWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavBackingUpNow.value = true
  try {
    const result = await runManualAutoBackupProvider(ledgerStore.activeLedgerId, 'webdav', {
      saveSettings: saveWebdavBackupSettings,
    })
    if (result?.skipped) return
    if (result?.status === 'error') {
      throw new Error(result.errorDetail || t('settings_auto_backup.toast.webdav_backup_failed'))
    }
    webdavBackupState.value = await getWebdavBackupState(ledgerStore.activeLedgerId)
    uiStore.pushToast(
      t('settings_auto_backup.toast.webdav_backup_done', {
        time: formatBackupTime(result.lastBackupAt),
      }),
    )
  } catch (error) {
    webdavBackupState.value = await getWebdavBackupState(ledgerStore.activeLedgerId)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.toast.webdav_backup_failed')), 'error')
  } finally {
    webdavBackingUpNow.value = false
  }
}

async function createRestoreRecoveryBackup() {
  // smb297: durable IndexedDB/memory proof required — download-only is not enough.
  return createVerifiedRecoveryBackupBeforeWipe({
    purpose: 'restore',
    source: 'SettingsAutoBackupPage.createRestoreRecoveryBackup',
    category: 'auto-backup',
    exportAllLedgersJson,
    saveJsonFileToDevice,
    downloadJsonFile,
  })
}

function clearRestoreTimer() {
  if (restoreTimerId) {
    window.clearInterval(restoreTimerId)
    restoreTimerId = null
  }
}

function openRestoreConfirm(provider) {
  pendingRestoreProvider.value = provider === 'webdav' ? 'webdav' : 'google'
  isRestoreConfirmOpen.value = true
  restoreCountdown.value = 3
  clearRestoreTimer()
  restoreTimerId = window.setInterval(() => {
    if (restoreCountdown.value <= 1) {
      restoreCountdown.value = 0
      clearRestoreTimer()
      return
    }
    restoreCountdown.value -= 1
  }, 1000)
}

function closeRestoreConfirm(options = {}) {
  const force = Boolean(options.force)
  if ((googleRestoringNow.value || webdavRestoringNow.value) && !force) return
  isRestoreConfirmOpen.value = false
  restoreCountdown.value = 0
  pendingRestoreProvider.value = ''
  clearRestoreTimer()
}

async function confirmRestoreFromBackup() {
  if (restoreCountdown.value > 0 || googleRestoringNow.value || webdavRestoringNow.value) return
  const provider = pendingRestoreProvider.value
  if (provider === 'webdav') {
    await restoreFromWebdav()
    return
  }
  await restoreFromGoogle()
}

async function restoreFromWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavRestoringNow.value = true
  try {
    const backup = await restoreWebdavBackupJson(ledgerStore.activeLedgerId)
    // smb297: recovery backup failure must abort wipe — never swallow then resetDatabase.
    await runConfirmedWipeAfterRecoveryBackup({
      createRecoveryBackup: createRestoreRecoveryBackup,
      source: 'SettingsAutoBackupPage.restoreFromWebdav',
      i18nKey: 'settings_auto_backup.toast.recovery_backup_required',
      wipeFn: () => resetDatabase({
        confirmed: true,
        reason: DATA_WIPE_REASON.USER_RESTORE_WEBDAV_BACKUP,
        source: 'SettingsAutoBackupPage.restoreFromWebdav',
      }),
    })
    const imported = await importBackupJsonAsNewLedgers(backup.jsonText, {
      ledgerNameSuffix: '',
      runIntegrityRepair: true,
      integrityRepairReason: LEDGER_REPAIR_REASON.USER_RESTORE_BACKUP,
      integrityRepairSource: 'SettingsAutoBackupPage.restoreFromWebdav',
    })
    await ledgerStore.refresh()
    if (imported.firstLedgerId) {
      await ledgerStore.switchLedger(imported.firstLedgerId)
    }
    webdavBackupState.value = await getWebdavBackupState(ledgerStore.activeLedgerId)
    const restoredCount = Number(imported.importedLedgers?.length ?? 0)
    const restoredName = imported.firstLedgerName || imported.importedLedgers?.[0]?.ledgerName || ''
    const restoredLabel =
      restoredCount > 1
        ? t('settings_auto_backup.restore.multiple_ledgers', { count: restoredCount })
        : restoredName
    const usedFilename = backup.filename
      ? t('settings_auto_backup.restore.filename_suffix', { filename: backup.filename })
      : ''
    uiStore.pushToast(
      t('settings_auto_backup.toast.webdav_restore_done', {
        restoredLabel,
        hint: restoreCheckHint(imported.importedLedgers?.[0]),
        fileSuffix: usedFilename,
      }),
    )
    closeRestoreConfirm({ force: true })
  } catch (error) {
    const toastKey =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? 'settings_auto_backup.toast.recovery_backup_required'
        : 'settings_auto_backup.toast.webdav_restore_failed'
    uiStore.pushToast(errorMessage(error, t(toastKey)), 'error')
  } finally {
    webdavRestoringNow.value = false
  }
}

async function connectGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleConnecting.value = true
  try {
    googleBackupState.value = await withTimeout(
      connectGoogleBackup(ledgerStore.activeLedgerId),
      150000,
      t('settings_auto_backup.error.google_login_timeout')
    )
    googleAutoEnabled.value = Boolean(googleBackupState.value.autoEnabled)
    googleDataChangeAutoEnabled.value = Boolean(googleBackupState.value.dataChangeAutoEnabled)
    googleIntervalHours.value = Number(googleBackupState.value.intervalHours || 24)
    notifyAutoBackupConfigUpdated('google_connected')
    uiStore.pushToast(t('settings_auto_backup.toast.google_connected'))
  } catch (error) {
    console.error('[google-connect] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.google_connect_failed')), 'error')
  } finally {
    googleConnecting.value = false
  }
}

async function disconnectGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleDisconnecting.value = true
  try {
    googleBackupState.value = await withTimeout(
      disconnectGoogleBackup(ledgerStore.activeLedgerId),
      15000,
      t('settings_auto_backup.error.google_logout_timeout')
    )
    googleAutoEnabled.value = false
    googleDataChangeAutoEnabled.value = false
    notifyAutoBackupConfigUpdated('google_disconnected')
    uiStore.pushToast(t('settings_auto_backup.toast.google_disconnected'))
  } catch (error) {
    console.error('[google-disconnect] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.google_disconnect_failed')), 'error')
  } finally {
    googleDisconnecting.value = false
  }
}

async function saveGoogleBackupSettings() {
  if (!ledgerStore.activeLedgerId) return false
  if (!googleBackupState.value.connected) {
    uiStore.pushToast(t('settings_auto_backup.toast.google_connect_required'), 'error')
    return false
  }
  googleSavingSettings.value = true
  try {
    googleBackupState.value = await updateGoogleBackupState(ledgerStore.activeLedgerId, {
      autoEnabled: Boolean(googleAutoEnabled.value),
      dataChangeAutoEnabled: Boolean(googleDataChangeAutoEnabled.value && googleAutoEnabled.value),
      intervalHours: Number(googleIntervalHours.value || 24),
    })
    notifyAutoBackupConfigUpdated('google_settings_saved')
    uiStore.pushToast(t('settings_auto_backup.toast.google_settings_updated'))
    return true
  } catch (error) {
    console.error('[google-save-settings] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.save_settings_failed')), 'error')
    return false
  } finally {
    googleSavingSettings.value = false
  }
}

async function backupNowToGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleBackingUpNow.value = true
  try {
    const result = await runManualAutoBackupProvider(ledgerStore.activeLedgerId, 'google', {
      saveSettings: saveGoogleBackupSettings,
    })
    if (result?.skipped) return
    if (result?.status === 'error') {
      throw new Error(result.errorDetail || t('settings_auto_backup.toast.google_backup_failed'))
    }
    googleBackupState.value = await getGoogleBackupState(ledgerStore.activeLedgerId)
    uiStore.pushToast(
      t('settings_auto_backup.toast.google_backup_done', {
        time: formatBackupTime(result.lastBackupAt),
      }),
    )
  } catch (error) {
    googleBackupState.value = await getGoogleBackupState(ledgerStore.activeLedgerId)
    console.error('[google-backup-now] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.toast.google_backup_failed')), 'error')
  } finally {
    googleBackingUpNow.value = false
  }
}

async function restoreFromGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleRestoringNow.value = true
  try {
    const backup = await restoreGoogleBackupJson(ledgerStore.activeLedgerId)
    // smb297: recovery backup failure must abort wipe — never swallow then resetDatabase.
    await runConfirmedWipeAfterRecoveryBackup({
      createRecoveryBackup: createRestoreRecoveryBackup,
      source: 'SettingsAutoBackupPage.restoreFromGoogle',
      i18nKey: 'settings_auto_backup.toast.recovery_backup_required',
      wipeFn: () => resetDatabase({
        confirmed: true,
        reason: DATA_WIPE_REASON.USER_RESTORE_GOOGLE_BACKUP,
        source: 'SettingsAutoBackupPage.restoreFromGoogle',
      }),
    })
    const imported = await importBackupJsonAsNewLedgers(backup.jsonText, {
      ledgerNameSuffix: '',
      runIntegrityRepair: true,
      integrityRepairReason: LEDGER_REPAIR_REASON.USER_RESTORE_BACKUP,
      integrityRepairSource: 'SettingsAutoBackupPage.restoreFromGoogle',
    })
    await ledgerStore.refresh()
    if (imported.firstLedgerId) {
      await ledgerStore.switchLedger(imported.firstLedgerId)
    }
    googleBackupState.value = await getGoogleBackupState(ledgerStore.activeLedgerId)
    const restoredCount = Number(imported.importedLedgers?.length ?? 0)
    const restoredName = imported.firstLedgerName || imported.importedLedgers?.[0]?.ledgerName || ''
    const restoredLabel =
      restoredCount > 1
        ? t('settings_auto_backup.restore.multiple_ledgers', { count: restoredCount })
        : restoredName
    const usedFilename = backup.filename
      ? t('settings_auto_backup.restore.filename_suffix', { filename: backup.filename })
      : ''
    uiStore.pushToast(
      t('settings_auto_backup.toast.google_restore_done', {
        restoredLabel,
        hint: restoreCheckHint(imported.importedLedgers?.[0]),
        fileSuffix: usedFilename,
      }),
    )
    closeRestoreConfirm({ force: true })
  } catch (error) {
    console.error('[google-restore] failed', error)
    const toastKey =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? 'settings_auto_backup.toast.recovery_backup_required'
        : 'settings_auto_backup.toast.google_restore_failed'
    uiStore.pushToast(errorMessage(error, t(toastKey)), 'error')
  } finally {
    googleRestoringNow.value = false
  }
}

onMounted(() => {
  void refreshAutoBackupState()
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(AUTO_BACKUP_STATE_UPDATED_EVENT, handleAutoBackupStateUpdated)
  }
})

onBeforeUnmount(() => {
  clearRestoreTimer()
  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener(AUTO_BACKUP_STATE_UPDATED_EVENT, handleAutoBackupStateUpdated)
  }
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void refreshAutoBackupState()
  },
)
</script>

<style scoped>
.panel {
  padding: 14px;
  display: grid;
  gap: 10px;
  position: relative;
  overflow: hidden;
}
.panel::after {
  content: '';
  position: absolute;
  inset: -40%;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 36%,
    color-mix(in srgb, var(--primary) 9%, transparent) 49%,
    transparent 63%
  );
  transform: translateX(-120%);
  opacity: 0;
}
.panel.working::after {
  opacity: 1;
  animation: panel-sweep 1.4s linear infinite;
}
h2,
h3 {
  margin: 0;
}

.page-head {
  align-items: center;
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
.field {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
.check-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  cursor: pointer;
  transition: transform var(--anim-fast) ease, opacity var(--anim-fast) ease;
}
.check-row:active {
  transform: scale(0.98);
}
.check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  transition: transform var(--anim-fast) ease, filter var(--anim-fast) ease;
}
.check-row input[type='checkbox']:checked {
  transform: scale(1.07);
  filter: saturate(1.1);
}
.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  color: var(--text);
}
.inline-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}
.backup-action-row {
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.backup-meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.backup-meta-list li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}
.backup-meta-list li .muted {
  flex-shrink: 0;
}
.backup-meta-list li strong {
  min-width: 0;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.link-panel {
  align-items: flex-start;
}
.sheet-mask.restore-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 18px;
  background: color-mix(in srgb, #000 45%, transparent);
}
.restore-dialog {
  width: min(420px, 100%);
  display: grid;
  gap: 12px;
  padding: 16px;
}
.restore-dialog .action-row {
  justify-content: flex-end;
  gap: 8px;
}
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 160ms ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
@keyframes panel-sweep {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}
</style>
