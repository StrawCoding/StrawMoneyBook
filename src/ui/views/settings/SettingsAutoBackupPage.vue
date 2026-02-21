<template>
  <section class="stack">
    <header class="row page-head">
      <h2>自動備份</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

        <article class="card panel" :class="{ working: isWorking }">
      <h3>Google Drive 自動備份</h3>
      <p class="muted">使用 Google 登入授權後，備份會寫入 appDataFolder（隱藏應用資料夾）。</p>

      <div class="row backup-action-row">
        <button class="btn" :class="{ busy: googleConnecting }" :aria-busy="googleConnecting" :disabled="googleConnecting" @click="connectGoogle">
          {{ googleConnecting ? '登入中...' : (googleBackupState.connected ? '重新登入 Google' : '使用 Google 登入') }}
        </button>
        <button
          class="btn"
          :class="{ busy: googleDisconnecting }"
          :aria-busy="googleDisconnecting"
          :disabled="!googleBackupState.connected || googleDisconnecting"
          @click="disconnectGoogle"
        >
          {{ googleDisconnecting ? '中斷中...' : '登出 Google' }}
        </button>
      </div>

      <label class="check-row">
        <input v-model="googleAutoEnabled" type="checkbox" :disabled="!googleBackupState.connected" />
        <span>啟用自動備份</span>
      </label>

      <label class="field">
        自動備份間隔
        <CustomSelect v-model="googleIntervalHours" :options="googleIntervalOptions" :disabled="!googleBackupState.connected" />
        <span class="inline-check">
          <input v-model="googleDataChangeAutoEnabled" type="checkbox" :disabled="!googleBackupState.connected || !googleAutoEnabled" />
          <span>資料更動後自動備份</span>
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
          {{ googleSavingSettings ? '儲存中...' : '儲存備份設定' }}
        </button>
        <button
          class="btn primary"
          :class="{ busy: googleBackingUpNow }"
          :aria-busy="googleBackingUpNow"
          :disabled="!googleBackupState.connected || googleBackingUpNow"
          @click="backupNowToGoogle"
        >
          {{ googleBackingUpNow ? '備份中...' : '立即備份' }}
        </button>
        <button
          class="btn"
          :class="{ busy: googleRestoringNow }"
          :aria-busy="googleRestoringNow"
          :disabled="!googleBackupState.connected || googleRestoringNow"
          @click="restoreFromGoogle"
        >
          {{ googleRestoringNow ? '還原中...' : '從備份還原' }}
        </button>
      </div>

      <ul class="backup-meta-list">
        <li>
          <span class="muted">連線狀態</span>
          <strong>{{ googleBackupState.connected ? '已連線' : '未連線' }}</strong>
        </li>
        <li>
          <span class="muted">Google 帳號</span>
          <strong>{{ googleBackupState.accountEmail || '-' }}</strong>
        </li>
        <li>
          <span class="muted">上次備份</span>
          <strong>{{ formatBackupTime(googleBackupState.lastBackupAt) }}</strong>
        </li>
        <li>
          <span class="muted">備份檔名</span>
          <strong>{{ googleBackupState.lastBackupFilename || '-' }}</strong>
        </li>
        <li v-if="googleBackupState.lastBackupStatus === 'error' && googleBackupState.lastError">
          <span class="muted">錯誤</span>
          <strong>{{ googleBackupState.lastError }}</strong>
        </li>
      </ul>

    </article>
    <article class="card panel" :class="{ working: isWorking }">
      <h3>WebDAV 自動備份</h3>
      <p class="muted">填入 WebDAV 伺服器後，可把目前帳本自動備份到你的私有儲存空間。</p>

      <label class="field">
        WebDAV Endpoint
        <input
          v-model.trim="webdavEndpointInput"
          type="text"
          class="input"
          placeholder="https://dav.example.com/remote.php/dav/files/username"
        />
      </label>

      <label class="field">
        帳號
        <input v-model.trim="webdavUsernameInput" type="text" class="input" placeholder="WebDAV 帳號" />
      </label>

      <label class="field">
        密碼 / App Password
        <input v-model="webdavPasswordInput" type="password" class="input" placeholder="WebDAV 密碼" />
      </label>

      <label class="field">
        備份資料夾（可空白）
        <input v-model.trim="webdavRemoteDirInput" type="text" class="input" placeholder="例如：StrawMoneyBook" />
      </label>

      <div class="row backup-action-row">
        <button class="btn" :class="{ busy: webdavConnecting }" :aria-busy="webdavConnecting" :disabled="webdavConnecting" @click="connectWebdav">
          {{ webdavConnecting ? '連線中...' : (webdavBackupState.connected ? '重新連線 WebDAV' : '連接 WebDAV') }}
        </button>
        <button
          class="btn"
          :class="{ busy: webdavDisconnecting }"
          :aria-busy="webdavDisconnecting"
          :disabled="!webdavBackupState.connected || webdavDisconnecting"
          @click="disconnectWebdav"
        >
          {{ webdavDisconnecting ? '中斷中...' : '中斷連線' }}
        </button>
      </div>

      <label class="check-row">
        <input v-model="webdavAutoEnabled" type="checkbox" :disabled="!webdavBackupState.connected" />
        <span>啟用自動備份</span>
      </label>

      <label class="field">
        自動備份間隔
        <CustomSelect v-model="webdavIntervalHours" :options="webdavIntervalOptions" :disabled="!webdavBackupState.connected" />
        <span class="inline-check">
          <input v-model="webdavDataChangeAutoEnabled" type="checkbox" :disabled="!webdavBackupState.connected || !webdavAutoEnabled" />
          <span>資料更動後自動備份</span>
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
          {{ webdavSavingSettings ? '儲存中...' : '儲存備份設定' }}
        </button>
        <button
          class="btn primary"
          :class="{ busy: webdavBackingUpNow }"
          :aria-busy="webdavBackingUpNow"
          :disabled="!webdavBackupState.connected || webdavBackingUpNow"
          @click="backupNowToWebdav"
        >
          {{ webdavBackingUpNow ? '備份中...' : '立即備份' }}
        </button>
        <button
          class="btn"
          :class="{ busy: webdavRestoringNow }"
          :aria-busy="webdavRestoringNow"
          :disabled="!webdavBackupState.connected || webdavRestoringNow"
          @click="restoreFromWebdav"
        >
          {{ webdavRestoringNow ? '還原中...' : '從備份還原' }}
        </button>
      </div>

      <ul class="backup-meta-list">
        <li>
          <span class="muted">連線狀態</span>
          <strong>{{ webdavBackupState.connected ? '已連線' : '未連線' }}</strong>
        </li>
        <li>
          <span class="muted">Endpoint</span>
          <strong>{{ webdavBackupState.endpoint || '-' }}</strong>
        </li>
        <li>
          <span class="muted">上次備份</span>
          <strong>{{ formatBackupTime(webdavBackupState.lastBackupAt) }}</strong>
        </li>
        <li>
          <span class="muted">備份檔名</span>
          <strong>{{ webdavBackupState.lastBackupFilename || '-' }}</strong>
        </li>
        <li v-if="webdavBackupState.lastBackupStatus === 'error' && webdavBackupState.lastError">
          <span class="muted">錯誤</span>
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
const { t } = useI18n()

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
const webdavIntervalOptions = [
  { value: 6, label: '每 6 小時' },
  { value: 12, label: '每 12 小時' },
  { value: 24, label: '每 24 小時' },
  { value: 48, label: '每 48 小時' },
]
const googleIntervalOptions = [...webdavIntervalOptions]
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
  const state = await getGoogleBackupState(ledgerStore.activeLedgerId)
  googleBackupState.value = state
  googleAutoEnabled.value = Boolean(state.autoEnabled)
  googleDataChangeAutoEnabled.value = Boolean(state.dataChangeAutoEnabled)
  googleIntervalHours.value = Number(state.intervalHours || 24)
}

function formatBackupTime(isoText) {
  if (!isoText) return '-'
  const date = new Date(isoText)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('zh-TW', {
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
  if (Number(integrity.beforeIssueCount ?? 0) <= 0) return '，已完成資料檢查'
  if (Number(integrity.afterIssueCount ?? 0) <= 0) {
    return `，已自動修復 ${Number(integrity.fixedCount ?? 0)} 項`
  }
  if (Number(integrity.fixedCount ?? 0) > 0) {
    return `，已修復 ${Number(integrity.fixedCount ?? 0)} 項（剩餘 ${Number(integrity.afterIssueCount ?? 0)} 項）`
  }
  return `，偵測 ${Number(integrity.afterIssueCount ?? 0)} 項異常`
}

function errorMessage(error, fallback) {
  const message = String(error?.message ?? '').trim()
  if (message) return message
  const code = String(error?.code ?? error?.errorCode ?? '').trim()
  if (code) return `${fallback}（code=${code}）`
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
    uiStore.pushToast('WebDAV 連線成功')
  } catch (error) {
    uiStore.pushToast(error.message ?? 'WebDAV 連線失敗', 'error')
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
    uiStore.pushToast('已中斷 WebDAV 連線')
  } catch (error) {
    uiStore.pushToast(error.message ?? '中斷連線失敗', 'error')
  } finally {
    webdavDisconnecting.value = false
  }
}

async function saveWebdavBackupSettings() {
  if (!ledgerStore.activeLedgerId) return
  if (!webdavBackupState.value.connected) {
    uiStore.pushToast('請先連接 WebDAV', 'error')
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
    uiStore.pushToast('WebDAV 備份設定已更新')
  } catch (error) {
    uiStore.pushToast(error.message ?? '儲存設定失敗', 'error')
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
    uiStore.pushToast(`WebDAV 備份完成（${formatBackupTime(result.lastBackupAt)}）`)
  } catch (error) {
    webdavBackupState.value = await getWebdavBackupState(ledgerStore.activeLedgerId)
    uiStore.pushToast(error.message ?? 'WebDAV 備份失敗', 'error')
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
    const restoredLabel = restoredCount > 1 ? `共 ${restoredCount} 本` : restoredName
    const usedFilename = backup.filename ? `，檔案：${backup.filename}` : ''
    uiStore.pushToast(`WebDAV 備份已還原（${restoredLabel}）${restoreCheckHint(imported.importedLedgers?.[0])}${usedFilename}`)
  } catch (error) {
    uiStore.pushToast(error.message ?? 'WebDAV 備份還原失敗', 'error')
  } finally {
    webdavRestoringNow.value = false
  }
}

async function connectGoogle() {
  if (!ledgerStore.activeLedgerId) return
  googleConnecting.value = true
  try {
    googleBackupState.value = await connectGoogleBackup(ledgerStore.activeLedgerId)
    googleAutoEnabled.value = Boolean(googleBackupState.value.autoEnabled)
    googleDataChangeAutoEnabled.value = Boolean(googleBackupState.value.dataChangeAutoEnabled)
    googleIntervalHours.value = Number(googleBackupState.value.intervalHours || 24)
    uiStore.pushToast('Google 連線成功')
  } catch (error) {
    console.error('[google-connect] failed', error)
    uiStore.pushToast(errorMessage(error, 'Google 連線失敗'), 'error')
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
      'Google 登出逾時，請重試'
    )
    googleAutoEnabled.value = false
    googleDataChangeAutoEnabled.value = false
    uiStore.pushToast('已登出 Google')
  } catch (error) {
    console.error('[google-disconnect] failed', error)
    uiStore.pushToast(errorMessage(error, 'Google 登出失敗'), 'error')
  } finally {
    googleDisconnecting.value = false
  }
}

async function saveGoogleBackupSettings() {
  if (!ledgerStore.activeLedgerId) return
  if (!googleBackupState.value.connected) {
    uiStore.pushToast('請先連接 Google 帳號', 'error')
    return
  }
  googleSavingSettings.value = true
  try {
    googleBackupState.value = await updateGoogleBackupState(ledgerStore.activeLedgerId, {
      autoEnabled: Boolean(googleAutoEnabled.value),
      dataChangeAutoEnabled: Boolean(googleDataChangeAutoEnabled.value && googleAutoEnabled.value),
      intervalHours: Number(googleIntervalHours.value || 24),
    })
    uiStore.pushToast('Google 備份設定已更新')
  } catch (error) {
    console.error('[google-save-settings] failed', error)
    uiStore.pushToast(errorMessage(error, '儲存設定失敗'), 'error')
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
    uiStore.pushToast(`Google 備份完成（${formatBackupTime(result.lastBackupAt)}）`)
  } catch (error) {
    googleBackupState.value = await getGoogleBackupState(ledgerStore.activeLedgerId)
    console.error('[google-backup-now] failed', error)
    uiStore.pushToast(errorMessage(error, 'Google 備份失敗'), 'error')
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
    const restoredLabel = restoredCount > 1 ? `共 ${restoredCount} 本` : restoredName
    const usedFilename = backup.filename ? `，檔案：${backup.filename}` : ''
    uiStore.pushToast(`Google 備份已還原（${restoredLabel}）${restoreCheckHint(imported.importedLedgers?.[0])}${usedFilename}`)
  } catch (error) {
    console.error('[google-restore] failed', error)
    uiStore.pushToast(errorMessage(error, 'Google 備份還原失敗'), 'error')
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
