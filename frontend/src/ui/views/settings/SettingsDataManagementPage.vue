<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_data.title') }}</h2>
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

    <article class="card panel">
      <h3>{{ t('settings_data.import.title') }}</h3>
      <div>
        <p class="muted">{{ t('settings_data.import.json_desc') }}</p>
        <input ref="jsonInputRef" type="file" accept="application/json" class="input" @change="onImportJsonFile" />
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
const lastExportPath = ref('')
let resetTimerId = null

const resetConfirmLabel = computed(() => {
  if (resettingAllData.value) return t('settings_data.reset.processing')
  if (resetCountdown.value > 0) return t('settings_data.reset.confirm_countdown', { count: resetCountdown.value })
  return t('settings_data.reset.confirm')
})

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

async function onImportJsonFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await readFileAsText(file)
    await resetDatabase()
    const result = await importBackupJsonAsNewLedgers(text)
    await ledgerStore.refresh()
    if (result.firstLedgerId) {
      await ledgerStore.switchLedger(result.firstLedgerId)
    }
    await refreshAllStores()
    const importedCount = Number(result.importedLedgers?.length ?? 0)
    const importedName = result.firstLedgerName || result.importedLedgers?.[0]?.ledgerName || ''
    const importedLabel = importedCount > 1 ? `共 ${importedCount} 本` : importedName
    uiStore.pushToast(`${t('settings_data.toast.import_json_done', { ledgerName: importedLabel })}${importIntegrityHint(result.importedLedgers?.[0])}`)
  } catch (error) {
    uiStore.pushToast(error.message ?? t('settings_data.toast.import_json_failed'), 'error')
  } finally {
    if (jsonInputRef.value) jsonInputRef.value.value = ''
  }
}

async function onImportCsvFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await readFileAsText(file)
    const result = await importLedgerCsv(ledgerStore.activeLedgerId, text, csvImportType.value)
    await refreshAllStores()
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
  if (!isResetConfirmOpen.value) return
  closeResetConfirm()
  event.preventDefault()
}

async function confirmResetAllData() {
  if (resetCountdown.value > 0 || resettingAllData.value) return

  resettingAllData.value = true
  try {
    try {
      await createResetRecoveryBackup()
    } catch (backupError) {
      console.warn('[data-management] failed to create recovery backup before reset', backupError)
    }
    await resetDatabase()
    localStorage.removeItem('straw.active_ledger_id')
    await ledgerStore.init()
    await refreshAllStores()
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
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
})
</script>

<style scoped>.panel {
  padding: 14px;
  display: grid;
  gap: 10px
}
h2 {
  margin: 0
}
.page-head {
  align-items: center
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
}</style>
