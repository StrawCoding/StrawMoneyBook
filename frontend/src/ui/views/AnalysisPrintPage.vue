<template>
  <section
    class="stack export-page"
    data-testid="analysis-export-page"
    data-export-chrome="app-theme"
  >
    <article
      class="card panel screen-controls"
      data-testid="analysis-export-controls"
    >
      <header class="row">
        <h2>{{ t('analysis_print.title') }}</h2>
        <RouterLink class="btn back-btn" to="/analysis">{{ t('common.back') }}</RouterLink>
      </header>

      <div class="mode-tabs" data-testid="analysis-export-mode-tabs">
        <button
          class="btn"
          data-testid="analysis-export-mode-all"
          :class="{ primary: mode === 'all' }"
          @click="mode = 'all'"
        >{{ t('analysis_print.mode.all') }}</button>
        <button
          class="btn"
          data-testid="analysis-export-mode-year"
          :class="{ primary: mode === 'year' }"
          @click="mode = 'year'"
        >{{ t('analysis_print.mode.year') }}</button>
        <button
          class="btn"
          data-testid="analysis-export-mode-month"
          :class="{ primary: mode === 'month' }"
          @click="mode = 'month'"
        >{{ t('analysis_print.mode.month') }}</button>
        <button
          class="btn"
          data-testid="analysis-export-mode-day"
          :class="{ primary: mode === 'day' }"
          @click="mode = 'day'"
        >{{ t('analysis_print.mode.day') }}</button>
        <button
          class="btn"
          data-testid="analysis-export-mode-custom"
          :class="{ primary: mode === 'custom' }"
          @click="mode = 'custom'"
        >{{ t('analysis_print.mode.custom') }}</button>
      </div>

      <div class="picker-wrap">
        <transition name="fade-scale" mode="out-in">
          <div :key="mode">
            <HomeRangePicker v-if="mode === 'year'" mode="year" :year="selectedYear" @update:year="pickYear" />
            <HomeRangePicker v-else-if="mode === 'month'" mode="month" :month="selectedMonth" @update:month="pickMonth" />
            <HomeRangePicker v-else-if="mode === 'day'" mode="day" :day="selectedDay" @update:day="pickDay" />

            <div v-else-if="mode === 'custom'" class="custom-grid">
              <label>
                {{ t('analysis_print.custom_start_date') }}
                <HomeRangePicker mode="day" :day="startDate" @update:day="pickStartDay" />
              </label>
              <label>
                {{ t('analysis_print.custom_end_date') }}
                <HomeRangePicker mode="day" :day="endDate" @update:day="pickEndDay" />
              </label>
            </div>

            <div v-else class="muted all-hint">{{ t('analysis_print.all_hint') }}</div>
          </div>
        </transition>
      </div>

      <div class="action-row">
        <button
          class="btn primary"
          data-testid="analysis-export-pdf-btn"
          :disabled="exportingPdf || loadingReport"
          @click="exportPdf"
        >
          {{ exportingPdf ? t('analysis_print.exporting') : t('analysis_print.export_pdf') }}
        </button>
        <button class="btn" :disabled="exportingCsv" @click="exportCsv">
          {{ exportingCsv ? t('analysis_print.exporting') : t('analysis_print.export_csv') }}
        </button>
        <button
          v-if="exportedUrl"
          class="btn"
          data-testid="analysis-export-open-file-btn"
          @click="openExportLink"
        >{{ exportedActionLabel }}</button>
      </div>

      <p
        v-if="exportedFilename"
        class="muted file-note"
        data-testid="analysis-export-result"
        :data-filename="exportedFilename"
        :data-page-count="String(exportedPageCount || '')"
      >
        {{ t('analysis_print.file_label', { filename: exportedFilename }) }}
      </p>
      <p v-if="exportedLocation" class="muted file-note">{{ t('analysis_print.location_label', { location: exportedLocation }) }}</p>
      <p
        v-if="lastExportError"
        class="muted file-note"
        data-testid="analysis-export-error"
      >
        {{ lastExportError }}
      </p>
    </article>

    <article
      class="card panel preview-panel"
      data-testid="analysis-export-preview-chrome"
    >
      <header class="row preview-chrome-head">
        <h3>{{ t('analysis_print.preview_title') }}</h3>
        <span class="count-chip">{{ t('analysis_page.items_count', { count: detailRows.length }) }}</span>
      </header>

      <div v-if="loadingReport" class="muted loading-note">{{ t('app.loading') }}</div>
      <div
        v-else
        class="report-preview-frame"
        data-testid="analysis-export-report-frame"
      >
        <AnalysisReportDocument
          ref="reportDocumentRef"
          :title="t('analysis_print.export_pdf')"
          :ledger-name="ledgerName"
          :period-label="currentRangeLabel"
          :exported-at-label="exportedAtLabel"
          :currency-code="currencyCode"
          :filter-label="filterLabel"
          :income-items="incomeBarRows"
          :expense-items="expenseBarRows"
          :account-items="accountBarRows"
          :budget-cards="budgetCards"
          :detail-rows="detailRows"
          :income-total-minor="incomeTotalMinor"
          :expense-total-minor="expenseTotalMinor"
          :income-count="incomeCount"
          :expense-count="expenseCount"
          :account-total-minor="accountTotalMinor"
          :account-count="accountCount"
        />
      </div>
    </article>
  </section>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import AnalysisReportDocument from '@/ui/components/analysis/AnalysisReportDocument.vue'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  createCsvBlobUrl,
  createPdfBlobUrl,
  exportLedgerTransactionsCsv,
  getLedgerTransactionsExportData,
  openFileUrl,
  revokeBlobUrl,
  saveCsvFileToDevice,
  savePdfFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import { buildAnalysisReportPdfFromElement } from '@/core/services/analysis-report-pdf.service'
import { useI18n } from '@/ui/services/i18n.service'
import { isCountableForIncomeExpense } from '@/ui/utils/refund-transaction'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  buildAccountBalanceBreakdown,
  buildBarRows,
  buildBreakdownRows,
} from '@/core/utils/analysis-breakdown'
import {
  ANALYSIS_CHART_SWATCHES,
  buildAnalysisDetailRows,
  buildAnalysisReportPdfFilename,
  buildBudgetAchievementCards,
} from '@/core/utils/analysis-report'

const route = useRoute()
const accountStore = useAccountStore()
const budgetStore = useBudgetStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const mode = ref(parseMode(String(route.query.mode || 'month')))
const selectedYear = ref(Number(route.query.year || new Date().getFullYear()))
const selectedMonth = ref(String(route.query.month || monthKeyFromDate(new Date())))
const selectedDay = ref(String(route.query.day || dayKeyFromDate(new Date())))
const startDate = ref(String(route.query.start || dayKeyFromDate(new Date())))
const endDate = ref(String(route.query.end || dayKeyFromDate(new Date())))
const exportingCsv = ref(false)
const exportingPdf = ref(false)
const loadingReport = ref(false)
const reportData = ref(createEmptyReportData())
const exportedUrl = ref('')
const exportedFilename = ref('')
const exportedLocation = ref('')
const exportedPageCount = ref(0)
const lastExportError = ref('')
const reportDocumentRef = ref(null)
const exportedAtLabel = ref(formatDateTime(new Date()))

const exportedActionLabel = computed(() => t('analysis_print.open_link'))
const ledgerName = computed(() => reportData.value.ledgerName || ledgerStore.activeLedger?.name || '')
const currencyCode = computed(() => String(ledgerStore.activeLedger?.currency_code ?? 'TWD'))
const categoryNameMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) map.set(category.id, category.name)
  return map
})
const categoryIconMap = computed(() => {
  const map = new Map()
  for (const category of categoryStore.categories) map.set(category.id, String(category.icon ?? '').trim())
  return map
})
const accountNameMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) map.set(account.id, account.name)
  return map
})
const accountIconMap = computed(() => {
  const map = new Map()
  for (const account of accountStore.accounts) map.set(account.id, String(account.icon ?? '').trim())
  return map
})
const accountBalanceMap = computed(() => {
  const map = new Map()
  for (const item of accountStore.balances) map.set(item.id, Number(item.balance_minor ?? 0))
  return map
})

const expenseBreakdown = computed(() => buildBreakdown('expense'))
const incomeBreakdown = computed(() => buildBreakdown('income'))
const accountBreakdown = computed(() => buildAccountBalanceBreakdown({
  accounts: accountStore.accounts,
  accountBalanceMap: accountBalanceMap.value,
  swatches: ANALYSIS_CHART_SWATCHES,
}))
const expenseBarRows = computed(() => buildBarRows(expenseBreakdown.value))
const incomeBarRows = computed(() => buildBarRows(incomeBreakdown.value))
const accountBarRows = computed(() => buildBarRows(accountBreakdown.value))
const expenseTotalMinor = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const incomeTotalMinor = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const expenseCount = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.count, 0))
const incomeCount = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.count, 0))
const accountTotalMinor = computed(() => accountBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const accountCount = computed(() => accountBreakdown.value.length)
const budgetCards = computed(() => buildBudgetAchievementCards({
  items: budgetStore.items,
  containers: budgetStore.containersWithStats,
  spentMap: budgetStore.spentMap,
  categoryNameMap: categoryNameMap.value,
  categoryIconMap: categoryIconMap.value,
}))
const detailRows = computed(() => buildAnalysisDetailRows(reportData.value.records ?? [], {
  typeLabel: (type) => {
    if (type === 'income') return t('analysis_page.type.income')
    if (type === 'expense') return t('analysis_page.type.expense')
    if (type === 'transfer') return t('transaction_about.type.transfer')
    return t('transaction_about.type.adjustment')
  },
  uncategorizedLabel: t('analysis_page.uncategorized'),
  unassignedAccountLabel: t('analysis_page.unassigned_account'),
}))
const currentRangeLabel = computed(() => {
  if (mode.value === 'year') return `${t('analysis_print.mode.year')}｜${selectedYear.value}`
  if (mode.value === 'month') return `${t('analysis_print.mode.month')}｜${selectedMonth.value}`
  if (mode.value === 'day') return `${t('analysis_print.mode.day')}｜${selectedDay.value}`
  if (mode.value === 'custom') return `${t('analysis_print.mode.custom')}｜${startDate.value} ~ ${endDate.value}`
  return t('analysis_print.all_hint')
})
const filterLabel = computed(() => {
  if (mode.value === 'all') return ''
  return currentRangeLabel.value
})

watch(
  () => [ledgerStore.activeLedgerId, mode.value, selectedYear.value, selectedMonth.value, selectedDay.value, startDate.value, endDate.value],
  () => {
    void loadReportData()
  },
  { immediate: true },
)

function createEmptyReportData() {
  return {
    mode: 'all',
    ledgerName: '',
    rowCount: 0,
    csvRows: [],
    excelRows: [],
    records: [],
  }
}

function parseMode(value) {
  return ['all', 'year', 'month', 'day', 'custom'].includes(value) ? value : 'month'
}

function pickYear(value) {
  selectedYear.value = Number(value)
}

function pickMonth(value) {
  selectedMonth.value = value
}

function pickDay(value) {
  selectedDay.value = value
}

function pickStartDay(value) {
  startDate.value = value
}

function pickEndDay(value) {
  endDate.value = value
}

function buildExportOptions() {
  return {
    mode: mode.value,
    yearKey: String(selectedYear.value),
    monthKey: selectedMonth.value,
    dayKey: selectedDay.value,
    startDate: startDate.value,
    endDate: endDate.value,
  }
}

function validateRange(showToast = false) {
  if (mode.value !== 'custom') return true
  if (!startDate.value || !endDate.value) {
    if (showToast) uiStore.pushToast(t('analysis_print.toast.choose_custom_range'), 'error')
    return false
  }
  if (startDate.value > endDate.value) {
    if (showToast) uiStore.pushToast(t('analysis_print.toast.invalid_custom_range'), 'error')
    return false
  }
  return true
}

async function ensureBudgetLoaded() {
  const monthKey = mode.value === 'month'
    ? selectedMonth.value
    : mode.value === 'day'
      ? String(selectedDay.value).slice(0, 7)
      : monthKeyFromDate(new Date())
  try {
    await budgetStore.loadMonth(monthKey)
  } catch {
    // budget section is optional for report export
  }
}

async function loadReportData() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !validateRange(false)) {
    loadingReport.value = false
    reportData.value = createEmptyReportData()
    return
  }

  loadingReport.value = true
  exportedAtLabel.value = formatDateTime(new Date())
  try {
    if (!categoryStore.categories.length) await categoryStore.load?.()
    if (!accountStore.accounts.length) await accountStore.load?.()
    await ensureBudgetLoaded()
    reportData.value = await getLedgerTransactionsExportData(ledgerId, buildExportOptions())
  } catch (error) {
    reportData.value = createEmptyReportData()
    uiStore.pushToast(error.message ?? t('analysis_print.toast.export_failed'), 'error')
  } finally {
    loadingReport.value = false
  }
}

function buildBreakdown(type) {
  const categoryNameMapLocal = new Map()
  const categoryIconMapLocal = new Map()
  const accountNameMapLocal = new Map()
  const accountIconMapLocal = new Map()

  for (const [id, name] of categoryNameMap.value.entries()) categoryNameMapLocal.set(id, name)
  for (const [id, icon] of categoryIconMap.value.entries()) categoryIconMapLocal.set(id, icon)
  for (const [id, name] of accountNameMap.value.entries()) accountNameMapLocal.set(id, name)
  for (const [id, icon] of accountIconMap.value.entries()) accountIconMapLocal.set(id, icon)

  for (const tx of reportData.value.records ?? []) {
    const categoryId = String(tx?.category_id ?? '').trim()
    if (categoryId && !categoryNameMapLocal.has(categoryId)) {
      categoryNameMapLocal.set(categoryId, String(tx?.category_name ?? '').trim())
      categoryIconMapLocal.set(categoryId, String(tx?.category_icon ?? '').trim())
    }
    const accountId = String(tx?.account_id ?? '').trim()
    if (accountId && !accountNameMapLocal.has(accountId)) {
      accountNameMapLocal.set(accountId, String(tx?.account_name ?? '').trim())
      accountIconMapLocal.set(accountId, String(tx?.account_icon ?? '').trim())
    }
  }

  return buildBreakdownRows({
    transactions: reportData.value.records ?? [],
    type,
    scope: 'category',
    shouldIncludeTransaction: isCountableForIncomeExpense,
    categoryNameMap: categoryNameMapLocal,
    categoryIconMap: categoryIconMapLocal,
    accountNameMap: accountNameMapLocal,
    accountIconMap: accountIconMapLocal,
    getAddonLabel: (label) => t('analysis_page.addon_item', { label }),
    getUncategorizedLabel: () => t('analysis_page.uncategorized'),
    getUnassignedAccountLabel: () => t('analysis_page.unassigned_account'),
    swatches: ANALYSIS_CHART_SWATCHES,
  })
}

async function exportCsv() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    uiStore.pushToast(t('analysis_print.toast.no_ledger'), 'error')
    return
  }
  if (!validateRange(true)) return

  exportingCsv.value = true
  try {
    const result = await exportLedgerTransactionsCsv(ledgerId, buildExportOptions())
    exportedFilename.value = result.filename
    const deviceSave = await saveCsvFileToDevice(result.filename, result.csvText, { category: 'analysis' })

    if (deviceSave.saved) {
      exportedFilename.value = String(deviceSave.filename ?? result.filename)
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = String(deviceSave.uri ?? '').trim()
        || String(deviceSave.openUrl ?? '').trim()
        || createCsvBlobUrl(result.csvText)
      exportedLocation.value = deviceSave.location || t('analysis_print.device_location_default')
      uiStore.pushToast(t('analysis_print.toast.exported_saved', { count: result.rowCount, location: exportedLocation.value }))
      return
    }

    exportedLocation.value = Capacitor.isNativePlatform() ? 'App 內預覽' : ''
    revokeBlobUrl(exportedUrl.value)
    exportedUrl.value = createCsvBlobUrl(result.csvText)
    openExportLink()
    uiStore.pushToast(t('analysis_print.toast.exported_downloaded', { count: result.rowCount }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('analysis_print.toast.export_failed'), 'error')
  } finally {
    exportingCsv.value = false
  }
}

async function exportPdf() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    uiStore.pushToast(t('analysis_print.toast.no_ledger'), 'error')
    return
  }
  if (!validateRange(true)) return

  exportingPdf.value = true
  lastExportError.value = ''
  exportedAtLabel.value = formatDateTime(new Date())
  try {
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const element = reportDocumentRef.value?.getElement?.() || document.getElementById('analysis-report-document')
    if (!element) {
      throw new Error(t('analysis_print.toast.preview_missing'))
    }

    const options = buildExportOptions()
    const filename = buildAnalysisReportPdfFilename(options)
    const pdfFile = await buildAnalysisReportPdfFromElement(element, {
      ...options,
      filename,
      pageLabel: (page, total) => t('analysis_print.page_label', { page, total }),
    })

    exportedFilename.value = pdfFile.filename
    exportedPageCount.value = Number(pdfFile.pageCount ?? 0)
    const deviceSave = await savePdfFileToDevice(pdfFile.filename, pdfFile.blob, { category: 'analysis' })
    if (deviceSave.saved) {
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = String(deviceSave.uri ?? '').trim()
        || String(deviceSave.openUrl ?? '').trim()
        || createPdfBlobUrl(pdfFile.blob)
      exportedLocation.value = deviceSave.location || t('analysis_print.device_location_default')
      uiStore.pushToast(t('analysis_print.toast.pdf_saved', {
        filename: exportedFilename.value,
        location: exportedLocation.value,
      }))
      return
    }

    exportedLocation.value = Capacitor.isNativePlatform() ? 'App 內預覽' : ''
    revokeBlobUrl(exportedUrl.value)
    exportedUrl.value = createPdfBlobUrl(pdfFile.blob)
    triggerDownloadFromUrl(exportedUrl.value, pdfFile.filename)
    uiStore.pushToast(t('analysis_print.toast.pdf_downloaded', { filename: pdfFile.filename }))
  } catch (error) {
    lastExportError.value = String(error?.message ?? error ?? t('analysis_print.toast.export_failed'))
    // Failed export must not present a new openable URL; keep prior successful URL if any.
    uiStore.pushToast(lastExportError.value, 'error')
  } finally {
    exportingPdf.value = false
  }
}

function openExportLink() {
  if (!exportedUrl.value) return
  const opened = openFileUrl(exportedUrl.value)
  if (!opened && exportedFilename.value) {
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  }
}

onBeforeUnmount(() => {
  revokeBlobUrl(exportedUrl.value)
})

function dayKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateTime(date) {
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3 {
  margin: 0;
  color: var(--text);
}

.export-page {
  padding-bottom: 120px;
  color: var(--text);
}

.screen-controls,
.preview-panel {
  background: var(--card);
  color: var(--text);
  border-color: var(--border);
}

.mode-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.picker-wrap {
  margin-top: 10px;
}

.custom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.all-hint {
  padding: 8px 0;
  color: var(--muted);
}

.action-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.action-row > .btn {
  flex: 0 0 auto;
  width: auto;
  white-space: nowrap;
}

.file-note {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: var(--muted);
}

.preview-panel {
  display: grid;
  gap: 14px;
}

.preview-chrome-head h3 {
  color: var(--text);
}

.loading-note {
  padding: 12px 0;
  color: var(--muted);
}

.count-chip {
  border: 1px solid var(--field-border);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--muted);
  background: var(--bg-soft);
  white-space: nowrap;
}

/* Outer frame follows App theme; report body stays light-isolated */
.report-preview-frame {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  background: var(--bg-soft);
  overflow: auto;
}

@media (max-width: 720px) {
  .mode-tabs,
  .custom-grid {
    grid-template-columns: 1fr;
  }
}
</style>
