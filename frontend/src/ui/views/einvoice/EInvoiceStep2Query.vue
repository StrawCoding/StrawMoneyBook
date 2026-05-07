<template>
  <div class="step-content stack">
    <div class="card panel">
      <h2 class="step-heading">{{ t('einvoice.step2.title') }}</h2>

      <label class="field-label">{{ t('einvoice.step2.date_range') }}</label>
      <div class="date-row">
        <input v-model="store.dateFrom" class="field-input" type="date" :max="store.dateTo || today" />
        <span class="date-sep">–</span>
        <input v-model="store.dateTo" class="field-input" type="date" :min="store.dateFrom" :max="today" />
      </div>

      <label class="field-label mt">{{ t('einvoice.step2.invoice_status') }}</label>
      <select v-model="store.invoiceStatus" class="field-input">
        <option value="all">{{ t('einvoice.step2.status_all') }}</option>
        <option value="not_donated">{{ t('einvoice.step2.status_not_donated') }}</option>
        <option value="donated">{{ t('einvoice.step2.status_donated') }}</option>
        <option value="voided">{{ t('einvoice.step2.status_voided') }}</option>
      </select>

      <label class="field-label mt">{{ t('einvoice.step2.buyer_tax_id') }}</label>
      <input
        v-model="store.buyerTaxId"
        class="field-input"
        type="text"
        inputmode="numeric"
        :placeholder="t('einvoice.step2.buyer_tax_id_placeholder')"
      />

      <label class="field-label mt">{{ t('einvoice.step2.keyword') }}</label>
      <input
        v-model="store.keyword"
        class="field-input"
        type="text"
        :placeholder="t('einvoice.step2.keyword_placeholder')"
      />
    </div>

    <div class="platform-notice card panel">
      <font-awesome-icon icon="fa-solid fa-circle-info" class="notice-icon" />
      <p>{{ t('einvoice.not_supported_notice') }}</p>
    </div>

    <div class="step-footer row">
      <button class="btn-secondary" @click="store.currentStep = 1">{{ t('einvoice.back') }}</button>
      <button class="btn-primary" :disabled="!canProceed" @click="handleNext">
        {{ t('einvoice.next') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const store = useEInvoiceImportStore()

const today = new Date().toISOString().slice(0, 10)

const canProceed = computed(() => Boolean(store.dateFrom && store.dateTo))

onMounted(() => {
  if (!store.dateFrom || !store.dateTo) {
    const to = new Date()
    const from = new Date()
    from.setMonth(from.getMonth() - 3)
    store.dateTo = to.toISOString().slice(0, 10)
    store.dateFrom = from.toISOString().slice(0, 10)
  }
})

function handleNext() {
  store.currentStep = 3
}
</script>

<style scoped>
.step-content { flex: 1; padding: 16px; gap: 12px; }
.panel { padding: 16px; }
.step-heading { font-size: 17px; margin: 0 0 16px; }
.field-label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
.field-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 15px;
  background: var(--surface);
  color: var(--text);
  box-sizing: border-box;
}
.date-row { display: flex; align-items: center; gap: 8px; }
.date-row .field-input { flex: 1; }
.date-sep { color: var(--text-secondary); flex-shrink: 0; }
.mt { margin-top: 14px; }
.platform-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 12px;
}
.notice-icon { color: var(--primary); flex-shrink: 0; margin-top: 2px; }
.platform-notice p { margin: 0; }
.step-footer { padding: 16px; gap: 12px; }
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
