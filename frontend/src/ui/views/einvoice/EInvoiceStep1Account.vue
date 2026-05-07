<template>
  <div class="step-content stack">
    <div class="card panel">
      <h2 class="step-heading">{{ t('einvoice.step1.title') }}</h2>
      <p class="step-desc">{{ t('einvoice.step1.desc') }}</p>

      <label class="field-label">{{ t('einvoice.step1.phone') }}</label>
      <input
        v-model="store.phone"
        class="field-input"
        type="tel"
        inputmode="tel"
        :placeholder="t('einvoice.step1.phone_placeholder')"
        autocomplete="tel"
      />

      <label class="field-label mt">{{ t('einvoice.step1.password') }}</label>
      <div class="password-wrap">
        <input
          v-model="store.password"
          class="field-input"
          :type="showPassword ? 'text' : 'password'"
          :placeholder="t('einvoice.step1.password_placeholder')"
          autocomplete="current-password"
        />
        <button class="eye-btn" @click="showPassword = !showPassword">
          <font-awesome-icon :icon="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'" />
        </button>
      </div>

      <label class="remember-row mt">
        <input v-model="store.rememberCredentials" type="checkbox" />
        <span>{{ t('einvoice.step1.remember') }}</span>
      </label>

      <p v-if="savedHint" class="saved-hint">{{ t('einvoice.step1.credential_loaded') }}</p>

      <p v-if="error" class="error-text">{{ error }}</p>
    </div>

    <div class="step-footer">
      <button class="btn-primary" :disabled="!canProceed" @click="handleNext">
        {{ t('einvoice.next') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useEInvoiceImportStore } from '@/ui/stores/einvoice-import.store.js'
import { loadEInvoiceCredential, saveEInvoiceCredential } from '@/services/einvoice/backend.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const store = useEInvoiceImportStore()

const showPassword = ref(false)
const savedHint = ref(false)
const error = ref('')

const canProceed = computed(() => store.phone.trim().length > 0 && store.password.trim().length > 0)

onMounted(async () => {
  const cred = await loadEInvoiceCredential()
  if (cred) {
    store.phone = cred.phone
    store.password = cred.password
    savedHint.value = true
  }
})

async function handleNext() {
  error.value = ''
  if (!canProceed.value) return
  if (store.rememberCredentials) {
    try {
      await saveEInvoiceCredential(store.phone.trim(), store.password)
    } catch {
      error.value = t('einvoice.step1.save_error', {}, '儲存帳號失敗')
      return
    }
  }
  store.currentStep = 2
}
</script>

<style scoped>
.step-content { flex: 1; padding: 16px; }
.panel { padding: 16px; }
.step-heading { font-size: 17px; margin: 0 0 6px; }
.step-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; }
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
.mt { margin-top: 14px; }
.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 14px;
  cursor: pointer;
}
.saved-hint { font-size: 12px; color: var(--primary); margin-top: 8px; }
.error-text { font-size: 12px; color: var(--danger); margin-top: 8px; }
.step-footer { padding: 16px; }
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--primary);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
