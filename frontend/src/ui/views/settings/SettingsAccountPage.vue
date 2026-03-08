<template>
  <div class="view-root">
    <section class="stack">
      <article class="card panel">
        <header class="row">
          <h2>{{ t('settings_account.title', '帳號') }}</h2>
          <RouterLink class="btn back-btn" to="/settings">{{ t('common.back') }}</RouterLink>
        </header>
        <p class="muted intro">
          {{ t('settings_account.desc', '使用 Email 註冊與登入，之後可管理個人資料、推薦碼與登出。') }}
        </p>
        <p v-if="apiUnavailable" class="notice">
          {{ apiUnavailableMessage }}
        </p>
      </article>

      <article v-if="isResetPasswordMode" class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_account.reset_password', '設定新密碼') }}</h3>
          <button type="button" class="btn" :disabled="resetSubmitting" @click="clearResetPasswordMode">
            {{ t('common.back') }}
          </button>
        </header>

        <div class="form-grid">
          <label class="field">
            {{ t('settings_account.password', '密碼') }}
            <input
              v-model="resetForm.password"
              class="input"
              type="password"
              maxlength="64"
              autocomplete="new-password"
              :placeholder="t('settings_account.password_placeholder', '至少 8 碼')"
              :disabled="resetSubmitting || apiUnavailable"
            />
          </label>

          <label class="field">
            {{ t('settings_account.password_confirm', '確認密碼') }}
            <input
              v-model="resetForm.confirmPassword"
              class="input"
              type="password"
              maxlength="64"
              autocomplete="new-password"
              :placeholder="t('settings_account.password_confirm_placeholder', '再輸入一次新密碼')"
              :disabled="resetSubmitting || apiUnavailable"
              @keyup.enter="submitPasswordResetConfirm"
            />
          </label>
        </div>

        <p class="muted compact">
          {{ t('settings_account.reset_password_hint', '重設成功後會直接登入此帳號。') }}
        </p>

        <button class="btn primary wide-btn" :disabled="resetSubmitting || apiUnavailable || !canSubmitPasswordReset" @click="submitPasswordResetConfirm">
          {{ resetSubmitting ? t('settings_account.resetting', '重設中...') : t('settings_account.reset_password_submit', '更新密碼') }}
        </button>
      </article>

      <article v-else-if="!sessionUser && forgotPasswordMode" class="card panel">
        <header class="section-head">
          <h3>{{ t('settings_account.forgot_password', '忘記密碼') }}</h3>
          <button type="button" class="btn" :disabled="resetRequestSubmitting" @click="closeForgotPasswordMode">
            {{ t('common.back') }}
          </button>
        </header>

        <div class="form-grid">
          <label class="field">
            {{ t('settings_account.email', 'Email') }}
            <input
              v-model.trim="resetRequestForm.email"
              class="input"
              type="email"
              autocomplete="email"
              :placeholder="t('settings_account.email_placeholder', 'name@example.com')"
              :disabled="resetRequestSubmitting || apiUnavailable"
              @keyup.enter="submitPasswordResetRequest"
            />
          </label>
        </div>

        <p class="muted compact">
          {{ t('settings_account.forgot_password_hint', '系統會寄送臨時密碼到你的 Email。若密碼錯誤已達 10 次，也必須從這裡取得臨時密碼。') }}
        </p>

        <p v-if="resetRequestCooldownSeconds > 0" class="muted compact">
          {{ t('settings_account.temp_password_countdown', { seconds: resetRequestCooldownSeconds }, '{seconds} 秒後可再次寄送') }}
        </p>

        <p v-if="resetRequestMessage" class="success-notice">
          {{ resetRequestMessage }}
        </p>

        <p v-if="debugTemporaryPassword" class="muted compact">
          {{ t('settings_account.debug_temporary_password', '開發模式臨時密碼') }}：
          <strong>{{ debugTemporaryPassword }}</strong>
        </p>

        <button class="btn primary wide-btn" :disabled="resetRequestSubmitting || apiUnavailable || !canRequestPasswordReset || resetRequestCooldownSeconds > 0" @click="submitPasswordResetRequest">
          {{
            resetRequestSubmitting
              ? t('settings_account.sending_reset', '寄送中...')
              : resetRequestCooldownSeconds > 0
                ? t('settings_account.send_temporary_password_countdown', { seconds: resetRequestCooldownSeconds }, '{seconds} 秒後可重寄')
                : t('settings_account.send_temporary_password', '寄送臨時密碼')
          }}
        </button>
      </article>

      <article v-else-if="!sessionUser" class="card panel">
        <header class="section-head">
          <h3>{{ authMode === 'login' ? t('settings_account.login', '登入') : t('settings_account.register', '註冊') }}</h3>
          <div class="tab-row">
            <button type="button" class="tab-btn" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">
              {{ t('settings_account.login', '登入') }}
            </button>
            <button type="button" class="tab-btn" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">
              {{ t('settings_account.register', '註冊') }}
            </button>
          </div>
        </header>

        <div class="form-grid">
          <label class="field">
            {{ t('settings_account.email', 'Email') }}
            <input
              v-model.trim="authForm.email"
              class="input"
              type="email"
              autocomplete="email"
              :placeholder="t('settings_account.email_placeholder', 'name@example.com')"
              :disabled="authSubmitting || apiUnavailable"
            />
          </label>

          <label v-if="authMode === 'register'" class="field">
            {{ t('settings_account.display_name', '名稱') }}
            <input
              v-model.trim="authForm.displayName"
              class="input"
              type="text"
              maxlength="40"
              autocomplete="nickname"
              :placeholder="t('settings_account.display_name_placeholder', '例如：小草')"
              :disabled="authSubmitting || apiUnavailable"
            />
          </label>

          <label class="field">
            {{ t('settings_account.password', '密碼') }}
            <input
              v-model="authForm.password"
              class="input"
              type="password"
              maxlength="64"
              autocomplete="current-password"
              :placeholder="t('settings_account.password_placeholder', '至少 8 碼')"
              :disabled="authSubmitting || apiUnavailable"
              @keyup.enter="submitAuth"
            />
          </label>
        </div>

        <div class="helper-row">
          <button type="button" class="link-btn" :disabled="authSubmitting || apiUnavailable" @click="openForgotPasswordMode">
            {{ t('settings_account.forgot_password', '忘記密碼') }}
          </button>
          <span class="muted compact">
            {{ t('settings_account.login_guard_hint', '密碼錯誤 5 次會暫停 10 分鐘，10 次後需改用臨時密碼登入。') }}
          </span>
        </div>

        <button class="btn primary wide-btn" :disabled="authSubmitting || apiUnavailable || !canSubmitAuth" @click="submitAuth">
          {{
            authSubmitting
              ? t('settings_account.submitting', '處理中...')
              : authMode === 'login'
                ? t('settings_account.login', '登入')
                : t('settings_account.register', '註冊')
          }}
        </button>
      </article>

      <template v-else>
        <article v-if="sessionMustChangePassword" class="card panel warning-panel">
          <header class="section-head">
            <h3>{{ t('settings_account.password_change_required', '請先更改密碼') }}</h3>
          </header>

          <p class="muted compact">
            {{ t('settings_account.password_change_required_hint', '你目前是使用臨時密碼登入，繼續使用 App 前必須先設定新密碼。') }}
          </p>

          <button class="btn" :disabled="loggingOut || apiUnavailable" @click="handleLogout">
            {{ loggingOut ? t('settings_account.logging_out', '登出中...') : t('settings_account.logout', '登出') }}
          </button>
        </article>

        <article v-if="!sessionMustChangePassword" class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_account.profile', '個人資料') }}</h3>
          </header>

          <div class="profile-row">
            <div class="avatar-wrap">
              <img v-if="profileForm.avatarUrl" :src="profileForm.avatarUrl" alt="avatar" class="avatar-img" />
              <div v-else class="avatar-fallback">{{ avatarLabel }}</div>
            </div>
            <div class="profile-meta">
              <strong>{{ sessionUser.display_name || sessionUser.email }}</strong>
              <p class="muted compact">{{ sessionUser.email || sessionUser.account }}</p>
              <p class="muted compact">
                {{ membershipLabel }}
              </p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field">
              {{ t('settings_account.display_name', '名稱') }}
              <input
                v-model.trim="profileForm.displayName"
                class="input"
                type="text"
                maxlength="40"
                :disabled="profileSaving || avatarUploading || apiUnavailable"
              />
            </label>

            <label class="field">
              {{ t('settings_account.avatar_upload', '頭貼圖片') }}
              <input
                ref="avatarInputEl"
                class="input"
                type="file"
                accept="image/*"
                :disabled="profileSaving || avatarUploading || apiUnavailable"
                @change="handleAvatarFileChange"
              />
            </label>
          </div>

          <div class="helper-row">
            <span class="muted compact">
              {{
                avatarUploading
                  ? t('settings_account.avatar_processing', '頭貼處理中...')
                  : t('settings_account.avatar_upload_hint', '請上傳圖片檔，系統會自動縮圖後儲存。')
              }}
            </span>
            <button type="button" class="link-btn" :disabled="profileSaving || avatarUploading || apiUnavailable || !profileForm.avatarUrl" @click="clearAvatar">
              {{ t('settings_account.clear_avatar', '移除頭貼') }}
            </button>
          </div>

          <div class="action-row">
            <button class="btn primary" :disabled="profileSaving || avatarUploading || apiUnavailable || !canSaveProfile" @click="saveProfile">
              {{ profileSaving ? t('settings_account.saving', '儲存中...') : t('common.save') }}
            </button>
            <button class="btn" :disabled="loggingOut || apiUnavailable" @click="handleLogout">
              {{ loggingOut ? t('settings_account.logging_out', '登出中...') : t('settings_account.logout', '登出') }}
            </button>
          </div>

          <p v-if="profileSavedMessage" class="success-notice">
            {{ profileSavedMessage }}
          </p>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_account.change_password', '更改密碼') }}</h3>
          </header>

          <div class="form-grid">
            <label v-if="!sessionMustChangePassword" class="field">
              {{ t('settings_account.current_password', '目前密碼') }}
              <input
                v-model="passwordForm.currentPassword"
                class="input"
                type="password"
                maxlength="64"
                autocomplete="current-password"
                :placeholder="t('settings_account.current_password_placeholder', '輸入目前密碼')"
                :disabled="passwordSaving || apiUnavailable"
              />
            </label>

            <label class="field">
              {{ t('settings_account.new_password', '新密碼') }}
              <input
                v-model="passwordForm.nextPassword"
                class="input"
                type="password"
                maxlength="64"
                autocomplete="new-password"
                :placeholder="t('settings_account.password_placeholder', '至少 8 碼')"
                :disabled="passwordSaving || apiUnavailable"
              />
            </label>

            <label class="field">
              {{ t('settings_account.password_confirm', '確認密碼') }}
              <input
                v-model="passwordForm.confirmPassword"
                class="input"
                type="password"
                maxlength="64"
                autocomplete="new-password"
                :placeholder="t('settings_account.password_confirm_placeholder', '再輸入一次新密碼')"
                :disabled="passwordSaving || apiUnavailable"
                @keyup.enter="submitPasswordChange"
              />
            </label>
          </div>

          <p class="muted compact">
            {{
              sessionMustChangePassword
                ? t('settings_account.change_password_force_hint', '臨時密碼只能用來登入一次，請立即設定正式密碼。')
                : t('settings_account.change_password_hint', '若要修改密碼，請先輸入目前密碼，再設定新密碼。')
            }}
          </p>

          <p v-if="passwordSavedMessage" class="success-notice">
            {{ passwordSavedMessage }}
          </p>

          <button class="btn primary wide-btn" :disabled="passwordSaving || apiUnavailable || !canSubmitPasswordChange" @click="submitPasswordChange">
            {{ passwordSaving ? t('settings_account.saving', '儲存中...') : t('settings_account.change_password_submit', '更新密碼') }}
          </button>
        </article>

        <article v-if="!sessionMustChangePassword" class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_account.referral', '邀請好友') }}</h3>
          </header>

          <div class="referral-code-row">
            <div class="code-box">
              <span class="code-label">{{ t('settings_account.my_referral_code', '我的邀請碼') }}</span>
              <strong>{{ referralSummary?.code || '-' }}</strong>
            </div>
            <button class="btn" :disabled="!referralSummary?.code" @click="copyReferralCode">
              {{ t('settings_account.copy_code', '複製邀請碼') }}
            </button>
          </div>

          <div class="meta-grid">
            <div>
              <span class="meta-label">{{ t('settings_account.invited_count', '成功邀請') }}</span>
              <strong>{{ referralSummary?.invited_count ?? 0 }}</strong>
            </div>
            <div>
              <span class="meta-label">{{ t('settings_account.inviter_reward', '邀請者獎勵') }}</span>
              <strong>{{ t('settings_account.inviter_reward_value', '7 天會員') }}</strong>
            </div>
            <div>
              <span class="meta-label">{{ t('settings_account.invitee_reward', '被邀請者獎勵') }}</span>
              <strong>{{ t('settings_account.invitee_reward_value', '3 天會員') }}</strong>
            </div>
          </div>

          <p v-if="sessionUser.referral_redeemed_at" class="muted compact">
            {{
              t(
                'settings_account.redeemed_hint',
                { name: referralSummary?.referred_by_display_name || '-' },
                '你已使用邀請碼，邀請人：{name}',
              )
            }}
          </p>

          <div v-else class="join-row">
            <input
              v-model.trim="redeemCodeInput"
              class="input"
              type="text"
              maxlength="16"
              :placeholder="t('settings_account.redeem_placeholder', '輸入好友邀請碼')"
              :disabled="referralSubmitting || apiUnavailable"
              @keyup.enter="submitReferralCode"
            />
            <button class="btn primary" :disabled="referralSubmitting || apiUnavailable || !redeemCodeInput" @click="submitReferralCode">
              {{ referralSubmitting ? t('settings_account.redeeming', '啟用中...') : t('settings_account.redeem', '啟用邀請碼') }}
            </button>
          </div>

          <p class="muted compact">
            {{ t('settings_account.referral_hint', '邀請人與被邀請人都必須先登入帳號，且同一組好友不可重複邀請。') }}
          </p>
        </article>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { getMembershipTierSnapshot } from '@/core/services/membership.service'
import {
  changeSharedLedgerPassword,
  getReferralSummary,
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  loginSharedLedgerAccount,
  logoutSharedLedgerAccount,
  redeemReferralCode,
  refreshSharedLedgerSession,
  registerSharedLedgerAccount,
  requestSharedLedgerPasswordReset,
  resetSharedLedgerPassword,
  subscribeSharedLedgerSession,
  updateSharedLedgerProfile,
} from '@/services/shared-ledger/backend'

const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const apiUnavailable = computed(() => !isSharedLedgerApiConfigured())
const apiUnavailableMessage = computed(() => getSharedLedgerApiUnavailableMessage())
const authMode = ref('login')
const authSubmitting = ref(false)
const profileSaving = ref(false)
const avatarUploading = ref(false)
const loggingOut = ref(false)
const profileSavedMessage = ref('')
const passwordSaving = ref(false)
const passwordSavedMessage = ref('')
const referralSubmitting = ref(false)
const resetRequestSubmitting = ref(false)
const resetSubmitting = ref(false)
const forgotPasswordMode = ref(false)
const resetRequestCooldownSeconds = ref(0)
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const referralSummary = ref(null)
const redeemCodeInput = ref('')
const resetRequestMessage = ref('')
const debugTemporaryPassword = ref('')
const authForm = ref({
  email: '',
  displayName: '',
  password: '',
})
const passwordForm = ref({
  currentPassword: '',
  nextPassword: '',
  confirmPassword: '',
})
const resetRequestForm = ref({
  email: '',
})
const resetForm = ref({
  password: '',
  confirmPassword: '',
})
const profileForm = ref({
  displayName: '',
  avatarUrl: '',
})
const avatarInputEl = ref(null)
let resetRequestCountdownTimer = null

const MAX_AVATAR_SIDE_PX = 320
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024
const MAX_AVATAR_DATA_URL_LENGTH = 5 * 1024 * 1024

const resetToken = computed(() => String(route.query.token ?? '').trim())
const isResetPasswordMode = computed(() => String(route.query.mode ?? '').trim() === 'reset-password' && Boolean(resetToken.value))
const sessionMustChangePassword = computed(() => Boolean(sessionUser.value?.must_change_password))

function looksLikeEmail(value) {
  const source = String(value ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)
}

const canSubmitAuth = computed(() => {
  if (!looksLikeEmail(authForm.value.email) || !authForm.value.password) return false
  if (authMode.value === 'register' && !authForm.value.displayName) return false
  return true
})

const canRequestPasswordReset = computed(() => looksLikeEmail(resetRequestForm.value.email))
const canSubmitPasswordReset = computed(() => {
  if (!resetToken.value) return false
  if (String(resetForm.value.password ?? '').length < 8) return false
  return resetForm.value.password === resetForm.value.confirmPassword
})

const canSaveProfile = computed(() => {
  if (!sessionUser.value) return false
  return (
    String(profileForm.value.displayName ?? '').trim() !== String(sessionUser.value.display_name ?? '').trim()
    || String(profileForm.value.avatarUrl ?? '').trim() !== String(sessionUser.value.avatar_url ?? '').trim()
  )
})

const canSubmitPasswordChange = computed(() => {
  if (!sessionUser.value) return false
  if (!sessionMustChangePassword.value && !String(passwordForm.value.currentPassword ?? '')) return false
  if (String(passwordForm.value.nextPassword ?? '').length < 8) return false
  return passwordForm.value.nextPassword === passwordForm.value.confirmPassword
})

const avatarLabel = computed(() => {
  const base = String(profileForm.value.displayName || sessionUser.value?.display_name || sessionUser.value?.email || '')
    .trim()
  return base ? base.slice(0, 1).toUpperCase() : '?'
})

const membershipLabel = computed(() => {
  const tier = getMembershipTierSnapshot()
  if (tier === 'member') {
    const expiresAt = String(sessionUser.value?.membership_bonus_expires_at ?? '').trim()
    if (expiresAt) {
      return t('settings_account.membership_bonus', { time: new Date(expiresAt).toLocaleString() }, '會員有效至 {time}')
    }
    return t('settings_account.membership_active', '會員啟用中')
  }
  return t('settings_account.membership_free', '目前為免費版')
})

function syncProfileFormFromSession() {
  profileForm.value = {
    displayName: String(sessionUser.value?.display_name ?? ''),
    avatarUrl: String(sessionUser.value?.avatar_url ?? ''),
  }
}

function resetAvatarInputElement() {
  if (avatarInputEl.value) {
    avatarInputEl.value.value = ''
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('讀取圖片失敗'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('圖片格式不支援'))
    image.src = src
  })
}

async function convertImageFileToAvatarDataUrl(file) {
  if (!file || !String(file.type ?? '').startsWith('image/')) {
    throw new Error('請選擇圖片檔')
  }
  if (Number(file.size ?? 0) > MAX_AVATAR_FILE_BYTES) {
    throw new Error('頭貼圖片不可超過 5MB')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(sourceDataUrl)
  const width = Number(image.naturalWidth || image.width || 0)
  const height = Number(image.naturalHeight || image.height || 0)
  if (!width || !height) {
    throw new Error('圖片尺寸錯誤')
  }

  const scale = Math.min(1, MAX_AVATAR_SIDE_PX / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('裝置不支援圖片處理')
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  let quality = 0.9
  let avatarDataUrl = canvas.toDataURL('image/jpeg', quality)
  while (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH && quality > 0.45) {
    quality -= 0.08
    avatarDataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  if (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error('圖片過大，請改用較小的圖片')
  }

  return avatarDataUrl
}

async function handleAvatarFileChange(event) {
  const file = event?.target?.files?.[0]
  if (!file || apiUnavailable.value) return
  avatarUploading.value = true
  try {
    profileForm.value.avatarUrl = await convertImageFileToAvatarDataUrl(file)
    uiStore.pushToast(t('settings_account.avatar_ready', '頭貼已載入，記得按儲存'))
  } catch (error) {
    resetAvatarInputElement()
    uiStore.pushToast(error.message || t('settings_account.avatar_upload_failed', '上傳頭貼失敗'), 'error')
  } finally {
    avatarUploading.value = false
  }
}

function clearAvatar() {
  profileForm.value.avatarUrl = ''
  resetAvatarInputElement()
}

function stopResetRequestCountdown() {
  if (resetRequestCountdownTimer != null) {
    globalThis.clearInterval(resetRequestCountdownTimer)
    resetRequestCountdownTimer = null
  }
}

function startResetRequestCountdown(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0))
  resetRequestCooldownSeconds.value = safeSeconds
  stopResetRequestCountdown()
  if (!safeSeconds) return
  resetRequestCountdownTimer = globalThis.setInterval(() => {
    if (resetRequestCooldownSeconds.value <= 1) {
      resetRequestCooldownSeconds.value = 0
      stopResetRequestCountdown()
      return
    }
    resetRequestCooldownSeconds.value -= 1
  }, 1000)
}

function openForgotPasswordMode() {
  forgotPasswordMode.value = true
  resetRequestForm.value.email = String(authForm.value.email ?? '').trim()
  resetRequestMessage.value = ''
  debugTemporaryPassword.value = ''
}

function closeForgotPasswordMode() {
  forgotPasswordMode.value = false
  resetRequestMessage.value = ''
  debugTemporaryPassword.value = ''
  stopResetRequestCountdown()
  resetRequestCooldownSeconds.value = 0
}

async function clearResetPasswordMode() {
  resetForm.value.password = ''
  resetForm.value.confirmPassword = ''
  await router.replace({ path: '/settings/account' })
}

async function loadReferralSummary() {
  if (!sessionUser.value || apiUnavailable.value || sessionMustChangePassword.value) {
    referralSummary.value = null
    return
  }
  try {
    const result = await getReferralSummary()
    referralSummary.value = result.summary ?? null
    sessionUser.value = result.user ?? sessionUser.value
    syncProfileFormFromSession()
  } catch (error) {
    if (error?.code === 'password_change_required') {
      referralSummary.value = null
      return
    }
    uiStore.pushToast(error.message || t('settings_account.referral_load_failed', '載入邀請資訊失敗'), 'error')
  }
}

async function refreshSession() {
  if (apiUnavailable.value) return
  try {
    const session = await refreshSharedLedgerSession()
    sessionUser.value = session?.user ?? null
  } catch {
    sessionUser.value = null
  }
  syncProfileFormFromSession()
  if (!sessionMustChangePassword.value) {
    await loadReferralSummary()
  } else {
    referralSummary.value = null
  }
}

async function submitAuth() {
  if (!canSubmitAuth.value || apiUnavailable.value) return
  authSubmitting.value = true
  try {
    const payload = {
      email: authForm.value.email,
      displayName: authForm.value.displayName,
      password: authForm.value.password,
    }
    const session = authMode.value === 'login'
      ? await loginSharedLedgerAccount(payload)
      : await registerSharedLedgerAccount(payload)
    sessionUser.value = session.user
    authForm.value.password = ''
    forgotPasswordMode.value = false
    resetRequestMessage.value = ''
    debugTemporaryPassword.value = ''
    syncProfileFormFromSession()
    if (!session.user?.must_change_password) {
      await loadReferralSummary()
    } else {
      referralSummary.value = null
    }
    uiStore.pushToast(
      authMode.value === 'login'
        ? (
            session.user?.must_change_password
              ? t('settings_account.toast.login_temp_password_done', '已使用臨時密碼登入，請先更改密碼')
              : t('settings_account.toast.login_done', '登入成功')
          )
        : t('settings_account.toast.register_done', '註冊成功'),
    )
  } catch (error) {
    if (error?.code === 'password_reset_required') {
      openForgotPasswordMode()
      resetRequestMessage.value = t('settings_account.password_reset_required_notice', '密碼錯誤已達 10 次，請先寄送臨時密碼。')
    }
    uiStore.pushToast(error.message || t('settings_account.toast.auth_failed', '登入失敗'), 'error')
  } finally {
    authSubmitting.value = false
  }
}

async function submitPasswordResetRequest() {
  if (!canRequestPasswordReset.value || apiUnavailable.value || resetRequestCooldownSeconds.value > 0) return
  resetRequestSubmitting.value = true
  try {
    const result = await requestSharedLedgerPasswordReset({
      email: resetRequestForm.value.email,
    })
    startResetRequestCountdown(result?.cooldown_seconds)
    resetRequestMessage.value = result?.message || t('settings_account.temp_password_sent', '如果此 Email 已註冊，系統會寄出臨時密碼。')
    debugTemporaryPassword.value = String(result?.debug_temporary_password ?? '').trim()
    uiStore.pushToast(t('settings_account.toast.temp_password_sent', '臨時密碼已送出'))
  } catch (error) {
    if (error?.retryAfterSeconds > 0) {
      startResetRequestCountdown(error.retryAfterSeconds)
    }
    uiStore.pushToast(error.message || t('settings_account.toast.temp_password_failed', '寄送臨時密碼失敗'), 'error')
  } finally {
    resetRequestSubmitting.value = false
  }
}

async function submitPasswordResetConfirm() {
  if (!canSubmitPasswordReset.value || apiUnavailable.value) return
  resetSubmitting.value = true
  try {
    const session = await resetSharedLedgerPassword({
      token: resetToken.value,
      password: resetForm.value.password,
    })
    sessionUser.value = session.user
    resetForm.value.password = ''
    resetForm.value.confirmPassword = ''
    syncProfileFormFromSession()
    await clearResetPasswordMode()
    if (!session.user?.must_change_password) {
      await loadReferralSummary()
    }
    uiStore.pushToast(t('settings_account.toast.password_reset_done', '密碼已更新並完成登入'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.password_reset_failed', '重設密碼失敗'), 'error')
  } finally {
    resetSubmitting.value = false
  }
}

async function saveProfile() {
  if (!canSaveProfile.value || apiUnavailable.value) return
  profileSaving.value = true
  profileSavedMessage.value = ''
  try {
    const result = await updateSharedLedgerProfile({
      displayName: profileForm.value.displayName,
      avatarUrl: profileForm.value.avatarUrl,
    })
    sessionUser.value = result.user
    syncProfileFormFromSession()
    resetAvatarInputElement()
    profileSavedMessage.value = t('settings_account.toast.profile_saved', '帳號資料已更新')
    uiStore.pushToast(t('settings_account.toast.profile_saved', '帳號資料已更新'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.profile_failed', '更新帳號資料失敗'), 'error')
  } finally {
    profileSaving.value = false
  }
}

async function submitPasswordChange() {
  if (!canSubmitPasswordChange.value || apiUnavailable.value) return
  passwordSaving.value = true
  passwordSavedMessage.value = ''
  try {
    const session = await changeSharedLedgerPassword({
      currentPassword: passwordForm.value.currentPassword,
      nextPassword: passwordForm.value.nextPassword,
    })
    sessionUser.value = session.user
    passwordForm.value.currentPassword = ''
    passwordForm.value.nextPassword = ''
    passwordForm.value.confirmPassword = ''
    passwordSavedMessage.value = t('settings_account.toast.password_changed', '密碼已更新')
    uiStore.pushToast(t('settings_account.toast.password_changed', '密碼已更新'))
    await loadReferralSummary()
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.password_change_failed', '更改密碼失敗'), 'error')
  } finally {
    passwordSaving.value = false
  }
}

async function handleLogout() {
  loggingOut.value = true
  try {
    await logoutSharedLedgerAccount()
    sessionUser.value = null
    referralSummary.value = null
    passwordSavedMessage.value = ''
    syncProfileFormFromSession()
    uiStore.pushToast(t('settings_account.toast.logout_done', '已登出帳號'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.logout_failed', '登出失敗'), 'error')
  } finally {
    loggingOut.value = false
  }
}

async function submitReferralCode() {
  if (!redeemCodeInput.value || apiUnavailable.value) return
  referralSubmitting.value = true
  try {
    const result = await redeemReferralCode(redeemCodeInput.value)
    sessionUser.value = result.user
    referralSummary.value = result.summary ?? null
    redeemCodeInput.value = ''
    syncProfileFormFromSession()
    uiStore.pushToast(t('settings_account.toast.redeem_done', '邀請碼已啟用，會員獎勵已生效'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.redeem_failed', '邀請碼啟用失敗'), 'error')
  } finally {
    referralSubmitting.value = false
  }
}

async function copyReferralCode() {
  const code = String(referralSummary.value?.code ?? '').trim()
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    uiStore.pushToast(t('settings_account.toast.code_copied', '邀請碼已複製'))
  } catch {
    uiStore.pushToast(t('settings_account.toast.copy_failed', '複製邀請碼失敗'), 'error')
  }
}

let unsubscribeSession = null

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? null
    syncProfileFormFromSession()
    profileSavedMessage.value = ''
    passwordSavedMessage.value = ''
  })
  void refreshSession()
})

watch(
  () => `${String(profileForm.value.displayName ?? '').trim()}::${String(profileForm.value.avatarUrl ?? '').trim()}`,
  () => {
    if (profileSaving.value) return
    profileSavedMessage.value = ''
  },
)

watch(
  () => `${String(passwordForm.value.currentPassword ?? '')}::${String(passwordForm.value.nextPassword ?? '')}::${String(passwordForm.value.confirmPassword ?? '')}`,
  () => {
    if (passwordSaving.value) return
    passwordSavedMessage.value = ''
  },
)

onUnmounted(() => {
  stopResetRequestCountdown()
  if (typeof unsubscribeSession === 'function') {
    unsubscribeSession()
  }
})
</script>

<style scoped>
.panel {
  padding: 14px;
}

h2,
h3,
p {
  margin: 0;
}

.intro,
.compact {
  margin: 0;
}

.notice,
.success-notice {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
}

.notice {
  background: color-mix(in srgb, #f44336 10%, var(--card));
}

.success-notice {
  background: color-mix(in srgb, #2e7d32 12%, var(--card));
}

.warning-panel {
  border-color: color-mix(in srgb, #ff9800 55%, var(--line, var(--field-border)));
}

.section-head,
.tab-row,
.action-row,
.join-row,
.referral-code-row,
.helper-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.tab-btn,
.link-btn {
  font: inherit;
}

.tab-btn {
  border: 1px solid var(--line, var(--field-border));
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 8px 14px;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--primary) 18%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 50%, var(--line, var(--field-border)));
}

.link-btn {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
}

.form-grid,
.profile-meta {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}

.wide-btn {
  margin-top: 15px;
  width: 100%;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.avatar-wrap {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-img,
.avatar-fallback {
  width: 100%;
  height: 100%;
}

.avatar-img {
  object-fit: cover;
}

.avatar-fallback {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 76%, #fff 24%), #1b8f6a);
  color: #fff;
  font-size: 24px;
  font-weight: 800;
}

.code-box,
.meta-grid > div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 84%, #111 16%);
}

.code-box {
  min-width: 180px;
}

.code-label,
.meta-label {
  font-size: 12px;
  color: var(--muted);
}

.meta-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin: 12px 0;
}

.debug-link {
  color: var(--primary);
  word-break: break-all;
}

@media (max-width: 640px) {
  .section-head,
  .join-row,
  .referral-code-row,
  .profile-row,
  .helper-row {
    flex-direction: column;
    align-items: stretch;
  }

  .avatar-wrap {
    margin: 0 auto;
  }
}
</style>
