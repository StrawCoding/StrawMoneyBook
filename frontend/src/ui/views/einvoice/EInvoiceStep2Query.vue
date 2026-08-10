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
      <p class="field-hint">{{ t('einvoice.step2.range_hint') }}</p>
    </div>

    <div class="step-footer row">
      <button class="btn-secondary" type="button" @click="store.currentStep = 1">{{ t('einvoice.back') }}</button>
      <button class="btn-primary" type="button" :disabled="!canProceed" @click="handleNext">
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
const MAX_QUERY_DAYS = 62

const canProceed = computed(() => Boolean(store.dateFrom && store.dateTo))

onMounted(() => {
  if (!store.dateFrom || !store.dateTo) {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - (MAX_QUERY_DAYS - 1))
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
.field-hint { margin: 8px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.field-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 15px;
  background: var(--input-bg);
  color: var(--text);
  box-sizing: border-box;
}
.date-row { display: flex; align-items: center; gap: 8px; }
.date-row .field-input { flex: 1; }
.date-sep { color: var(--text-secondary); flex-shrink: 0; }
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
