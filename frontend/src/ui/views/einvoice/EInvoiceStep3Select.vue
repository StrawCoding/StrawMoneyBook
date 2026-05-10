<template>
  <div class="step-content stack">
    <div v-if="store.isScraping" class="loading-block">
      <div class="spinner" />
      <p>{{ t('einvoice.step3.scraping') }}</p>
    </div>

    <div v-else-if="store.errorMessage" class="error-block card panel">
      <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="error-icon" />
      <p>{{ store.errorMessage }}</p>
      <button class="btn-secondary" @click="store.currentStep = 2">{{ t('einvoice.back') }}</button>
    </div>

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
            <p class="invoice-date">{{ formatDate(inv.invoiceDate) }}</p>
          </div>
          <div class="invoice-amount">NT${{ formatAmount(inv.amount) }}</div>
        </div>
      </div>

      <div class="step-footer row">
        <button class="btn-secondary" @click="goBack">{{ t('einvoice.back') }}</button>
        <button
          class="btn-primary"
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
import { onMounted } from 'vue'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { scrapeEInvoiceList, isEInvoiceAutomationSupported } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const store = useEInvoiceImportStore()

function formatAmount(amount) {
  return Number(amount).toLocaleString('zh-TW')
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString('zh-TW')
}

function goBack() {
  store.setInvoiceList([])
  store.currentStep = 2
}

onMounted(async () => {
  store.errorMessage = ''
  if (store.isScraping) {
    console.log('[EInvoice] Step3: 已有抓取進行中，略過重複觸發')
    return
  }
  if (store.invoiceList.length > 0) {
    console.log('[EInvoice] Step3: 已有發票清單（', store.invoiceList.length, '筆），略過重新抓取')
    return
  }
  store.isScraping = true
  console.log('[EInvoice] Step3: 開始抓取發票 — 日期:', store.dateFrom, '~', store.dateTo)
  try {
    if (!isEInvoiceAutomationSupported()) {
      throw new Error(t('einvoice.error.not_supported', {}, '目前平台尚不支援電子發票自動抓取，敬請期待後續版本。'))
    }
    const list = await scrapeEInvoiceList({
      phone: store.phone,
      password: store.password,
      dateFrom: store.dateFrom,
      dateTo: store.dateTo,
      invoiceStatus: store.invoiceStatus,
      buyerTaxId: store.buyerTaxId,
      keyword: store.keyword,
    })
    console.log('[EInvoice] Step3: 抓取完成，共', list?.length ?? 0, '筆發票')
    store.setInvoiceList(list ?? [])
  } catch (err) {
    console.error('[EInvoice] Step3: 抓取失敗', err)
    store.errorMessage = err?.message || t('einvoice.error.scrape_failed', {}, '抓取發票失敗，請重試')
  } finally {
    store.isScraping = false
  }
})
</script>

<style scoped>
.step-content { flex: 1; padding: 16px; gap: 12px; }
.panel { padding: 14px; }
.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
  color: var(--text-secondary);
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
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  color: var(--text-secondary);
}
.error-icon { font-size: 28px; color: var(--warning); }
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
.invoice-date { font-size: 11px; color: var(--text-secondary); margin: 0; }
.invoice-amount { font-weight: 700; font-size: 15px; color: var(--primary); flex-shrink: 0; }
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
