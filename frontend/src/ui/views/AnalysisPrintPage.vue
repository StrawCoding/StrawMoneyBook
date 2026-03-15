<template>
  <section class="stack export-page">
    <article class="card panel screen-only">
      <header class="row">
        <h2>{{ t('analysis_print.title') }}</h2>
        <RouterLink class="btn back-btn" to="/analysis">{{ t('common.back') }}</RouterLink>
      </header>

      <div class="mode-tabs">
        <button class="btn" :class="{ primary: mode === 'all' }" @click="mode = 'all'">{{ t('analysis_print.mode.all') }}</button>
        <button class="btn" :class="{ primary: mode === 'year' }" @click="mode = 'year'">{{ t('analysis_print.mode.year') }}</button>
        <button class="btn" :class="{ primary: mode === 'month' }" @click="mode = 'month'">{{ t('analysis_print.mode.month') }}</button>
        <button class="btn" :class="{ primary: mode === 'day' }" @click="mode = 'day'">{{ t('analysis_print.mode.day') }}</button>
        <button class="btn" :class="{ primary: mode === 'custom' }" @click="mode = 'custom'">{{ t('analysis_print.mode.custom') }}</button>
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
        <button class="btn primary" :disabled="exporting" @click="exportCsv">
          {{ exporting ? t('analysis_print.exporting') : t('analysis_print.export_csv') }}
        </button>
        <button v-if="exportedUrl" class="btn" @click="openExportLink">{{ exportedActionLabel }}</button>
      </div>

      <p v-if="exportedFilename" class="muted file-note">{{ t('analysis_print.file_label', { filename: exportedFilename }) }}</p>
      <p v-if="exportedLocation" class="muted file-note">{{ t('analysis_print.location_label', { location: exportedLocation }) }}</p>
    </article>

    <article class="card panel screen-only">
      <header class="row">
        <h3>{{ t('analysis_print.fields_title') }}</h3>
      </header>
      <ul class="fields-list">
        <li>{{ t('analysis_print.fields.item_1') }}</li>
        <li>{{ t('analysis_print.fields.item_2') }}</li>
        <li>{{ t('analysis_print.fields.item_3') }}</li>
      </ul>
    </article>

    <article class="card panel report-panel print-only" id="analysis-print-report">
      <header class="row report-head">
        <div>
          <h3>{{ t('analysis_print.export_pdf') }}</h3>
          <p class="muted report-meta">{{ currentRangeLabel }}</p>
        </div>
        <span class="count-chip">{{ t('analysis_page.items_count', { count: reportRowCount }) }}</span>
      </header>

      <div v-if="loadingReport" class="muted loading-note">{{ t('app.loading') }}</div>

      <template v-else>
        <section class="summary-grid">
          <article v-for="section in chartSections" :key="section.key" class="summary-card">
            <small class="muted">{{ t('analysis_page.type_total', { type: section.label }) }}</small>
            <MoneyText :value-minor="section.totalMinor" :tone="section.key" />
            <small class="muted">{{ t('analysis_page.items_count', { count: section.count }) }}</small>
          </article>
        </section>

        <section v-for="section in chartSections" :key="`${section.key}-chart`" class="chart-section">
          <header class="row chart-head">
            <h4>{{ t('analysis_page.type_analysis', { type: section.label }) }}</h4>
            <span class="muted">{{ t('analysis_page.items_count', { count: section.count }) }}</span>
          </header>

          <template v-if="section.items.length">
            <div class="chart-layout">
              <div class="pie-panel">
                <div class="chart-title">{{ t('analysis_page.chart.pie') }}</div>
                <div class="pie" :style="section.pieStyle">
                  <div class="pie-hole">
                    <small class="muted">{{ t('analysis_page.type_total', { type: section.label }) }}</small>
                    <MoneyText :value-minor="section.totalMinor" :tone="section.key" />
                  </div>
                </div>
              </div>

              <div class="legend-panel">
                <div class="chart-title">{{ t('analysis_page.chart.bar') }}</div>
                <ul class="bar-chart-list">
                  <li v-for="item in section.items" :key="`${section.key}-${item.id}`" class="bar-chart-item">
                    <div class="bar-chart-head">
                      <div class="bar-chart-label">
                        <span class="legend-dot" :style="{ background: item.color }"></span>
                        <span v-if="item.icon" class="legend-icon-wrap">
                          <font-awesome-icon :icon="item.icon" class="legend-icon" />
                        </span>
                        <span class="bar-chart-name">{{ item.name }}</span>
                      </div>
                      <span class="bar-chart-percent">{{ item.percent }}%</span>
                    </div>
                    <div class="bar-chart-track">
                      <span class="bar-chart-fill" :style="{ width: `${item.barWidthPercent}%`, background: item.color }"></span>
                    </div>
                    <div class="bar-chart-stats">
                      <MoneyText :value-minor="item.amountMinor" :tone="section.key" />
                      <span class="muted">{{ t('analysis_page.items_count', { count: item.count }) }}</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </template>

          <p v-else class="muted no-data-tip">{{ t('analysis_page.no_data_for_type', { type: section.label.toLowerCase() }) }}</p>
        </section>

        <section class="table-section">
          <header class="row chart-head">
            <h4>{{ t('analysis_print.fields_title') }}</h4>
            <span class="muted">{{ t('analysis_page.items_count', { count: reportRowCount }) }}</span>
          </header>

          <div class="table-wrap">
            <table class="report-table">
              <thead>
                <tr>
                  <th v-for="header in csvHeaders" :key="header">{{ header }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in previewRows" :key="`row-${index}`">
                  <td v-for="header in csvHeaders" :key="`${index}-${header}`">{{ row[header] }}</td>
                </tr>
                <tr v-if="!previewRows.length">
                  <td :colspan="csvHeaders.length" class="empty-cell">{{ t('analysis_page.no_data_for_type', { type: t('analysis_print.mode.all') }) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </article>
  </section>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  CSV_HEADERS,
  createCsvBlobUrl,
  exportLedgerTransactionsCsv,
  getLedgerTransactionsExportData,
  openFileUrl,
  revokeBlobUrl,
  saveCsvFileToDevice,
  triggerDownloadFromUrl,
} from '@/core/services/export.service'
import { useI18n } from '@/ui/services/i18n.service'

const route = useRoute()
const ledgerStore = useLedgerStore()
const uiStore = useUiStore()
const { t } = useI18n()

const mode = ref(parseMode(String(route.query.mode || 'all')))
const selectedYear = ref(Number(route.query.year || new Date().getFullYear()))
const selectedMonth = ref(String(route.query.month || monthKeyFromDate(new Date())))
const selectedDay = ref(String(route.query.day || dayKeyFromDate(new Date())))
const startDate = ref(String(route.query.start || dayKeyFromDate(new Date())))
const endDate = ref(String(route.query.end || dayKeyFromDate(new Date())))
const exporting = ref(false)
const loadingReport = ref(false)
const reportData = ref(createEmptyReportData())
const exportedUrl = ref('')
const exportedFilename = ref('')
const exportedLocation = ref('')
const exportedIsDeviceLink = ref(false)
const exportedActionLabel = computed(() => t('analysis_print.open_link'))
const csvHeaders = CSV_HEADERS
const CHART_MULTI_COLOR_SWATCHES = [
  'color-mix(in srgb, #ff6b6b 82%, var(--card) 18%)',
  'color-mix(in srgb, #ffa94d 82%, var(--card) 18%)',
  'color-mix(in srgb, #ffd43b 82%, var(--card) 18%)',
  'color-mix(in srgb, #69db7c 82%, var(--card) 18%)',
  'color-mix(in srgb, #38d9a9 82%, var(--card) 18%)',
  'color-mix(in srgb, #4dabf7 82%, var(--card) 18%)',
  'color-mix(in srgb, #748ffc 82%, var(--card) 18%)',
  'color-mix(in srgb, #9775fa 82%, var(--card) 18%)',
  'color-mix(in srgb, #cc5de8 82%, var(--card) 18%)',
  'color-mix(in srgb, #f06595 82%, var(--card) 18%)',
]

const previewRows = computed(() => reportData.value.csvRows ?? [])
const reportRowCount = computed(() => Number(reportData.value.rowCount ?? previewRows.value.length))
const expenseBreakdown = computed(() => buildBreakdown('expense'))
const incomeBreakdown = computed(() => buildBreakdown('income'))
const expenseTotalMinor = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const incomeTotalMinor = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.amountMinor, 0))
const expenseCount = computed(() => expenseBreakdown.value.reduce((total, item) => total + item.count, 0))
const incomeCount = computed(() => incomeBreakdown.value.reduce((total, item) => total + item.count, 0))
const chartSections = computed(() => [
  {
    key: 'expense',
    label: t('analysis_page.type.expense'),
    items: buildBarRows(expenseBreakdown.value),
    totalMinor: expenseTotalMinor.value,
    count: expenseCount.value,
    pieStyle: buildPieStyle(expenseBreakdown.value),
  },
  {
    key: 'income',
    label: t('analysis_page.type.income'),
    items: buildBarRows(incomeBreakdown.value),
    totalMinor: incomeTotalMinor.value,
    count: incomeCount.value,
    pieStyle: buildPieStyle(incomeBreakdown.value),
  },
])
const currentRangeLabel = computed(() => {
  if (mode.value === 'year') return `${t('analysis_print.mode.year')}｜${selectedYear.value}`
  if (mode.value === 'month') return `${t('analysis_print.mode.month')}｜${selectedMonth.value}`
  if (mode.value === 'day') return `${t('analysis_print.mode.day')}｜${selectedDay.value}`
  if (mode.value === 'custom') return `${t('analysis_print.mode.custom')}｜${startDate.value} ~ ${endDate.value}`
  return t('analysis_print.all_hint')
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
  return ['all', 'year', 'month', 'day', 'custom'].includes(value) ? value : 'all'
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
    if (showToast) {
      uiStore.pushToast(t('analysis_print.toast.choose_custom_range'), 'error')
    }
    return false
  }
  if (startDate.value > endDate.value) {
    if (showToast) {
      uiStore.pushToast(t('analysis_print.toast.invalid_custom_range'), 'error')
    }
    return false
  }
  return true
}

async function loadReportData() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId || !validateRange(false)) {
    loadingReport.value = false
    reportData.value = createEmptyReportData()
    return
  }

  loadingReport.value = true
  try {
    reportData.value = await getLedgerTransactionsExportData(ledgerId, buildExportOptions())
  } catch (error) {
    reportData.value = createEmptyReportData()
    uiStore.pushToast(error.message ?? t('analysis_print.toast.export_failed'), 'error')
  } finally {
    loadingReport.value = false
  }
}

async function exportCsv() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    uiStore.pushToast(t('analysis_print.toast.no_ledger'), 'error')
    return
  }
  if (!validateRange(true)) return

  exporting.value = true
  try {
    const result = await exportLedgerTransactionsCsv(ledgerId, buildExportOptions())

    exportedFilename.value = result.filename
    const deviceSave = await saveCsvFileToDevice(result.filename, result.csvText)

    if (deviceSave.saved) {
      exportedFilename.value = String(deviceSave.filename ?? result.filename)
      revokeBlobUrl(exportedUrl.value)
      exportedUrl.value = String(deviceSave.uri ?? '').trim()
        || String(deviceSave.openUrl ?? '').trim()
        || createCsvBlobUrl(result.csvText)
      exportedIsDeviceLink.value = Boolean(String(deviceSave.uri ?? '').trim() || String(deviceSave.openUrl ?? '').trim())
      exportedLocation.value = deviceSave.location || t('analysis_print.device_location_default')
      uiStore.pushToast(t('analysis_print.toast.exported_saved', { count: result.rowCount, location: exportedLocation.value }))
      return
    }

    exportedLocation.value = Capacitor.isNativePlatform()
      ? 'App 內預覽'
      : ''
    revokeBlobUrl(exportedUrl.value)
    exportedUrl.value = createCsvBlobUrl(result.csvText)
    exportedIsDeviceLink.value = false
    openExportLink()
    uiStore.pushToast(t('analysis_print.toast.exported_downloaded', { count: result.rowCount }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('analysis_print.toast.export_failed'), 'error')
  } finally {
    exporting.value = false
  }
}

function openExportLink() {
  if (!exportedUrl.value) return
  const opened = openFileUrl(exportedUrl.value)
  if (!opened && exportedFilename.value) {
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
  }
}

function buildBreakdown(type) {
  const map = new Map()
  for (const tx of reportData.value.records ?? []) {
    if (!Number(tx.include_in_analysis ?? 1)) continue
    if (tx.type !== type || tx.origin_type === 'loan_payment') continue

    const amountMinor = type === 'expense' ? Math.abs(Number(tx.amount_minor ?? 0)) : Number(tx.amount_minor ?? 0)
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) continue

    const key = String(tx.category_id ?? '').trim() || '__uncategorized__'
    const current = map.get(key) || {
      id: key,
      amountMinor: 0,
      count: 0,
      name: String(tx.category_name ?? '').trim() || t('analysis_page.uncategorized'),
      icon: String(tx.category_icon ?? '').trim(),
    }
    current.amountMinor += amountMinor
    current.count += 1
    if (!current.name) {
      current.name = t('analysis_page.uncategorized')
    }
    map.set(key, current)
  }

  const rows = Array.from(map.values()).sort((a, b) => b.amountMinor - a.amountMinor)
  if (!rows.length) return []

  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)
  const palette = buildThemePalette(rows.length)
  return rows.map((row, index) => ({
    ...row,
    color: palette[index],
    percent: Math.round((row.amountMinor / total) * 100),
  }))
}

function buildThemePalette(count) {
  const safeCount = Math.max(1, Number(count) || 1)
  const palette = CHART_MULTI_COLOR_SWATCHES.slice(0, safeCount)
  if (palette.length >= safeCount) return palette

  for (let index = palette.length; index < safeCount; index += 1) {
    const hue = (index * 137.508) % 360
    palette.push(`color-mix(in srgb, hsl(${hue.toFixed(2)}deg 82% 62%) 82%, var(--card) 18%)`)
  }

  return palette
}

function buildPieStyle(items) {
  if (!items.length) {
    return { background: 'conic-gradient(var(--chart-track) 0deg 360deg)' }
  }

  const total = items.reduce((sum, item) => sum + item.amountMinor, 0)
  let cursor = 0
  const segments = []

  for (const item of items) {
    const deg = (item.amountMinor / total) * 360
    const start = cursor
    const end = cursor + deg
    segments.push(`${item.color} ${start}deg ${end}deg`)
    cursor = end
  }

  return { background: `conic-gradient(${segments.join(', ')})` }
}

function buildBarRows(items) {
  const source = Array.isArray(items) ? items : []
  if (!source.length) return []

  const maxAmount = source.reduce((max, item) => Math.max(max, Number(item?.amountMinor ?? 0) || 0), 0)
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    return source.map((item) => ({ ...item, barWidthPercent: 0 }))
  }

  return source.map((item) => ({
    ...item,
    barWidthPercent: Math.max(8, Math.round((item.amountMinor / maxAmount) * 100)),
  }))
}

onBeforeUnmount(() => {
  revokeBlobUrl(exportedUrl.value)
})

function monthKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dayKeyFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3,
h4 {
  margin: 0;
}

.export-page {
  padding-bottom: 120px;
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
}

.action-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
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
}

.fields-list {
  margin: 12px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
}

.report-panel {
  display: grid;
  gap: 14px;
}

.print-only {
  display: none;
}

.report-head {
  align-items: flex-start;
  gap: 12px;
}

.report-meta {
  margin: 4px 0 0;
}

.loading-note {
  padding: 12px 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 6px;
  background: color-mix(in srgb, var(--card) 86%, var(--surface-soft-accent) 14%);
}

.chart-section {
  display: grid;
  gap: 10px;
  break-inside: avoid;
}

.chart-head {
  gap: 12px;
}

.chart-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.pie-panel,
.legend-panel,
.table-section {
  border: 1px solid var(--field-border);
  border-radius: 14px;
  padding: 12px;
  background: color-mix(in srgb, var(--card) 90%, var(--surface-soft-accent) 10%);
}

.chart-title {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
}

.pie {
  width: min(220px, 100%);
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  margin: 0 auto;
}

.pie-hole {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  background: var(--card);
  display: grid;
  place-items: center;
  text-align: center;
  gap: 4px;
  padding: 14px;
}

.bar-chart-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.bar-chart-item {
  display: grid;
  gap: 6px;
}

.bar-chart-head,
.bar-chart-stats,
.bar-chart-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bar-chart-label {
  justify-content: flex-start;
  min-width: 0;
}

.bar-chart-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-chart-track {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--field-border) 75%, var(--card) 25%);
}

.bar-chart-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.legend-icon-wrap {
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.legend-icon {
  width: 14px;
}

.table-wrap {
  overflow: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.report-table th,
.report-table td {
  border: 1px solid var(--field-border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
}

.report-table th {
  background: color-mix(in srgb, var(--card) 82%, var(--surface-soft-accent) 18%);
}

.empty-cell {
  text-align: center;
  color: var(--muted);
}

.count-chip {
  border: 1px solid var(--field-border);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.no-data-tip {
  margin: 0;
}

@media (max-width: 720px) {
  .mode-tabs,
  .summary-grid,
  .custom-grid {
    grid-template-columns: 1fr;
  }

  .chart-layout {
    grid-template-columns: 1fr;
  }
}

@page {
  size: A4 landscape;
  margin: 10mm;
}

@media print {
  .screen-only {
    display: none !important;
  }

  .print-only {
    display: grid !important;
  }

  .export-page {
    padding: 0;
  }

  .report-panel,
  .pie-panel,
  .legend-panel,
  .table-section,
  .summary-card {
    border-color: #d6d6d6;
    box-shadow: none;
  }

  .report-panel {
    padding: 0;
  }

  .table-wrap {
    overflow: visible;
  }

  .report-table {
    font-size: 10px;
  }

  .pie,
  .bar-chart-fill,
  .legend-dot {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
