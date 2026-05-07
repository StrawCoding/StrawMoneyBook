<template>
  <div class="step-content stack">
    <template v-if="!store.importResult">
      <div class="card panel">
        <h2 class="step-heading">{{ t('einvoice.step4.title') }}</h2>
        <p class="step-desc">{{ t('einvoice.step4.desc', { count: store.selectedInvoices.length, amount: formatAmount(store.totalSelectedAmount) }) }}</p>

        <div class="invoice-preview-list">
          <div v-for="inv in store.selectedInvoices" :key="inv.invoiceNumber" class="preview-row">
            <span class="preview-merchant">{{ inv.merchantName || t('einvoice.step3.unknown_merchant') }}</span>
            <span class="preview-amount">NT${{ formatAmount(inv.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="step-footer row">
        <button class="btn-secondary" @click="store.currentStep = 3">{{ t('einvoice.back') }}</button>
        <button class="btn-primary" :disabled="store.isImporting" @click="handleImport">
          <span v-if="store.isImporting">{{ t('einvoice.step4.importing') }}</span>
          <span v-else>{{ t('einvoice.step4.confirm') }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="result-block card panel">
        <font-awesome-icon icon="fa-solid fa-circle-check" class="result-icon" />
        <h2>{{ t('einvoice.step4.done') }}</h2>
        <p>{{ t('einvoice.step4.result_imported', { count: store.importResult.imported.length }) }}</p>
        <p v-if="store.importResult.skipped.length > 0" class="skipped-text">
          {{ t('einvoice.step4.result_skipped', { count: store.importResult.skipped.length }) }}
        </p>
      </div>
      <div class="step-footer">
        <button class="btn-primary" @click="handleFinish">{{ t('einvoice.step4.finish') }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { importSelectedInvoices } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const router = useRouter()
const store = useEInvoiceImportStore()

function formatAmount(amount) {
  return Number(amount).toLocaleString('zh-TW')
}

async function handleImport() {
  store.isImporting = true
  try {
    const result = await importSelectedInvoices(store.selectedInvoices)
    store.importResult = result
  } catch (err) {
    store.errorMessage = err?.message || t('einvoice.error.import_failed', {}, '匯入失敗，請重試')
    store.currentStep = 3
  } finally {
    store.isImporting = false
  }
}

function handleFinish() {
  store.reset()
  router.push('/')
}
</script>

<style scoped>
.step-content { flex: 1; padding: 16px; gap: 12px; }
.panel { padding: 16px; }
.step-heading { font-size: 17px; margin: 0 0 6px; }
.step-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; }
.invoice-preview-list { display: flex; flex-direction: column; gap: 8px; }
.preview-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.preview-row:last-child { border-bottom: none; }
.preview-merchant { color: var(--text); }
.preview-amount { font-weight: 700; color: var(--primary); }
.result-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 32px 16px;
}
.result-icon { font-size: 48px; color: var(--success, #22c55e); }
.result-block h2 { font-size: 20px; margin: 0; }
.result-block p { margin: 0; font-size: 14px; color: var(--text-secondary); }
.skipped-text { font-size: 12px; }
.step-footer { padding: 0; gap: 12px; }
.step-footer.row { display: flex; }
.btn-primary, .btn-secondary {
  flex: 1;
  width: 100%;
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
