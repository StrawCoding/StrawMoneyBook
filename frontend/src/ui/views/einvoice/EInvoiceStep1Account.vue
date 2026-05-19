<template>
  <div class="step-content stack">
    <div class="card panel">
      <h2 class="step-heading">{{ t('einvoice.step1.title') }}</h2>
      <p class="step-desc">{{ t('einvoice.step1.desc') }}</p>

      <label class="field-label">{{ t('einvoice.step1.carrier_barcode') }}</label>
      <input
        v-model="store.carrierBarcode"
        class="field-input"
        type="text"
        inputmode="text"
        autocomplete="username"
        :placeholder="t('einvoice.step1.carrier_barcode_placeholder')"
        @input="normalizeBarcode"
      />
      <p class="field-hint">{{ t('einvoice.step1.carrier_barcode_hint') }}</p>

      <label class="field-label mt">{{ t('einvoice.step1.verification_code') }}</label>
      <div class="password-wrap">
        <input
          v-model="store.verificationCode"
          class="field-input"
          :type="showCode ? 'text' : 'password'"
          autocomplete="current-password"
          :placeholder="t('einvoice.step1.verification_code_placeholder')"
        />
        <button type="button" class="eye-btn" @click="showCode = !showCode">
          <font-awesome-icon :icon="showCode ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'" />
        </button>
      </div>
      <p class="field-hint">{{ t('einvoice.step1.verification_code_hint') }}</p>

      <label class="remember-row mt">
        <input v-model="store.rememberCredentials" type="checkbox" />
        <span>{{ t('einvoice.step1.remember') }}</span>
      </label>

      <p v-if="savedHint" class="saved-hint">{{ t('einvoice.step1.credential_loaded') }}</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>

    <div class="step-footer row">
      <button class="btn-secondary" type="button" @click="handleCancel">{{ t('einvoice.back') }}</button>
      <button class="btn-primary" type="button" :disabled="!canProceed" @click="handleNext">
        {{ t('einvoice.next') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { loadEInvoiceCredential, saveEInvoiceCredential } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const router = useRouter()
const store = useEInvoiceImportStore()

const showCode = ref(false)
const savedHint = ref(false)
const error = ref('')

const BARCODE_RE = /^\/[A-Za-z0-9]{7}$/
const canProceed = computed(
  () => BARCODE_RE.test(store.carrierBarcode.trim()) && store.verificationCode.trim().length >= 4,
)

function normalizeBarcode() {
  // Auto-prepend '/' if user omits it
  const raw = store.carrierBarcode.replace(/\s/g, '')
  if (raw && !raw.startsWith('/')) {
    store.carrierBarcode = `/${raw}`
  }
}

onMounted(async () => {
  const cred = await loadEInvoiceCredential()
  if (cred) {
    store.carrierBarcode = cred.carrierBarcode ?? ''
    store.verificationCode = cred.verificationCode ?? ''
    savedHint.value = true
  }
})

function handleCancel() {
  store.reset()
  router.back()
}

async function handleNext() {
  error.value = ''
  if (!canProceed.value) return
  if (store.rememberCredentials) {
    try {
      await saveEInvoiceCredential(store.carrierBarcode.trim(), store.verificationCode)
    } catch {
      error.value = t('einvoice.step1.save_error', {}, '儲存帳號失敗')
      return
    }
  }
  store.currentStep = 2
}
</script>

<style scoped>
.step-content {
  align-content: start;
  flex: 0 0 auto;
  gap: 10px;
  padding: 12px 16px 16px;
}
.panel { padding: 14px; }
.step-heading { font-size: 17px; margin: 0 0 6px; }
.step-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; }
.field-label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
.field-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 15px;
  background: var(--surface);
  color: var(--text);
  box-sizing: border-box;
}
.field-hint { font-size: 11px; color: var(--text-secondary); margin: 5px 0 0; }
.password-wrap { position: relative; }
.password-wrap .field-input { padding-right: 44px; }
.eye-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
}
.mt { margin-top: 10px; }
.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 14px;
  cursor: pointer;
}
.saved-hint { font-size: 12px; color: var(--primary); margin-top: 8px; }
.error-text { font-size: 12px; color: var(--danger); margin-top: 8px; }
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
