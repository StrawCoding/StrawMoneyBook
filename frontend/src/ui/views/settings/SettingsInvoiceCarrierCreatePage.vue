<template>
  <section class="stack">
    <header class="row page-head">
      <h2>{{ t('settings_invoice_carrier.create_title', '新增電子發票載具') }}</h2>
      <RouterLink class="btn back-btn" to="/settings/invoice-carrier">{{ t('common.back') }}</RouterLink>
    </header>

    <article class="card panel">
      <h3>第 {{ currentStep }} 步</h3>

      <!-- 步驟 1: 取得驗證碼 -->
      <div v-if="currentStep === 1">
        <p class="muted">{{ t('settings_invoice_carrier.step1_desc', '取得電子發票平台驗證碼') }}</p>
        <button class="btn primary" :disabled="loading" @click="createLinkSession">
          {{ loading ? '取得驗證碼中...' : '開始取得驗證碼' }}
        </button>
        <p v-if="error" class="error-msg">{{ error }}</p>

        <!-- 驗證碼顯示 -->
        <div v-if="captchaImageUrl" class="captcha-box">
          <p class="label">圖形驗證碼</p>
          <img :src="captchaImageUrl" :alt="t('settings_invoice_carrier.captcha')" />
          <input
            v-model="manualCaptchaCode"
            type="text"
            placeholder="若無法自動辨識，請手動輸入驗證碼"
            maxlength="10"
            inputmode="numeric"
          />
          <button class="btn primary" @click="proceedToStep2" :disabled="!manualCaptchaCode">
            下一步
          </button>
        </div>
      </div>

      <!-- 步驟 2: 填入帳號密碼 -->
      <div v-if="currentStep === 2">
        <p class="muted">{{ t('settings_invoice_carrier.step2_desc', '填入手機號碼、密碼與驗證碼') }}</p>
        <label>
          <span>手機號碼</span>
          <input v-model="mobilePhone" type="tel" placeholder="09xxxxxxxx" />
        </label>
        <label>
          <span>密碼（驗證碼）</span>
          <input v-model="password" type="password" placeholder="登入密碼" />
        </label>
        <label>
          <span>圖形驗證碼</span>
          <input v-model="inputCaptchaCode" type="text" placeholder="驗證碼" maxlength="10" inputmode="numeric" />
        </label>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button class="btn primary" :disabled="loading" @click="exchangeAuth">
          {{ loading ? '登入中...' : '完成登入' }}
        </button>
      </div>

      <!-- 步驟 3: 完成 -->
      <div v-if="currentStep === 3">
        <p class="success-msg">✓ 載具新增成功！</p>
        <p class="muted">您可以回到載具列表管理此載具。</p>
        <RouterLink class="btn primary" to="/settings/invoice-carrier">
          返回列表
        </RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { useInvoiceCarrierStore } from '@/ui/stores/invoice-carrier.store'
import { useI18n } from '@/ui/services/i18n.service'
import * as uiService from '@/ui/services/invoice-carrier.service'
import { ref } from 'vue'

const { t } = useI18n()
const store = useInvoiceCarrierStore()

const currentStep = ref(1)
const loading = ref(false)
const error = ref(null)
const sessionId = ref(null)
const captchaImageUrl = ref(null)
const autofillCaptchaCode = ref(null)
const manualCaptchaCode = ref('')
const mobilePhone = ref('')
const password = ref('')
const inputCaptchaCode = ref('')

async function createLinkSession() {
  try {
    loading.value = true
    error.value = null
    const result = await uiService.createLinkSession()
    sessionId.value = result.session_id
    captchaImageUrl.value = result.captcha_image
    autofillCaptchaCode.value = result.captcha_auto_filled
    if (autofillCaptchaCode.value) {
      inputCaptchaCode.value = autofillCaptchaCode.value
    }
  } catch (e) {
    error.value = String(e?.message ?? e ?? '取得驗證碼失敗')
  } finally {
    loading.value = false
  }
}

function proceedToStep2() {
  inputCaptchaCode.value = manualCaptchaCode.value
  currentStep.value = 2
}

async function exchangeAuth() {
  try {
    loading.value = true
    error.value = null
    const result = await uiService.exchangeAuth(
      sessionId.value,
      mobilePhone.value,
      password.value,
      inputCaptchaCode.value,
    )
    // 建立連線
    const connection = await store.createConnection({
      mobile_phone: mobilePhone.value,
      user_label: `電子發票 ${mobilePhone.value}`,
    })
    // 存入 session ID 供後續同步使用
    store.setSessionId(connection.id, sessionId.value)
    currentStep.value = 3
  } catch (e) {
    error.value = String(e?.message ?? e ?? '登入失敗')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2, h3 {
  margin: 0;
}

h2 {
  font-size: 18px;
}

h3 {
  font-size: 14px;
  margin-bottom: 8px;
}

.muted {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 12px;
}

label {
  display: block;
  margin-bottom: 12px;
}

label span {
  display: block;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}

label input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
}

.captcha-box {
  margin: 12px 0;
  padding: 12px;
  background: var(--surface-soft-accent);
  border-radius: 6px;
}

.captcha-box .label {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}

.captcha-box img {
  max-width: 200px;
  border: 1px solid var(--border);
  margin-bottom: 8px;
  border-radius: 4px;
}

.btn {
  padding: 10px 16px;
  margin-top: 12px;
  font-size: 13px;
}

.error-msg {
  color: var(--error);
  font-size: 12px;
  margin-top: 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--error) 12%, var(--card) 88%);
  border-radius: 4px;
}

.success-msg {
  color: var(--success);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}
</style>
