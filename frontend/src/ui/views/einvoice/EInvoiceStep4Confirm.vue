<template>
  <div class="step-content stack">
    <template v-if="!store.importResult">
      <div class="card panel">
        <h2 class="step-heading">{{ t('einvoice.step4.title') }}</h2>
        <p class="step-desc">{{ t('einvoice.step4.desc', { count: store.selectedInvoices.length, amount: formatAmount(store.totalSelectedAmount) }) }}</p>

        <div class="invoice-preview-list">
          <div v-for="inv in store.selectedInvoices" :key="inv.invoiceNumber" class="preview-row">
            <span class="preview-merchant">
              {{ inv.merchantName || t('einvoice.step3.unknown_merchant') }}
              <span v-if="inv.carrierName" class="preview-carrier" :title="t('einvoice.step3.carrier_label')">{{ inv.carrierName }}</span>
            </span>
            <span class="preview-amount">NT${{ formatAmount(inv.amount) }}</span>
          </div>
        </div>
      </div>

      <div class="card panel">
        <p class="tx-section-label">{{ t('einvoice.step4.create_tx_label') }}</p>

        <label class="field-label">{{ t('einvoice.step4.account_label') }}</label>
        <CustomSelect
          v-model="defaultAccountId"
          class="field-input-select"
          :groups="accountSelectGroups"
          :placeholder="t('einvoice.step4.no_account')"
          data-testid="einvoice-default-account"
        />

        <label class="field-label mt">{{ t('einvoice.step4.category_label') }}</label>
        <CustomSelect
          v-model="defaultCategoryId"
          class="field-input-select"
          :groups="categorySelectGroups"
          :placeholder="t('einvoice.step4.no_category')"
          :disabled="!hasAccount"
          data-testid="einvoice-default-category"
        />

        <p v-if="hasAccount && hasCategory" class="tx-hint">
          {{ t('einvoice.step4.tx_hint') }}
        </p>
      </div>

      <p v-if="importError" class="error-text">{{ importError }}</p>

      <div class="step-footer row">
        <button class="btn-secondary" :disabled="store.isImporting" @click="goBack">{{ t('einvoice.back') }}</button>
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
        <p v-if="store.importResult.failed.length > 0" class="failed-text">
          {{ t('einvoice.step4.result_failed', { count: store.importResult.failed.length }) }}
        </p>
      </div>
      <div class="step-footer">
        <button class="btn-primary" @click="handleFinish">{{ t('einvoice.step4.finish') }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { useAccountStore } from '@/ui/stores/account.store.js'
import { useCategoryStore } from '@/ui/stores/category.store.js'
import { useLedgerStore } from '@/ui/stores/ledger.store.js'
import { importSelectedInvoices } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'
import CustomSelect from '@/ui/components/common/CustomSelect.vue'
import { withLeadingAccountOption } from '@/ui/utils/account-option-groups'
import { buildCategorySelectGroups } from '@/ui/utils/category-options'

const NONE_OPTION = '__none__'

const { t } = useI18n()
const router = useRouter()
const store = useEInvoiceImportStore()
const accountStore = useAccountStore()
const categoryStore = useCategoryStore()
const ledgerStore = useLedgerStore()

const importError = ref('')

const defaultAccountId = computed({
  get: () => store.defaultAccountId || NONE_OPTION,
  set: (value) => {
    store.defaultAccountId = value === NONE_OPTION ? '' : value
    if (!store.defaultAccountId) store.defaultCategoryId = ''
  },
})

const defaultCategoryId = computed({
  get: () => store.defaultCategoryId || NONE_OPTION,
  set: (value) => {
    store.defaultCategoryId = value === NONE_OPTION ? '' : value
  },
})

const hasAccount = computed(() => Boolean(store.defaultAccountId))
const hasCategory = computed(() => Boolean(store.defaultCategoryId))

const accountSelectGroups = computed(() => withLeadingAccountOption(
  accountStore.groupedRegularAccounts,
  { value: NONE_OPTION, label: t('einvoice.step4.no_account') },
))
const categorySelectGroups = computed(() => withLeadingAccountOption(
  buildCategorySelectGroups(categoryStore, 'expense'),
  { value: NONE_OPTION, label: t('einvoice.step4.no_category') },
))

function formatAmount(amount) {
  return Number(amount).toLocaleString('zh-TW')
}

async function handleImport() {
  if (store.isImporting) return
  importError.value = ''
  store.isImporting = true
  console.log('[EInvoice] Step4: 開始匯入，筆數:', store.selectedInvoices.length)
  try {
    const result = await importSelectedInvoices(store.selectedInvoices, {
      ledgerId: ledgerStore.activeLedgerId || undefined,
      accountId: store.defaultAccountId || undefined,
      categoryId: store.defaultCategoryId || undefined,
    })
    console.log('[EInvoice] Step4: 匯入完成 — 成功:', result.imported.length, '略過:', result.skipped.length, '失敗:', result.failed.length)
    store.importResult = result
  } catch (err) {
    console.error('[EInvoice] Step4: 匯入失敗', err)
    importError.value = err?.message || t('einvoice.error.import_failed', {}, '匯入失敗，請重試')
  } finally {
    store.isImporting = false
  }
}

function goBack() {
  store.importResult = null
  store.currentStep = 3
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
.preview-merchant { color: var(--text); display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.preview-carrier {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, var(--card) 88%);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-amount { font-weight: 700; color: var(--primary); }
.tx-section-label { font-size: 13px; color: var(--text-secondary); margin: 0 0 14px; }
.field-label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
.field-input-select { width: 100%; }
.field-input-select :deep(.select.trigger) {
  background: var(--input-bg);
}
.mt { margin-top: 14px; }
.tx-hint { font-size: 12px; color: var(--primary); margin: 10px 0 0; }
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
.failed-text { font-size: 12px; color: var(--warning, #f59e0b); }
.error-text { font-size: 13px; color: var(--danger); margin: 0; text-align: center; }
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
