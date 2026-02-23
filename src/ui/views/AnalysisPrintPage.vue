<template>
  <section class="stack export-page">
    <article class="card panel">
      <header class="row">
        <h2>{{ t('analysis_print.title') }}</h2>
        <RouterLink class="btn back-btn" :to="backLink">{{ t('common.back') }}</RouterLink>
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

    <article class="card panel">
      <header class="row">
        <h3>{{ t('analysis_print.fields_title') }}</h3>
      </header>
      <ul class="fields-list">
        <li>{{ t('analysis_print.fields.item_1') }}</li>
        <li>{{ t('analysis_print.fields.item_2') }}</li>
        <li>{{ t('analysis_print.fields.item_3') }}</li>
      </ul>
    </article>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import HomeRangePicker from '@/ui/components/common/HomeRangePicker.vue'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  createCsvBlobUrl,
  exportLedgerTransactionsCsv,
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
const exportedUrl = ref('')
const exportedFilename = ref('')
const exportedLocation = ref('')
const exportedIsDeviceLink = ref(false)
const exportedActionLabel = computed(() => (exportedIsDeviceLink.value ? t('analysis_print.open_link') : t('analysis_print.download_again')))
const exportScope = computed(() => String(route.query.scope ?? '').trim())
const exportTxIds = computed(() => String(route.query.txIds ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean))
const backLink = computed(() => {
  if (String(route.query.from ?? '').trim() === 'reimbursements') {
    const tab = String(route.query.tab ?? '').trim()
    return tab ? { path: '/reimbursements', query: { tab } } : { path: '/reimbursements' }
  }
  return '/analysis'
})

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

async function exportCsv() {
  const ledgerId = ledgerStore.activeLedgerId
  if (!ledgerId) {
    uiStore.pushToast(t('analysis_print.toast.no_ledger'), 'error')
    return
  }

  if (mode.value === 'custom' && (!startDate.value || !endDate.value)) {
    uiStore.pushToast(t('analysis_print.toast.choose_custom_range'), 'error')
    return
  }

  if (mode.value === 'custom' && startDate.value > endDate.value) {
    uiStore.pushToast(t('analysis_print.toast.invalid_custom_range'), 'error')
    return
  }

  exporting.value = true
  try {
    const result = await exportLedgerTransactionsCsv(ledgerId, {
      mode: mode.value,
      yearKey: String(selectedYear.value),
      monthKey: selectedMonth.value,
      dayKey: selectedDay.value,
      startDate: startDate.value,
      endDate: endDate.value,
      scope: exportScope.value,
      txIds: exportTxIds.value,
    })

    exportedFilename.value = result.filename
    const deviceSave = await saveCsvFileToDevice(result.filename, result.csvText)

    if (deviceSave.saved) {
      revokeBlobUrl(exportedUrl.value)
      if (deviceSave.openUrl) {
        exportedUrl.value = deviceSave.openUrl
        exportedIsDeviceLink.value = true
      } else {
        exportedUrl.value = createCsvBlobUrl(result.csvText)
        exportedIsDeviceLink.value = false
      }
      exportedLocation.value = deviceSave.location || t('analysis_print.device_location_default')
      uiStore.pushToast(t('analysis_print.toast.exported_saved', { count: result.rowCount, location: exportedLocation.value }))
      if (exportedIsDeviceLink.value) {
        openExportLink()
      }
      return
    }

    exportedLocation.value = ''
    revokeBlobUrl(exportedUrl.value)
    exportedUrl.value = createCsvBlobUrl(result.csvText)
    exportedIsDeviceLink.value = false
    triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
    uiStore.pushToast(t('analysis_print.toast.exported_downloaded', { count: result.rowCount }))
  } catch (error) {
    uiStore.pushToast(error.message ?? t('analysis_print.toast.export_failed'), 'error')
  } finally {
    exporting.value = false
  }
}

function openExportLink() {
  if (!exportedUrl.value) return
  if (exportedIsDeviceLink.value) {
    // Capacitor file URLs are best handled as downloads instead of route navigation.
    if (isCapacitorFileUrl(exportedUrl.value) && exportedFilename.value) {
      triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
      return
    }
    const opened = window.open(exportedUrl.value, '_blank', 'noopener')
    if (!opened) {
      window.location.href = exportedUrl.value
    }
    return
  }
  if (!exportedFilename.value) return
  triggerDownloadFromUrl(exportedUrl.value, exportedFilename.value)
}

function isCapacitorFileUrl(url) {
  return /\/_capacitor_file_\//i.test(String(url ?? ''))
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

<style scoped>.panel {
  padding: 14px
}
h2, h3 {
  margin: 0
}
.export-page {
  padding-bottom: 120px
}
.mode-tabs {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px
}
.picker-wrap {
  margin-top: 10px
}
.custom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px
}
label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted)
}
.all-hint {
  padding: 8px 0
}
.action-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center
}
.file-note {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  word-break: break-word
}
.fields-list {
  margin: 12px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px
}</style>
