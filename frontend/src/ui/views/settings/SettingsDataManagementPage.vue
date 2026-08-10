<template>
  <section class="stack">
    <header class="row page-head">
      <h2 class="page-title"><font-awesome-icon icon="fa-solid fa-database" class="title-icon" />{{ t('settings_data.title') }}</h2>
      <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>{{ t('settings_data.export.title') }}</h3>
      <p class="muted">{{ t('settings_data.export.desc') }}</p>
      <div class="export-grid">
        <button class="btn primary" @click="exportJson">{{ t('settings_data.export.json') }}</button>
        <button class="btn" @click="exportCsv('transactions')">{{ t('settings_data.export.tx_csv') }}</button>
        <button class="btn" @click="exportCsv('accounts')">{{ t('settings_data.export.accounts_csv') }}</button>
        <button class="btn" @click="exportCsv('categories')">{{ t('settings_data.export.categories_csv') }}</button>
      </div>
      <p v-if="lastExportPath" class="muted export-path">輸出路徑：<code>{{ lastExportPath }}</code></p>
    </article>

    <article class="card panel recovery-panel">
      <h3>{{ t('settings_data.recovery.title', '資料還原指引') }}</h3>
      <p class="muted">{{ t('settings_data.recovery.desc', '若本機帳本異常或共同帳本伺服器綁定遺失，請優先用下列可還原路徑，不要依賴自動清空。') }}</p>
      <ul class="recovery-list muted">
        <li>{{ t('settings_data.recovery.tip_export', '先匯出 JSON 備份到裝置／下載資料夾。') }}</li>
        <li>
          <RouterLink class="link" to="/settings/auto-backup">{{ t('settings_data.recovery.link_auto_backup', '自動備份（Google Drive／WebDAV）立即還原') }}</RouterLink>
        </li>
        <li>
          <RouterLink class="link" to="/settings/google-drive-ledger-sync">{{ t('settings_data.recovery.link_drive_sync', 'Google Drive 帳本同步拉回') }}</RouterLink>
        </li>
        <li>{{ t('settings_data.recovery.tip_local', '本機 IndexedDB recovery 備份可在下方列出、下載或還原（跨重啟仍在）。') }}</li>
        <li>{{ t('settings_data.recovery.tip_import', '下方 JSON 匯入會先要求確認並建立 recovery 備份後才清空本機。') }}</li>
        <li>{{ t('settings_data.recovery.tip_shared', '共同帳本伺服器綁定消失≠本機交易被刪；本機帳本仍在時請保留並重新加入／同步。') }}</li>
      </ul>
    </article>

    <article class="card panel" data-testid="local-recovery-backups-panel">
      <h3>{{ t('settings_data.local_recovery.title', '本機 recovery 備份') }}</h3>
      <p class="muted">
        {{ t('settings_data.local_recovery.desc', '完整 wipe 前寫入 IndexedDB 的 durable 備份。裝置檔／瀏覽器下載失敗時仍可由此下載或還原；記憶體暫存不算 durable。') }}
      </p>
      <div class="export-grid">
        <button
          class="btn"
          data-testid="local-recovery-refresh"
          :disabled="localRecoveryBusy"
          @click="refreshLocalRecoveryBackups"
        >
          {{ t('settings_data.local_recovery.refresh', '重新整理') }}
        </button>
      </div>
      <p v-if="!localRecoveryBackups.length" class="muted compact" data-testid="local-recovery-empty">
        {{ t('settings_data.local_recovery.empty', '目前沒有可還原的本機 recovery 備份。') }}
      </p>
      <ul v-else class="local-recovery-items" data-testid="local-recovery-list">
        <li
          v-for="item in localRecoveryBackups"
          :key="item.backupId"
          class="local-recovery-item"
          :data-backup-id="item.backupId"
        >
          <div class="local-recovery-meta">
            <strong>{{ item.filename || item.backupId }}</strong>
            <span class="muted compact">{{ formatLocalRecoveryMeta(item) }}</span>
          </div>
          <div class="local-recovery-actions">
            <button
              class="btn"
              data-testid="local-recovery-download"
              :disabled="localRecoveryBusy"
              @click="downloadLocalRecoveryBackup(item.backupId)"
            >
              {{ t('settings_data.local_recovery.download', '下載') }}
            </button>
            <button
              class="btn danger-btn"
              data-testid="local-recovery-restore"
              :disabled="localRecoveryBusy"
              @click="openLocalRestoreConfirm(item.backupId)"
            >
              {{ t('settings_data.local_recovery.restore', '還原') }}
            </button>
          </div>
        </li>
      </ul>
    </article>

    <article class="card panel" data-testid="data-integrity-panel">
      <h3>{{ t('settings_data.integrity.title', '帳本完整性') }}</h3>
      <p class="muted">{{ t('settings_data.integrity.desc', '更新／migration 後只會掃描，不會自動改寫交易。若偵測異常，可先匯出備份再明確執行修復。') }}</p>
      <p v-if="integrityStatusText" class="muted compact" data-testid="data-integrity-status">{{ integrityStatusText }}</p>
      <div class="export-grid">
        <button class="btn" data-testid="data-integrity-scan" :disabled="integrityBusy" @click="scanIntegrity">
          {{ t('settings_data.integrity.scan', '重新掃描') }}
        </button>
        <button
          class="btn"
          data-testid="data-integrity-repair"
          :disabled="integrityBusy || integrityIssueCount <= 0"
          @click="openRepairConfirm"
        >
          {{ t('settings_data.integrity.repair', '明確修復（需確認）') }}
        </button>
      </div>
    </article>

    <article class="card panel">
      <h3>{{ t('settings_data.import.title') }}</h3>
      <div>
        <p class="muted">{{ t('settings_data.import.json_desc') }}</p>
        <input ref="jsonInputRef" type="file" accept="application/json" class="input" @change="onImportJsonFileSelected" />
      </div>

      <div>
        <p class="muted">{{ t('settings_data.import.csv_desc') }}</p>
        <div class="row csv-row">
          <CustomSelect v-model="csvImportType" class="csv-select" :options="csvImportTypeOptions" />
          <input ref="csvInputRef" type="file" accept=".csv,text/csv" class="input" @change="onImportCsvFile" />
        </div>
      </div>
    </article>

    <article class="card panel danger-panel">
      <h3>{{ t('settings_data.reset.title') }}</h3>
      <p class="muted">{{ t('settings_data.reset.desc') }}</p>
      <button class="btn danger-btn" @click="openResetConfirm">{{ t('settings_data.reset.title') }}</button>
    </article>

    <teleport to="body">
      <transition name="overlay-fade">
        <section
          v-if="operationProgress.active"
          class="operation-progress-mask"
          aria-live="polite"
          aria-modal="true"
          role="dialog"
        >
          <article class="card operation-progress-dialog">
            <p class="operation-progress-eyebrow">{{ t('settings_data.progress.title') }}</p>
            <h3>{{ operationProgressTitle }}</h3>
            <p class="muted operation-progress-message">{{ operationProgressMessage }}</p>
            <div
              class="operation-progress-bar"
              role="progressbar"
              :aria-label="operationProgressTitle"
              :aria-valuenow="operationProgress.percent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span class="operation-progress-fill" :style="{ width: `${operationProgress.percent}%` }" />
            </div>
            <strong class="operation-progress-percent">{{ operationProgress.percent }}%</strong>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isResetConfirmOpen" class="sheet-mask reset-mask" @click.self="closeResetConfirm">
          <article class="card reset-dialog">
            <header class="row">
              <h3>{{ t('settings_data.reset.confirm_title') }}</h3>
            </header>
            <p class="muted">
              {{ t('settings_data.reset.confirm_desc') }}
            </p>
            <footer class="row action-row">
              <button class="btn" @click="closeResetConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button class="btn danger-btn" :disabled="resetCountdown > 0 || resettingAllData" @click="confirmResetAllData">
                {{ resetConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isImportConfirmOpen" class="sheet-mask reset-mask" @click.self="closeImportConfirm">
          <article class="card reset-dialog" data-testid="import-json-confirm-dialog">
            <header class="row">
              <h3>{{ t('settings_data.import.confirm_title', '確認匯入並清空本機資料') }}</h3>
            </header>
            <p class="muted">
              {{ t('settings_data.import.confirm_desc', 'JSON 匯入會先建立 recovery 備份，再清空本機帳本並以檔案內容還原。可取消。') }}
            </p>
            <p v-if="pendingImportFileName" class="muted compact">{{ pendingImportFileName }}</p>
            <footer class="row action-row">
              <button class="btn" @click="closeImportConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button
                class="btn danger-btn"
                :disabled="importCountdown > 0 || importingJson"
                data-testid="import-json-confirm-button"
                @click="confirmImportJson"
              >
                {{ importConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isRepairConfirmOpen" class="sheet-mask reset-mask" @click.self="closeRepairConfirm">
          <article class="card reset-dialog" data-testid="integrity-repair-confirm-dialog">
            <header class="row">
              <h3>{{ t('settings_data.integrity.confirm_title', '確認修復帳本資料') }}</h3>
            </header>
            <p class="muted">
              {{ t('settings_data.integrity.confirm_desc', '修復可能改寫孤立交易的帳戶／分類或轉帳群組。系統不會在啟動時自動執行。可取消；建議先匯出 JSON。') }}
            </p>
            <footer class="row action-row">
              <button class="btn" @click="closeRepairConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button
                class="btn primary"
                :disabled="repairCountdown > 0 || integrityBusy"
                data-testid="integrity-repair-confirm-button"
                @click="confirmRepair"
              >
                {{ repairConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
    <teleport to="body">
      <transition name="overlay-fade">
        <section v-if="isLocalRestoreConfirmOpen" class="sheet-mask reset-mask" @click.self="closeLocalRestoreConfirm">
          <article class="card reset-dialog" data-testid="local-recovery-restore-confirm">
            <header class="row">
              <h3>{{ t('settings_data.local_recovery.confirm_title', '確認還原本機 recovery 備份') }}</h3>
            </header>
            <p class="muted">
              {{ t('settings_data.local_recovery.confirm_desc', '會先建立目前狀態的 durable recovery 備份；失敗則中止、不清空本機。成功後才清空並以選定的 IndexedDB 備份還原。可取消。') }}
            </p>
            <p v-if="pendingLocalRestoreId" class="muted compact">{{ pendingLocalRestoreId }}</p>
            <footer class="row action-row">
              <button class="btn" @click="closeLocalRestoreConfirm">{{ t('common.cancel', 'Cancel') }}</button>
              <button
                class="btn danger-btn"
                :disabled="localRestoreCountdown > 0 || localRecoveryBusy"
                data-testid="local-recovery-restore-confirm-button"
                @click="confirmLocalRestore"
              >
                {{ localRestoreConfirmLabel }}
              </button>
            </footer>
          </article>
        </section>
      </transition>
    </teleport>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import {
  downloadCsvFile,
  downloadJsonFile,
  exportAccountsCsv,
  exportAllLedgersJson,
  exportCategoriesCsv,
  exportTransactionsCsv,
  saveCsvFileToDevice,
  saveJsonFileToDevice,
  timestampForFilename,
} from '@/core/services/export.service'
import { importBackupJsonAsNewLedgers, importLedgerCsv } from '@/core/services/import.service'
import {
  DATA_WIPE_REASON,
  LEDGER_REPAIR_REASON,
  RECOVERY_BACKUP_REQUIRED_CODE,
  readLastLedgerIntegrityScan,
  runConfirmedWipeAfterRecoveryBackup,
} from '@/core/services/data-wipe-guard.service'
import {
  createVerifiedRecoveryBackupBeforeWipe,
  listVerifiedRecoveryBackups,
  loadRecoveryBackupJsonText,
} from '@/core/services/recovery-backup.service'
import { repairLedgerData, scanLedgerIntegrity } from '@/core/services/repair.service'
import { sumNumericValues } from '@/ui/services/ledger-runtime.helpers'
import { resetDatabase } from '@/core/db/sqlite'
import { useI18n } from '@/ui/services/i18n.service'

const ledgerStore = useLedgerStore()
const categoryStore = useCategoryStore()
const accountStore = useAccountStore()
const transactionStore = useTransactionStore()
const budgetStore = useBudgetStore()
const loanStore = useLoanStore()
const reimbursementStore = useReimbursementStore()
const uiStore = useUiStore()
const { t } = useI18n()

const csvImportType = ref('transactions')
const csvImportTypeOptions = computed(() => ([
  { value: 'transactions', label: t('settings_data.import.option.tx_csv') },
  { value: 'accounts', label: t('settings_data.import.option.accounts_csv') },
  { value: 'categories', label: t('settings_data.import.option.categories_csv') },
]))
const jsonInputRef = ref(null)
const csvInputRef = ref(null)
const isResetConfirmOpen = ref(false)
const resetCountdown = ref(0)
const resettingAllData = ref(false)
const isImportConfirmOpen = ref(false)
const importCountdown = ref(0)
const importingJson = ref(false)
const pendingImportFile = ref(null)
const pendingImportFileName = ref('')
const isRepairConfirmOpen = ref(false)
const repairCountdown = ref(0)
const integrityBusy = ref(false)
const integrityIssueCount = ref(0)
const integrityStatusText = ref('')
const lastExportPath = ref('')
const operationProgress = ref(createIdleOperationProgress())
const localRecoveryBackups = ref([])
const localRecoveryBusy = ref(false)
const isLocalRestoreConfirmOpen = ref(false)
const localRestoreCountdown = ref(0)
const pendingLocalRestoreId = ref('')
let localRestoreTimerId = null
let resetTimerId = null
let importTimerId = null
let repairTimerId = null
let operationProgressTimerId = null

const resetConfirmLabel = computed(() => {
  if (resettingAllData.value) return t('settings_data.reset.processing')
  if (resetCountdown.value > 0) return t('settings_data.reset.confirm_countdown', { count: resetCountdown.value })
  return t('settings_data.reset.confirm')
})

const importConfirmLabel = computed(() => {
  if (importingJson.value) return t('settings_data.import.processing', '匯入中...')
  if (importCountdown.value > 0) {
    return t('settings_data.import.confirm_countdown', { count: importCountdown.value }, '確認匯入（{count}）')
  }
  return t('settings_data.import.confirm', '確認匯入並清空本機')
})

const repairConfirmLabel = computed(() => {
  if (integrityBusy.value) return t('settings_data.integrity.processing', '修復中...')
  if (repairCountdown.value > 0) {
    return t('settings_data.integrity.confirm_countdown', { count: repairCountdown.value }, '確認修復（{count}）')
  }
  return t('settings_data.integrity.confirm', '確認修復')
})

const localRestoreConfirmLabel = computed(() => {
  if (localRecoveryBusy.value) return t('settings_data.local_recovery.processing', '還原中...')
  if (localRestoreCountdown.value > 0) {
    return t('settings_data.local_recovery.confirm_countdown', { count: localRestoreCountdown.value }, '確認還原（{count}）')
  }
  return t('settings_data.local_recovery.confirm', '確認還原並清空本機')
})

const operationProgressTitle = computed(() => {
  if (operationProgress.value.type === 'resetAll') return t('settings_data.progress.reset.title')
  if (operationProgress.value.type === 'importCsv') return t('settings_data.progress.import_csv.title')
  return t('settings_data.progress.import_json.title')
})

const operationProgressMessage = computed(() => {
  if (operationProgress.value.type === 'resetAll') return t('settings_data.progress.reset.message')
  if (operationProgress.value.type === 'importCsv') return t('settings_data.progress.import_csv.message')
  return t('settings_data.progress.import_json.message')
})

function createIdleOperationProgress() {
  return {
    active: false,
    type: '',
    percent: 0,
  }
}

function clearOperationProgressTimer() {
  if (operationProgressTimerId) {
    window.clearInterval(operationProgressTimerId)
    operationProgressTimerId = null
  }
}

function showOperationProgress(type) {
  clearOperationProgressTimer()
  operationProgress.value = {
    active: true,
    type,
    percent: 8,
  }
  operationProgressTimerId = window.setInterval(() => {
    const current = Number(operationProgress.value.percent || 0)
    if (!operationProgress.value.active || current >= 92) return
    const step = current < 35 ? 7 : current < 70 ? 4 : 2
    operationProgress.value = {
      ...operationProgress.value,
      percent: Math.min(92, current + step),
    }
  }, 450)
}

async function hideOperationProgress() {
  clearOperationProgressTimer()
  if (!operationProgress.value.active) return
  operationProgress.value = {
    ...operationProgress.value,
    percent: 100,
  }
  await new Promise((resolve) => window.setTimeout(resolve, 240))
  operationProgress.value = createIdleOperationProgress()
}

async function withOperationProgress(type, task) {
  showOperationProgress(type)
  try {
    return await task()
  } finally {
    await hideOperationProgress()
  }
}

async function createResetRecoveryBackup() {
  // smb297: durable IndexedDB/filesystem proof required — download-only / memory are not enough.
  const proof = await createVerifiedRecoveryBackupBeforeWipe({
    purpose: 'reset',
    source: 'SettingsDataManagementPage.createResetRecoveryBackup',
    category: 'data-management',
    exportAllLedgersJson,
    saveJsonFileToDevice,
    downloadJsonFile,
    onDeviceSaved: (saved) => {
      lastExportPath.value = saved.location
    },
  })
  if (!lastExportPath.value && proof?.filename) {
    lastExportPath.value = `recovery:${proof.storage}/${proof.filename}`
  }
  await refreshLocalRecoveryBackups({ quiet: true })
  return proof
}

function formatLocalRecoveryMeta(item) {
  const at = String(item?.at || '').trim() || '—'
  const bytes = Number(item?.byteLength) || 0
  const purpose = String(item?.purpose || '').trim() || 'wipe'
  const storage = String(item?.storage || 'indexeddb').trim()
  return `${at} · ${purpose} · ${storage} · ${bytes} bytes`
}

async function refreshLocalRecoveryBackups(options = {}) {
  const quiet = Boolean(options.quiet)
  localRecoveryBusy.value = true
  try {
    localRecoveryBackups.value = await listVerifiedRecoveryBackups()
  } catch (error) {
    localRecoveryBackups.value = []
    if (!quiet) {
      uiStore.pushToast(
        error?.message || t('settings_data.local_recovery.toast_list_failed', '讀取本機 recovery 備份失敗'),
        'error',
      )
    }
  } finally {
    localRecoveryBusy.value = false
  }
}

async function downloadLocalRecoveryBackup(backupId) {
  localRecoveryBusy.value = true
  try {
    const loaded = await loadRecoveryBackupJsonText(backupId)
    const payload = JSON.parse(loaded.jsonText)
    const filename = loaded.filename || `${loaded.backupId}.json`
    const saved = await saveJsonFileToDevice(filename, payload, { category: 'recovery' })
    if (saved?.saved && saved.location) {
      lastExportPath.value = saved.location
    } else {
      downloadJsonFile(filename, payload)
      lastExportPath.value = `Downloads/${filename}`
    }
    uiStore.pushToast(t('settings_data.local_recovery.toast_downloaded', '已下載本機 recovery 備份'))
  } catch (error) {
    uiStore.pushToast(
      error?.message || t('settings_data.local_recovery.toast_download_failed', '下載本機 recovery 備份失敗'),
      'error',
    )
  } finally {
    localRecoveryBusy.value = false
  }
}

function clearLocalRestoreTimer() {
  if (localRestoreTimerId) {
    window.clearInterval(localRestoreTimerId)
    localRestoreTimerId = null
  }
}

function openLocalRestoreConfirm(backupId) {
  const id = String(backupId || '').trim()
  if (!id) return
  pendingLocalRestoreId.value = id
  isLocalRestoreConfirmOpen.value = true
  localRestoreCountdown.value = 3
  clearLocalRestoreTimer()
  localRestoreTimerId = window.setInterval(() => {
    if (localRestoreCountdown.value <= 1) {
      localRestoreCountdown.value = 0
      clearLocalRestoreTimer()
      return
    }
    localRestoreCountdown.value -= 1
  }, 1000)
}

function closeLocalRestoreConfirm(options = {}) {
  const force = Boolean(options.force)
  if (localRecoveryBusy.value && !force) return
  isLocalRestoreConfirmOpen.value = false
  localRestoreCountdown.value = 0
  pendingLocalRestoreId.value = ''
  clearLocalRestoreTimer()
}

async function confirmLocalRestore() {
  if (localRestoreCountdown.value > 0 || localRecoveryBusy.value) return
  const backupId = String(pendingLocalRestoreId.value || '').trim()
  if (!backupId) {
    closeLocalRestoreConfirm({ force: true })
    return
  }

  localRecoveryBusy.value = true
  try {
    const result = await withOperationProgress('importJson', async () => {
      const loaded = await loadRecoveryBackupJsonText(backupId)
      await runConfirmedWipeAfterRecoveryBackup({
        createRecoveryBackup: createResetRecoveryBackup,
        source: 'SettingsDataManagementPage.confirmLocalRestore',
        i18nKey: 'settings_data.toast.recovery_backup_required',
        wipeFn: () => resetDatabase({
          confirmed: true,
          reason: DATA_WIPE_REASON.USER_RESTORE_LOCAL_RECOVERY,
          source: 'SettingsDataManagementPage.confirmLocalRestore',
          note: backupId,
        }),
      })
      const imported = await importBackupJsonAsNewLedgers(loaded.jsonText)
      await ledgerStore.refresh()
      if (imported.firstLedgerId) {
        await ledgerStore.switchLedger(imported.firstLedgerId)
      }
      await refreshAllStores()
      return imported
    })
    const importedCount = Number(result.importedLedgers?.length ?? 0)
    const importedName = result.firstLedgerName || result.importedLedgers?.[0]?.ledgerName || ''
    const importedLabel = importedCount > 1 ? `共 ${importedCount} 本` : importedName
    uiStore.pushToast(
      t('settings_data.local_recovery.toast_restored', { ledgerName: importedLabel }, '本機 recovery 還原完成：{ledgerName}'),
    )
    closeLocalRestoreConfirm({ force: true })
    await refreshLocalRecoveryBackups({ quiet: true })
  } catch (error) {
    const recoveryMessage =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? t('settings_data.toast.recovery_backup_required', '本機 recovery 備份建立失敗，已中止清空本機資料。請先手動匯出後再重試。')
        : ''
    uiStore.pushToast(
      recoveryMessage || error?.message || t('settings_data.local_recovery.toast_restore_failed', '本機 recovery 還原失敗'),
      'error',
    )
  } finally {
    localRecoveryBusy.value = false
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error(t('settings_data.toast.file_read_failed')))
    reader.readAsText(file)
  })
}

async function refreshAllStores() {
  await Promise.all([
    accountStore.load(),
    categoryStore.load(),
    transactionStore.loadRecent(),
    budgetStore.loadCurrentMonth(),
    loanStore.load(),
    reimbursementStore.load(),
  ])
}

function importIntegrityHint(result) {
  const integrity = result?.integrityCheck
  if (!integrity) return ''
  if (Number(integrity.beforeIssueCount ?? 0) <= 0) return '（已完成資料檢查）'
  if (Number(integrity.afterIssueCount ?? 0) <= 0) {
    return `（已自動修復 ${Number(integrity.fixedCount ?? 0)} 項）`
  }
  if (Number(integrity.fixedCount ?? 0) > 0) {
    return `（已修復 ${Number(integrity.fixedCount ?? 0)} 項，剩餘 ${Number(integrity.afterIssueCount ?? 0)} 項）`
  }
  return `（偵測 ${Number(integrity.afterIssueCount ?? 0)} 項異常）`
}


async function exportJson() {
  try {
    const filename = `strawmoneybook-all-ledgers-${timestampForFilename()}.json`
    const data = await exportAllLedgersJson()
    const saved = await saveJsonFileToDevice(filename, data, { category: 'data-management' })
    if (saved?.saved && saved.location) {
      lastExportPath.value = saved.location
    } else {
      downloadJsonFile(filename, data)
      lastExportPath.value = `Downloads/${filename}`
    }
    uiStore.pushToast(t('settings_data.toast.export_json_done'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.toast.export_failed'), 'error')
  }
}

async function exportCsv(type) {
  try {
    let csv = ''
    let filename = ''

    if (type === 'transactions') {
      csv = await exportTransactionsCsv(ledgerStore.activeLedgerId)
      filename = `transactions-${ledgerStore.activeLedgerId}-${timestampForFilename()}.csv`
    }
    if (type === 'accounts') {
      csv = await exportAccountsCsv(ledgerStore.activeLedgerId)
      filename = `accounts-${ledgerStore.activeLedgerId}-${timestampForFilename()}.csv`
    }
    if (type === 'categories') {
      csv = await exportCategoriesCsv(ledgerStore.activeLedgerId)
      filename = `categories-${ledgerStore.activeLedgerId}-${timestampForFilename()}.csv`
    }

    const saved = await saveCsvFileToDevice(filename, csv, { category: 'data-management' })
    if (saved?.saved && saved.location) {
      lastExportPath.value = saved.location
    } else {
      downloadCsvFile(filename, csv)
      lastExportPath.value = `Downloads/${filename}`
    }
    uiStore.pushToast(t('settings_data.toast.export_csv_done'))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.toast.export_csv_failed'), 'error')
  }
}

async function onImportJsonFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  pendingImportFile.value = file
  pendingImportFileName.value = String(file.name || '')
  openImportConfirm()
}

function openImportConfirm() {
  isImportConfirmOpen.value = true
  importCountdown.value = 3
  clearImportTimer()
  importTimerId = window.setInterval(() => {
    if (importCountdown.value <= 1) {
      importCountdown.value = 0
      clearImportTimer()
      return
    }
    importCountdown.value -= 1
  }, 1000)
}

function closeImportConfirm(options = {}) {
  const force = Boolean(options.force)
  if (importingJson.value && !force) return
  isImportConfirmOpen.value = false
  importCountdown.value = 0
  clearImportTimer()
  pendingImportFile.value = null
  pendingImportFileName.value = ''
  if (jsonInputRef.value) jsonInputRef.value.value = ''
}

function clearImportTimer() {
  if (importTimerId) {
    window.clearInterval(importTimerId)
    importTimerId = null
  }
}

async function confirmImportJson() {
  if (importCountdown.value > 0 || importingJson.value) return
  const file = pendingImportFile.value
  if (!file) {
    closeImportConfirm({ force: true })
    return
  }

  importingJson.value = true
  try {
    const result = await withOperationProgress('importJson', async () => {
      const text = await readFileAsText(file)
      // smb297: recovery backup failure must abort wipe — never swallow then resetDatabase.
      await runConfirmedWipeAfterRecoveryBackup({
        createRecoveryBackup: createResetRecoveryBackup,
        source: 'SettingsDataManagementPage.confirmImportJson',
        i18nKey: 'settings_data.toast.recovery_backup_required',
        wipeFn: () => resetDatabase({
          confirmed: true,
          reason: DATA_WIPE_REASON.USER_IMPORT_JSON,
          source: 'SettingsDataManagementPage.confirmImportJson',
          note: pendingImportFileName.value,
        }),
      })
      const imported = await importBackupJsonAsNewLedgers(text)
      await ledgerStore.refresh()
      if (imported.firstLedgerId) {
        await ledgerStore.switchLedger(imported.firstLedgerId)
      }
      await refreshAllStores()
      return imported
    })
    const importedCount = Number(result.importedLedgers?.length ?? 0)
    const importedName = result.firstLedgerName || result.importedLedgers?.[0]?.ledgerName || ''
    const importedLabel = importedCount > 1 ? `共 ${importedCount} 本` : importedName
    uiStore.pushToast(`${t('settings_data.toast.import_json_done', { ledgerName: importedLabel })}${importIntegrityHint(result.importedLedgers?.[0])}`)
    closeImportConfirm({ force: true })
  } catch (error) {
    const recoveryMessage =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? t('settings_data.toast.recovery_backup_required', '本機 recovery 備份建立失敗，已中止清空本機資料。請先手動匯出後再重試。')
        : ''
    const fkMessage = error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || Number(error?.numericCode) === 1811
      || String(error?.i18nKey ?? '') === 'sqlite.error.foreign_key_constraint'
      ? t('settings_data.toast.foreign_key_constraint', '資料關聯不一致，操作已中止。請檢查匯入檔或先修復帳本資料。')
      : ''
    uiStore.pushToast(
      recoveryMessage || fkMessage || error.message || t('settings_data.toast.import_json_failed'),
      'error',
    )
  } finally {
    importingJson.value = false
  }
}

async function onImportCsvFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const result = await withOperationProgress('importCsv', async () => {
      const text = await readFileAsText(file)
      const imported = await importLedgerCsv(ledgerStore.activeLedgerId, text, csvImportType.value)
      await refreshAllStores()
      return imported
    })
    uiStore.pushToast(t('settings_data.toast.import_csv_done', { inserted: result.inserted, skipped: result.skipped }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.toast.import_csv_failed'), 'error')
  } finally {
    if (csvInputRef.value) csvInputRef.value.value = ''
  }
}

function openResetConfirm() {
  isResetConfirmOpen.value = true
  resetCountdown.value = 3
  clearResetTimer()
  resetTimerId = window.setInterval(() => {
    if (resetCountdown.value <= 1) {
      resetCountdown.value = 0
      clearResetTimer()
      return
    }
    resetCountdown.value -= 1
  }, 1000)
}

function closeResetConfirm(options = {}) {
  const force = Boolean(options.force)
  if (resettingAllData.value && !force) return
  isResetConfirmOpen.value = false
  resetCountdown.value = 0
  clearResetTimer()
}

function clearResetTimer() {
  if (resetTimerId) {
    window.clearInterval(resetTimerId)
    resetTimerId = null
  }
}

function onRequestCloseOverlay(event) {
  if (isLocalRestoreConfirmOpen.value) {
    closeLocalRestoreConfirm()
    event.preventDefault()
    return
  }
  if (isRepairConfirmOpen.value) {
    closeRepairConfirm()
    event.preventDefault()
    return
  }
  if (isImportConfirmOpen.value) {
    closeImportConfirm()
    event.preventDefault()
    return
  }
  if (!isResetConfirmOpen.value) return
  closeResetConfirm()
  event.preventDefault()
}

function applyIntegrityScanResult(scan) {
  const issueCount = Number(scan?.issueCount ?? sumNumericValues(scan?.issues) ?? 0) || 0
  integrityIssueCount.value = issueCount
  if (issueCount <= 0) {
    integrityStatusText.value = t('settings_data.integrity.status_ok', '目前帳本未偵測到完整性異常。')
    return
  }
  integrityStatusText.value = t(
    'settings_data.integrity.status_issues',
    { count: issueCount },
    '偵測到 {count} 項異常。啟動不會自動改寫；請先匯出備份後再明確修復，或改用還原路徑。',
  )
}

async function scanIntegrity() {
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    uiStore.pushToast(t('settings_data.integrity.no_ledger', '請先選擇帳本'), 'error')
    return
  }
  integrityBusy.value = true
  try {
    const before = await scanLedgerIntegrity(ledgerId)
    applyIntegrityScanResult({ issueCount: sumNumericValues(before), issues: before })
    uiStore.pushToast(
      integrityIssueCount.value > 0
        ? t('settings_data.integrity.toast_issues', { count: integrityIssueCount.value }, '偵測到 {count} 項異常（未自動修復）')
        : t('settings_data.integrity.toast_ok', '完整性掃描通過'),
      integrityIssueCount.value > 0 ? 'warning' : 'success',
    )
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.integrity.toast_failed', '完整性掃描失敗'), 'error')
  } finally {
    integrityBusy.value = false
  }
}

function openRepairConfirm() {
  if (integrityIssueCount.value <= 0) return
  isRepairConfirmOpen.value = true
  repairCountdown.value = 3
  if (repairTimerId) window.clearInterval(repairTimerId)
  repairTimerId = window.setInterval(() => {
    if (repairCountdown.value <= 1) {
      repairCountdown.value = 0
      if (repairTimerId) {
        window.clearInterval(repairTimerId)
        repairTimerId = null
      }
      return
    }
    repairCountdown.value -= 1
  }, 1000)
}

function closeRepairConfirm() {
  if (integrityBusy.value) return
  isRepairConfirmOpen.value = false
  repairCountdown.value = 0
  if (repairTimerId) {
    window.clearInterval(repairTimerId)
    repairTimerId = null
  }
}

async function confirmRepair() {
  if (repairCountdown.value > 0 || integrityBusy.value) return
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    uiStore.pushToast(t('settings_data.integrity.no_ledger', '請先選擇帳本'), 'error')
    return
  }
  integrityBusy.value = true
  try {
    const result = await repairLedgerData(ledgerId, {
      confirmed: true,
      reason: LEDGER_REPAIR_REASON.USER_EXPLICIT,
      source: 'SettingsDataManagementPage.confirmRepair',
    })
    const fixedCount = sumNumericValues(result?.fixed)
    const afterCount = sumNumericValues(result?.after)
    applyIntegrityScanResult({ issueCount: afterCount, issues: result?.after })
    await refreshAllStores()
    uiStore.pushToast(
      t(
        'settings_data.integrity.toast_repaired',
        { fixed: fixedCount, remaining: afterCount },
        '已明確修復 {fixed} 項，剩餘 {remaining} 項',
      ),
    )
    closeRepairConfirm()
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.integrity.toast_repair_failed', '修復失敗'), 'error')
  } finally {
    integrityBusy.value = false
  }
}

async function confirmResetAllData() {
  if (resetCountdown.value > 0 || resettingAllData.value) return

  resettingAllData.value = true
  try {
    await withOperationProgress('resetAll', async () => {
      // smb297: recovery backup failure must abort wipe — never swallow then resetDatabase.
      await runConfirmedWipeAfterRecoveryBackup({
        createRecoveryBackup: createResetRecoveryBackup,
        source: 'SettingsDataManagementPage.confirmResetAllData',
        i18nKey: 'settings_data.toast.recovery_backup_required',
        wipeFn: () => resetDatabase({
          confirmed: true,
          reason: DATA_WIPE_REASON.USER_RESET_ALL,
          source: 'SettingsDataManagementPage.confirmResetAllData',
        }),
      })
      localStorage.removeItem('straw.active_ledger_id')
      await ledgerStore.init()
      await refreshAllStores()
    })
    uiStore.pushToast(t('settings_data.toast.reset_done'))
    closeResetConfirm({ force: true })
  } catch (error) {
    const message =
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        ? t('settings_data.toast.recovery_backup_required', '本機 recovery 備份建立失敗，已中止清空本機資料。請先手動匯出後再重試。')
        : (error.message ?? t('settings_data.toast.reset_failed'))
    uiStore.pushToast(message, 'error')
  } finally {
    resettingAllData.value = false
  }
}

onMounted(() => {
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
  const lastScan = readLastLedgerIntegrityScan()
  if (lastScan && String(lastScan.ledgerId ?? '') === String(ledgerStore.activeLedgerId ?? '')) {
    applyIntegrityScanResult(lastScan)
  }
  void refreshLocalRecoveryBackups({ quiet: true })
})

onBeforeUnmount(() => {
  clearResetTimer()
  clearImportTimer()
  clearLocalRestoreTimer()
  clearOperationProgressTimer()
  if (repairTimerId) {
    window.clearInterval(repairTimerId)
    repairTimerId = null
  }
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})
</script>

<style scoped>.panel {
  padding: 14px;
  display: grid;
  gap: 10px
}
.recovery-list {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: 6px;
}
.recovery-list .link {
  color: var(--color-primary, #0a7);
  text-decoration: underline;
}
.local-recovery-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.local-recovery-item {
  display: grid;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border, rgba(127, 127, 127, 0.25));
}
.local-recovery-item:first-child {
  border-top: 0;
  padding-top: 0;
}
.local-recovery-meta {
  display: grid;
  gap: 4px;
}
.local-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.compact {
  margin: 0;
}
h2 {
  margin: 0
}
.page-head {
  align-items: center
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
h3 {
  margin: 0;
  font-size: 16px
}
.export-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
.export-path {
  margin: 0;
  word-break: break-all;
}
.csv-row {
  gap: 8px;
  align-items: center
}
.csv-select {
  max-width: 160px
}
.field {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px
}
.danger-panel {
  border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border))
}
.danger-btn {
  background: var(--surface-danger);
  color: var(--danger-text);
  border-color: color-mix(in srgb, var(--danger) 55%, transparent)
}
.danger-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed
}
.reset-mask {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--overlay-backdrop);
  z-index: 75
}
.reset-dialog {
  width: min(460px, calc(100vw - 24px));
  padding: 14px;
  border-radius: 14px;
  display: grid;
  gap: 10px
}
.action-row {
  margin-top: 6px;
  justify-content: flex-end;
  gap: 8px
}
.operation-progress-mask {
  position: fixed;
  inset: 0;
  z-index: 86;
  display: grid;
  place-items: center;
  padding: 18px;
  background: var(--overlay-backdrop);
}
.operation-progress-dialog {
  width: min(420px, calc(100vw - 28px));
  padding: 18px;
  border-radius: 18px;
  display: grid;
  gap: 10px;
  text-align: center;
}
.operation-progress-eyebrow {
  margin: 0;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.operation-progress-message {
  margin: 0;
}
.operation-progress-bar {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 65%, transparent);
}
.operation-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--ok) 60%, var(--primary)));
  transition: width 260ms ease;
}
.operation-progress-percent {
  color: var(--primary);
  font-size: 20px;
}</style>
