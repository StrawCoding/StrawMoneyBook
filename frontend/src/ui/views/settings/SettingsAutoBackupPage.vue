<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_auto_backup.title') }}</h2>
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
          @click="restoreFromGoogle"
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
          @click="restoreFromWebdav"
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
        <li v-if="webdavBackupState.lastBackupStatus === 'error' && webdavBackupState.lastError">
          <span class="muted">{{ t('settings_auto_backup.status.error') }}</span>
          <strong>{{ webdavBackupState.lastError }}</strong>
        </li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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
  performGoogleBackup,
  restoreGoogleBackupJson,
  updateGoogleBackupState,
} from '@/ui/services/google-backup.service'
import {
  connectWebdavBackup,
  disconnectWebdavBackup,
  getWebdavBackupState,
  performWebdavBackup,
  restoreWebdavBackupJson,
  updateWebdavBackupState,
} from '@/ui/services/webdav-backup.service'
import { importBackupJsonAsNewLedgers } from '@/core/services/import.service'
import { resetDatabase } from '@/core/db/sqlite'

const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()

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

async function refreshWebdavBackupState() {
  if (!ledgerStore.activeLedgerId) {
    webdavBackupState.value = {
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
    }
    webdavEndpointInput.value = ''
    webdavUsernameInput.value = ''
    webdavPasswordInput.value = ''
    webdavRemoteDirInput.value = ''
    webdavAutoEnabled.value = false
    webdavDataChangeAutoEnabled.value = false
    webdavIntervalHours.value = 24
    return
  }
  const state = await getWebdavBackupState(ledgerStore.activeLedgerId)
  webdavBackupState.value = state
  webdavEndpointInput.value = state.endpoint || ''
  webdavUsernameInput.value = state.username || ''
  webdavPasswordInput.value = ''
  webdavRemoteDirInput.value = state.remoteDir || ''
  webdavAutoEnabled.value = Boolean(state.autoEnabled)
  webdavDataChangeAutoEnabled.value = Boolean(state.dataChangeAutoEnabled)
  webdavIntervalHours.value = Number(state.intervalHours || 24)
}

async function refreshGoogleBackupState() {
  if (!ledgerStore.activeLedgerId) {
    googleBackupState.value = {
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
    }
    googleAutoEnabled.value = false
    googleDataChangeAutoEnabled.value = false
    googleIntervalHours.value = 24
    return
  }
  const state = await autoConnectGoogleBackup(ledgerStore.activeLedgerId, {
    allowInteractive: true,
    allowInteractiveWhenGoogleLinked: true,
  })
  googleBackupState.value = state
  googleAutoEnabled.value = Boolean(state.autoEnabled)
  googleDataChangeAutoEnabled.value = Boolean(state.dataChangeAutoEnabled)
  googleIntervalHours.value = Number(state.intervalHours || 24)
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
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_disconnected'))
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.disconnect_failed')), 'error')
  } finally {
    webdavDisconnecting.value = false
  }
}

async function saveWebdavBackupSettings() {
  if (!ledgerStore.activeLedgerId) return
  if (!webdavBackupState.value.connected) {
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_connect_required'), 'error')
    return
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
    uiStore.pushToast(t('settings_auto_backup.toast.webdav_settings_updated'))
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.save_settings_failed')), 'error')
  } finally {
    webdavSavingSettings.value = false
  }
}

async function backupNowToWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavBackingUpNow.value = true
  try {
    await saveWebdavBackupSettings()
    const result = await performWebdavBackup(ledgerStore.activeLedgerId)
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

async function restoreFromWebdav() {
  if (!ledgerStore.activeLedgerId) return
  webdavRestoringNow.value = true
  try {
    const backup = await restoreWebdavBackupJson(ledgerStore.activeLedgerId)
    await resetDatabase()
    const imported = await importBackupJsonAsNewLedgers(backup.jsonText, {
      ledgerNameSuffix: '',
      runIntegrityRepair: true,
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
  } catch (error) {
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.toast.webdav_restore_failed')), 'error')
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
    uiStore.pushToast(t('settings_auto_backup.toast.google_disconnected'))
  } catch (error) {
    console.error('[google-disconnect] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.google_disconnect_failed')), 'error')
  } finally {
    googleDisconnecting.value = false
  }
}

async function saveGoogleBackupSettings() {
  if (!ledgerStore.activeLedgerId) return
  if (!googleBackupState.value.connected) {
    uiStore.pushToast(t('settings_auto_backup.toast.google_connect_required'), 'error')
    return
  }
  googleSavingSettings.value = true
  try {
    googleBackupState.value = await updateGoogleBackupState(ledgerStore.activeLedgerId, {
      autoEnabled: Boolean(googleAutoEnabled.value),
      dataChangeAutoEnabled: Boolean(googleDataChangeAutoEnabled.value && googleAutoEnabled.value),
      intervalHours: Number(googleIntervalHours.value || 24),
    })
    uiStore.pushToast(t('settings_auto_backup.toast.google_settings_updated'))
  } catch (error) {
    console.error('[google-save-settings] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.error.save_settings_failed')), 'error')
  } finally {
    googleSavingSettings.value = false
  }
}

async function backupNowToGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleBackingUpNow.value = true
  try {
    await saveGoogleBackupSettings()
    const result = await performGoogleBackup(ledgerStore.activeLedgerId)
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
    await resetDatabase()
    const imported = await importBackupJsonAsNewLedgers(backup.jsonText, {
      ledgerNameSuffix: '',
      runIntegrityRepair: true,
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
  } catch (error) {
    console.error('[google-restore] failed', error)
    uiStore.pushToast(errorMessage(error, t('settings_auto_backup.toast.google_restore_failed')), 'error')
  } finally {
    googleRestoringNow.value = false
  }
}

onMounted(() => {
  void refreshWebdavBackupState()
  void refreshGoogleBackupState()
})

watch(
  () => ledgerStore.activeLedgerId,
  () => {
    void refreshWebdavBackupState()
    void refreshGoogleBackupState()
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
@keyframes panel-sweep {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}
</style>
