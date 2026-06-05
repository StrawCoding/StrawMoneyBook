<template>
  <div class="step-content stack">

    <!-- Idle / Running: spinner + cancel button -->
    <div v-if="store.scrapeStatus === 'idle' || store.scrapeStatus === 'running'" class="fetch-running">
      <div class="spinner" />
      <p class="fetch-label">{{ t('einvoice.step3.scraping') }}</p>
      <button
        v-if="store.scrapeStatus === 'running'"
        class="btn-secondary btn-wide"
        type="button"
        @click="handleCancel"
      >
        {{ t('einvoice.step3.cancel') }}
      </button>
    </div>

    <!-- Error / timeout / cancelled states -->
    <div v-else-if="isErrorState" class="status-block card panel">
      <font-awesome-icon :icon="errorIcon" class="status-icon" :class="errorIconClass" />
      <p class="status-title">{{ errorTitle }}</p>
      <p v-if="store.scrapeError" class="status-detail">{{ store.scrapeError }}</p>
      <div class="status-actions row">
        <button class="btn-secondary" type="button" @click="handleBackToQuery">
          {{ t('einvoice.step3.back_to_query') }}
        </button>
        <button class="btn-primary" type="button" @click="handleRetry">
          {{ t('einvoice.step3.retry') }}
        </button>
      </div>
    </div>

    <!-- Done: invoice list -->
    <template v-else>
      <div class="list-header card panel">
        <label class="select-all-row">
          <input type="checkbox" :checked="store.allSelected" @change="store.toggleSelectAll()" />
          <span>{{ t('einvoice.step3.select_all') }}</span>
        </label>
        <span class="selected-summary">
          {{ t('einvoice.step3.selected_count', { count: store.selectedInvoiceNumbers.size, amount: formatAmount(store.totalSelectedAmount) }) }}
        </span>
      </div>

      <div v-if="store.invoiceList.length === 0" class="empty-block card panel">
        <font-awesome-icon icon="fa-solid fa-inbox" class="empty-icon" />
        <p>{{ t('einvoice.step3.empty') }}</p>
      </div>

      <div v-else class="invoice-list">
        <div
          v-for="inv in store.invoiceList"
          :key="inv.invoiceNumber"
          class="invoice-card card"
          :class="{ selected: store.selectedInvoiceNumbers.has(inv.invoiceNumber) }"
          @click="store.toggleSelect(inv.invoiceNumber)"
        >
          <input
            type="checkbox"
            :checked="store.selectedInvoiceNumbers.has(inv.invoiceNumber)"
            @click.stop
            @change="store.toggleSelect(inv.invoiceNumber)"
          />
          <div class="invoice-info">
            <p class="invoice-merchant">{{ inv.merchantName || t('einvoice.step3.unknown_merchant') }}</p>
            <p class="invoice-number">{{ inv.invoiceNumber }}</p>
            <div class="invoice-meta">
              <span class="invoice-date">{{ formatDate(inv.invoiceDate) }}</span>
              <span v-if="inv.carrierName" class="carrier-chip" :title="t('einvoice.step3.carrier_label')">
                <font-awesome-icon icon="fa-solid fa-receipt" class="carrier-icon" />
                {{ inv.carrierName }}
              </span>
            </div>
          </div>
          <div class="invoice-amount">NT${{ formatAmount(inv.amount) }}</div>
        </div>
      </div>

      <div class="step-footer row">
        <button class="btn-secondary" type="button" @click="handleBackToQuery">{{ t('einvoice.back') }}</button>
        <button
          class="btn-primary"
          type="button"
          :disabled="store.selectedInvoiceNumbers.size === 0"
          @click="store.currentStep = 4"
        >
          {{ t('einvoice.next') }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { scrapeEInvoiceList } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const store = useEInvoiceImportStore()

// ── Scrape ────────────────────────────────────────────────────────────────────

function classifyScrapeError(err) {
  const code = err?.code ?? ''
  if (code === 'einvoice_automation_canceled') return 'cancelled'
  if (code.includes('timeout')) return 'timeout'
  return 'failed'
}

async function runScrape() {
  const token = store.startScrape()
  console.log('[EInvoice] Step3: 開始查詢 (token:', token, ')，日期:', store.dateFrom, '~', store.dateTo)
  try {
    const list = await scrapeEInvoiceList({
      carrierBarcode: store.carrierBarcode,
      verificationCode: store.verificationCode,
      dateFrom: store.dateFrom,
      dateTo: store.dateTo,
    })
    const committed = store.commitScrapeResult(token, list ?? [])
    if (committed) {
      console.log('[EInvoice] Step3: 查詢完成，共', list?.length ?? 0, '筆發票')
    } else {
      console.log('[EInvoice] Step3: 查詢結果已過期，丟棄 (token:', token, ')')
    }
  } catch (err) {
    const status = classifyScrapeError(err)
    const committed = store.failScrape(token, err?.message || t('einvoice.error.scrape_failed'), status)
    if (committed) {
      console.error('[EInvoice] Step3: 查詢失敗 (', status, ')', err)
    }
  }
}

onMounted(async () => {
  if (store.scrapeStatus === 'running') {
    console.log('[EInvoice] Step3: 已有查詢進行中，略過重複觸發')
    return
  }
  if (store.scrapeStatus === 'done') {
    console.log('[EInvoice] Step3: 已有查詢結果 (', store.invoiceList.length, '筆)，略過重新查詢')
    return
  }
  await runScrape()
})

// ── Actions ───────────────────────────────────────────────────────────────────

function handleCancel() {
  store.cancelScrape()
  console.log('[EInvoice] Step3: 使用者取消查詢')
}

async function handleRetry() {
  console.log('[EInvoice] Step3: 使用者重試查詢')
  await runScrape()
}

function handleBackToQuery() {
  store.clearScrapeResults()
  store.currentStep = 2
}

// ── Error state UI ─────────────────────────────────────────────────────────────

const isErrorState = computed(() =>
  ['failed', 'cancelled', 'timeout'].includes(store.scrapeStatus),
)

const errorTitle = computed(() => {
  switch (store.scrapeStatus) {
    case 'cancelled': return t('einvoice.step3.status_cancelled')
    case 'timeout':   return t('einvoice.step3.status_timeout')
    default:          return t('einvoice.step3.status_failed')
  }
})

const errorIcon = computed(() => {
  if (store.scrapeStatus === 'cancelled') return 'fa-solid fa-circle-xmark'
  if (store.scrapeStatus === 'timeout')   return 'fa-solid fa-clock'
  return 'fa-solid fa-triangle-exclamation'
})

const errorIconClass = computed(() =>
  store.scrapeStatus === 'cancelled' ? 'icon--muted' : 'icon--warning',
)

// ── Formatters ────────────────────────────────────────────────────────────────

function formatAmount(amount) {
  return Number(amount).toLocaleString('zh-TW')
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString('zh-TW')
}
</script>

<style scoped>
.step-content { flex: 1; padding: 16px; gap: 12px; }
.panel { padding: 14px; }

/* Fetch running */
.fetch-running {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
  color: var(--text-secondary);
  padding: 40px 24px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.fetch-label { font-size: 14px; margin: 0; }
.btn-wide {
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface-soft-accent);
  color: var(--text);
}

/* Error / status block */
.status-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 28px 20px;
}
.status-icon { font-size: 32px; }
.icon--warning { color: var(--warning, #f59e0b); }
.icon--muted   { color: var(--text-secondary); }
.status-title  { font-size: 15px; font-weight: 700; margin: 0; }
.status-detail { font-size: 12px; color: var(--text-secondary); margin: 0; }
.status-actions { gap: 10px; width: 100%; margin-top: 6px; }

/* Invoice list */
.list-header { display: flex; justify-content: space-between; align-items: center; }
.select-all-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; }
.selected-summary { font-size: 12px; color: var(--primary); font-weight: 600; }
.empty-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
}
.empty-icon { font-size: 32px; }
.invoice-list { display: flex; flex-direction: column; gap: 8px; }
.invoice-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  cursor: pointer;
  transition: border-color 0.15s;
}
.invoice-card.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 6%, var(--card) 94%); }
.invoice-info { flex: 1; min-width: 0; }
.invoice-merchant { font-weight: 700; font-size: 14px; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.invoice-number { font-size: 11px; color: var(--text-secondary); margin: 2px 0 0; }
.invoice-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 2px 0 0; }
.invoice-date { font-size: 11px; color: var(--text-secondary); }
.carrier-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  border-radius: 999px;
  padding: 2px 8px;
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.carrier-icon { font-size: 9px; }
.invoice-amount { font-weight: 700; font-size: 15px; color: var(--primary); flex-shrink: 0; }

/* Footer */
.step-footer { padding: 0; gap: 12px; }
.btn-primary, .btn-secondary {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  border: none;
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-secondary { background: var(--surface-soft-accent); color: var(--text); border: 1px solid var(--border); }
</style>
