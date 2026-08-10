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
        <li>{{ t('settings_data.recovery.tip_import', '下方 JSON 匯入會先要求確認並建立 recovery 備份後才清空本機。') }}</li>
        <li>{{ t('settings_data.recovery.tip_shared', '共同帳本伺服器綁定消失≠本機交易被刪；本機帳本仍在時請保留並重新加入／同步。') }}</li>
      </ul>
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
import { DATA_WIPE_REASON } from '@/core/services/data-wipe-guard.service'
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
const lastExportPath = ref('')
const operationProgress = ref(createIdleOperationProgress())
let resetTimerId = null
let importTimerId = null
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
  const filename = `strawmoneybook-recovery-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const data = await exportAllLedgersJson()
  const saved = await saveJsonFileToDevice(filename, data, { category: 'data-management' })
  if (saved?.saved && saved.location) {
    lastExportPath.value = saved.location
    return
  }
  downloadJsonFile(filename, data)
  lastExportPath.value = `Downloads/${filename}`
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
      try {
        await createResetRecoveryBackup()
      } catch (backupError) {
        console.warn('[data-management] failed to create recovery backup before import wipe', backupError)
      }
      await resetDatabase({
        confirmed: true,
        reason: DATA_WIPE_REASON.USER_IMPORT_JSON,
        source: 'SettingsDataManagementPage.confirmImportJson',
        note: pendingImportFileName.value,
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
    const fkMessage = error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || Number(error?.numericCode) === 1811
      || String(error?.i18nKey ?? '') === 'sqlite.error.foreign_key_constraint'
      ? t('settings_data.toast.foreign_key_constraint', '資料關聯不一致，操作已中止。請檢查匯入檔或先修復帳本資料。')
      : ''
    uiStore.pushToast(fkMessage || error.message || t('settings_data.toast.import_json_failed'), 'error')
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
  if (isImportConfirmOpen.value) {
    closeImportConfirm()
    event.preventDefault()
    return
  }
  if (!isResetConfirmOpen.value) return
  closeResetConfirm()
  event.preventDefault()
}

async function confirmResetAllData() {
  if (resetCountdown.value > 0 || resettingAllData.value) return

  resettingAllData.value = true
  try {
    await withOperationProgress('resetAll', async () => {
      try {
        await createResetRecoveryBackup()
      } catch (backupError) {
        console.warn('[data-management] failed to create recovery backup before reset', backupError)
      }
      await resetDatabase({
        confirmed: true,
        reason: DATA_WIPE_REASON.USER_RESET_ALL,
        source: 'SettingsDataManagementPage.confirmResetAllData',
      })
      localStorage.removeItem('straw.active_ledger_id')
      await ledgerStore.init()
      await refreshAllStores()
    })
    uiStore.pushToast(t('settings_data.toast.reset_done'))
    closeResetConfirm({ force: true })
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.toast.reset_failed'), 'error')
  } finally {
    resettingAllData.value = false
  }
}

onMounted(() => {
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
})

onBeforeUnmount(() => {
  clearResetTimer()
  clearImportTimer()
  clearOperationProgressTimer()
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
