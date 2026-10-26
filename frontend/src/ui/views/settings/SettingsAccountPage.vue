<template>
  <HabitatPageShell
    :title="t('settings_account.title')"
    :kicker="t('settings_account.habitat_hello')"
    test-id="settings-account-view"
    back-to="/settings"
    stack-class="settings-subpage"
  >


      <article class="card panel">
        <p class="muted intro">
          {{ t('settings_account.desc', '可使用 Email / 密碼或 Google 登入，之後可管理個人資料、推薦碼與登出。') }}
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

      <article v-else-if="sessionRestoring && !sessionUser" class="card panel" data-testid="account-session-restoring-panel">
        <header class="section-head">
          <h3>{{ t('settings_account.session_restoring', 'Session 恢復中') }}</h3>
        </header>
        <p class="session-status-row" data-testid="account-session-status">
          <span class="session-pill warn" data-testid="account-session-restoring-pill">
            {{ t('settings_account.session_restoring', 'Session 恢復中') }}
          </span>
          <span class="session-pill danger" data-testid="account-sync-paused-pill">
            {{ t('settings_account.sync_paused', '同步暫停') }}
          </span>
        </p>
        <p class="notice compact">
          {{ t('settings_account.session_restoring_hint', '正在恢復登入狀態，完成後會自動繼續同步。') }}
        </p>
      </article>

      <article v-else-if="!sessionUser" class="card panel">
        <header class="section-head">
          <h3>{{ authMode === 'login' ? t('settings_account.login', '登入') : t('settings_account.register', '註冊') }}</h3>
          <div
            class="segment-pills tab-row"
            role="tablist"
            :aria-label="t('settings_account.login_register', '登入 / 註冊')"
          >
            <button
              type="button"
              role="tab"
              class="tab-btn"
              :class="{ primary: authMode === 'login', active: authMode === 'login' }"
              :aria-selected="authMode === 'login' ? 'true' : 'false'"
              data-testid="account-auth-tab-login"
              @click="authMode = 'login'"
            >
              {{ t('settings_account.login', '登入') }}
            </button>
            <button
              type="button"
              role="tab"
              class="tab-btn"
              :class="{ primary: authMode === 'register', active: authMode === 'register' }"
              :aria-selected="authMode === 'register' ? 'true' : 'false'"
              data-testid="account-auth-tab-register"
              @click="authMode = 'register'"
            >
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

        <div v-if="showGoogleAuthAction" class="google-auth-block">
          <p class="muted compact">
            {{
              sessionUser
                ? t('settings_account.google_bind_hint', '也可以綁定 Google，之後直接用 Google 登入')
                : t('settings_account.google_login_hint', '也可以直接使用 Google 登入')
            }}
          </p>
          <p v-if="googleUnavailableReason" class="muted compact">
            {{ googleUnavailableReason }}
          </p>
          <div v-else-if="isWebGoogleRuntime" ref="googleButtonHost" class="google-button-host"></div>
          <button
            v-else
            class="btn google-btn wide-btn"
            :disabled="googleAuthSubmitting || apiUnavailable"
            @click="handleGoogleAuthAction"
          >
            {{
              googleAuthSubmitting
                ? t('settings_account.google_working', 'Google 處理中...')
                : sessionUser
                  ? t('settings_account.google_bind', '綁定 Google')
                  : t('settings_account.google_login', '使用 Google 登入')
            }}
          </button>
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
              <p class="session-status-row" data-testid="account-session-status">
                <span
                  class="session-pill"
                  :class="sessionNeedsReauth ? 'expired' : 'ok'"
                  data-testid="account-session-pill"
                >
                  {{
                    sessionNeedsReauth
                      ? t('settings_account.session_expired', '● 已過期')
                      : t('settings_account.session_signed_in', '● 已登入')
                  }}
                </span>
                <span
                  v-if="sessionValid"
                  class="session-pill ok"
                  data-testid="account-session-valid-pill"
                >
                  {{ t('settings_account.session_active', 'Session 有效') }}
                </span>
                <span
                  v-else-if="sessionRestoring"
                  class="session-pill warn"
                  data-testid="account-session-restoring-pill"
                >
                  {{ t('settings_account.session_restoring', 'Session 恢復中') }}
                </span>
                <span
                  v-if="sessionValid"
                  class="session-pill ok"
                  data-testid="account-auto-sync-pill"
                >
                  {{ t('settings_account.auto_sync_on', '自動同步開') }}
                </span>
                <span
                  v-if="sessionNeedsReauth || sessionRestoring"
                  class="session-pill danger"
                  data-testid="account-sync-paused-pill"
                >
                  {{ t('settings_account.sync_paused', '同步暫停') }}
                </span>
                <span
                  v-if="sessionNeedsReauth"
                  class="session-pill expired"
                  data-testid="account-needs-relogin-pill"
                >
                  {{ t('settings_account.session_needs_relogin', '需重新登入') }}
                </span>
              </p>
              <p class="muted compact">
                {{ membershipLabel }}
              </p>
              <p v-if="sessionNeedsReauth" class="notice compact">
                {{ t('settings_account.session_needs_relogin_hint', '登入狀態已過期，已保留帳號資料。請重新登入後再繼續使用會員功能。') }}
              </p>
              <p v-else-if="sessionRestoring" class="notice compact">
                {{ t('settings_account.session_restoring_hint', '正在恢復登入狀態，完成後會自動繼續同步。') }}
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

        <article v-if="!sessionMustChangePassword" class="card panel">
          <header class="section-head">
            <h3>{{ t('settings_account.login_methods', '登入方式') }}</h3>
          </header>

          <div class="provider-grid">
            <div class="provider-card" :class="{ linked: hasPasswordLogin }">
              <strong>{{ t('settings_account.email_password', 'Email / 密碼') }}</strong>
              <small class="muted">
                {{
                  hasPasswordLogin
                    ? t('settings_account.email_password_enabled', '已啟用')
                    : t('settings_account.email_password_missing', '尚未設定密碼')
                }}
              </small>
            </div>

            <div class="provider-card" :class="{ linked: !!googleLinkedProvider }">
              <strong>Google</strong>
              <small class="muted provider-status">
                {{ googleLinkedProvider ? t('settings_account.google_bound', '已綁定') : t('settings_account.google_unbound', '尚未綁定') }}
              </small>
              <small v-if="googleLinkedProvider?.email" class="muted provider-detail">
                {{ googleLinkedProvider.email }}
              </small>
            </div>
          </div>

          <div v-if="showGoogleAuthAction" class="google-auth-block">
            <p v-if="googleUnavailableReason" class="muted compact">
              {{ googleUnavailableReason }}
            </p>
            <div v-else-if="isWebGoogleRuntime" ref="googleButtonHost" class="google-button-host"></div>
            <button
              v-else
              class="btn google-btn wide-btn"
              :disabled="googleAuthSubmitting || apiUnavailable"
              @click="handleGoogleAuthAction"
            >
              {{
                googleAuthSubmitting
                  ? t('settings_account.google_working', 'Google 處理中...')
                  : t('settings_account.google_bind', '綁定 Google')
              }}
            </button>
          </div>

          <p v-if="googleLinkedProvider?.last_login_at" class="muted compact">
            {{
              t(
                'settings_account.google_last_login',
                { time: new Date(googleLinkedProvider.last_login_at).toLocaleString() },
                'Google 最近登入：{time}',
              )
            }}
          </p>
        </article>

        <article class="card panel">
          <header class="section-head">
            <h3>{{ passwordSectionTitle }}</h3>
          </header>

          <div class="form-grid">
            <label v-if="showCurrentPasswordInput" class="field">
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

          <div v-if="requiresGooglePasswordVerification" class="google-auth-block">
            <p class="muted compact">
              {{
                googlePasswordVerified
                  ? t('settings_account.google_password_verified', '已確認 Google 登入狀態，現在可以設定密碼。')
                  : t('settings_account.google_password_verify_hint', '此帳號目前是使用 Google 登入，新增密碼前請先確認 Google 登入狀態。')
              }}
            </p>
            <p v-if="googleUnavailableReason" class="muted compact">
              {{ googleUnavailableReason }}
            </p>
            <div v-else-if="isWebGoogleRuntime" ref="googlePasswordButtonHost" class="google-button-host"></div>
            <button
              v-else
              class="btn google-btn wide-btn"
              :disabled="googleAuthSubmitting || apiUnavailable"
              @click="handleGoogleAuthAction"
            >
              {{
                googleAuthSubmitting
                  ? t('settings_account.google_working', 'Google 處理中...')
                  : (
                      googlePasswordVerified
                        ? t('settings_account.google_password_reverify', '重新確認 Google')
                        : t('settings_account.google_password_verify', '確認 Google 登入')
                    )
              }}
            </button>
          </div>

          <p class="muted compact">
            {{ passwordChangeHint }}
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
              @paste="handleReferralCodePaste"
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
  </HabitatPageShell>
</template>

<script setup>
import HabitatPageShell from '@/ui/components/layout/HabitatPageShell.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { goBackOrFallback } from '@/ui/services/navigation-back.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { getMembershipTierSnapshot } from '@/core/services/membership.service'
import {
  changeSharedLedgerPassword,
  getReferralSummary,
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerAuthStatus,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  loginSharedLedgerAccount,
  loginSharedLedgerWithGoogle,
  logoutSharedLedgerAccount,
  needsSharedLedgerReauth,
  prepareSharedLedgerGoogleAuth,
  redeemReferralCode,
  refreshSharedLedgerSession,
  registerSharedLedgerAccount,
  requestSharedLedgerPasswordReset,
  resetSharedLedgerPassword,
  subscribeSharedLedgerSession,
  updateSharedLedgerProfile,
} from '@/services/shared-ledger/backend'
import {
  disableGoogleIdentityAutoSelect,
  getGoogleIdentityUnavailableReason,
  isGoogleIdentitySupported,
  renderGoogleIdentityButton,
  signInWithGoogleCredentialManager,
} from '@/ui/services/google-identity.service'

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
const sessionNeedsReauth = ref(needsSharedLedgerReauth())
const sessionValid = ref(Boolean(getSharedLedgerAuthStatus().sessionValid))
const sessionRestoring = ref(Boolean(getSharedLedgerAuthStatus().restoring))

function syncSessionStatusFromAuth() {
  const status = getSharedLedgerAuthStatus()
  sessionNeedsReauth.value = Boolean(status.needsReauth)
  sessionValid.value = Boolean(status.sessionValid)
  sessionRestoring.value = Boolean(status.restoring)
}
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
const googleButtonHost = ref(null)
const googlePasswordButtonHost = ref(null)
const googleAuthSubmitting = ref(false)
const googleChallenge = ref(null)
const googlePasswordVerification = ref({
  idToken: '',
  nonce: '',
  verifiedAt: '',
})
let resetRequestCountdownTimer = null
let googleChallengeRefreshTimer = null
let googleChallengeRequest = null

const MAX_AVATAR_SIDE_PX = 320
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024
const MAX_AVATAR_DATA_URL_LENGTH = 5 * 1024 * 1024
const APP_DOWNLOAD_URL = 'https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook'
const REFERRAL_CODE_PATTERN = /(^|[^A-Z0-9])([A-Z0-9]{8})(?=$|[^A-Z0-9])/i
const GOOGLE_CHALLENGE_REUSE_BUFFER_MS = 60_000

const resetToken = computed(() => String(route.query.token ?? '').trim())
const isResetPasswordMode = computed(() => String(route.query.mode ?? '').trim() === 'reset-password' && Boolean(resetToken.value))
const sessionMustChangePassword = computed(() => Boolean(sessionUser.value?.must_change_password))
const isWebGoogleRuntime = computed(() => Capacitor.getPlatform() === 'web')
const isAndroidGoogleRuntime = computed(() => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
const googleIdentityAvailable = computed(() => isGoogleIdentitySupported())
const googleUnavailableReason = computed(() => {
  if (!googleIdentityAvailable.value) {
    return getGoogleIdentityUnavailableReason()
  }
  return ''
})
const googleLinkedProvider = computed(() => {
  const providers = Array.isArray(sessionUser.value?.auth_providers) ? sessionUser.value.auth_providers : []
  return providers.find((item) => String(item?.provider ?? '').trim() === 'google') ?? null
})
const hasPasswordLogin = computed(() => Boolean(sessionUser.value?.has_password))
const requiresGooglePasswordVerification = computed(() => (
  Boolean(sessionUser.value)
  && !sessionMustChangePassword.value
  && !hasPasswordLogin.value
  && Boolean(googleLinkedProvider.value)
))
const showCurrentPasswordInput = computed(() => !sessionMustChangePassword.value && hasPasswordLogin.value)
const googlePasswordVerified = computed(() => Boolean(
  googlePasswordVerification.value.idToken
  && googlePasswordVerification.value.nonce,
))
const showGoogleAuthAction = computed(() => (
  !apiUnavailable.value
  && (
    !sessionUser.value
    || (!sessionMustChangePassword.value && !googleLinkedProvider.value)
  )
))
const passwordSectionTitle = computed(() => (
  hasPasswordLogin.value
    ? t('settings_account.change_password', '更改密碼')
    : t('settings_account.set_password', '設定密碼')
))
const passwordChangeHint = computed(() => {
  if (sessionMustChangePassword.value) {
    return t('settings_account.change_password_force_hint', '臨時密碼只能用來登入一次，請立即設定正式密碼。')
  }
  if (showCurrentPasswordInput.value) {
    return t('settings_account.change_password_hint', '若要修改密碼，請先輸入目前密碼，再設定新密碼。')
  }
  if (requiresGooglePasswordVerification.value) {
    return googlePasswordVerified.value
      ? t('settings_account.set_password_google_verified_hint', 'Google 驗證已完成，設定密碼後也可以改用 Email / 密碼登入。')
      : t('settings_account.set_password_google_hint', '你目前是使用 Google 登入，先確認 Google 後即可新增密碼。')
  }
  return t('settings_account.set_password_hint', '你目前是第三方登入帳號，設定密碼後也可以改用 Email / 密碼登入。')
})

function looksLikeEmail(value) {
  const source = String(value ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)
}

function extractReferralCode(value) {
  const source = String(value ?? '').trim().toUpperCase()
  if (!source) return ''
  const matched = source.match(REFERRAL_CODE_PATTERN)
  return String(matched?.[2] ?? '').trim()
}

function normalizeReferralCodeInput(value) {
  const source = String(value ?? '').trim()
  if (!source) return ''
  const extracted = extractReferralCode(source)
  if (extracted) return extracted
  if (/^[A-Z0-9\s-]+$/i.test(source)) {
    return source.replace(/[\s-]+/g, '').toUpperCase()
  }
  return source
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
  if (showCurrentPasswordInput.value && !String(passwordForm.value.currentPassword ?? '')) return false
  if (requiresGooglePasswordVerification.value && !googlePasswordVerified.value) return false
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

function clearGoogleChallengeRefreshTimer() {
  if (googleChallengeRefreshTimer != null) {
    globalThis.clearTimeout(googleChallengeRefreshTimer)
    googleChallengeRefreshTimer = null
  }
}

function clearGoogleButtonHost() {
  if (googleButtonHost.value) {
    googleButtonHost.value.innerHTML = ''
  }
}

function clearGooglePasswordButtonHost() {
  if (googlePasswordButtonHost.value) {
    googlePasswordButtonHost.value.innerHTML = ''
  }
}

function clearGooglePasswordVerification() {
  googlePasswordVerification.value = {
    idToken: '',
    nonce: '',
    verifiedAt: '',
  }
}

function scheduleGoogleChallengeRefresh(expiresAt) {
  clearGoogleChallengeRefreshTimer()
  const expiresAtMs = Date.parse(String(expiresAt ?? ''))
  if (!Number.isFinite(expiresAtMs)) return
  const delayMs = Math.max(5_000, expiresAtMs - Date.now() - 30_000)
  googleChallengeRefreshTimer = globalThis.setTimeout(() => {
    void refreshGoogleButtonUi()
  }, delayMs)
}

function hasReusableGoogleChallenge(challenge, purpose) {
  const normalizedPurpose = String(purpose ?? '').trim() || 'login'
  const expiresAtMs = Date.parse(String(challenge?.expires_at ?? ''))
  return (
    String(challenge?.nonce ?? '').trim()
    && String(challenge?.purpose ?? '').trim() === normalizedPurpose
    && Number.isFinite(expiresAtMs)
    && expiresAtMs - Date.now() > GOOGLE_CHALLENGE_REUSE_BUFFER_MS
  )
}

async function loadGoogleChallenge(purpose, { force = false } = {}) {
  if (!showGoogleAuthAction.value || apiUnavailable.value || !googleIdentityAvailable.value) return null
  const normalizedPurpose = String(purpose ?? '').trim() || (sessionUser.value ? 'link' : 'login')
  if (!force && hasReusableGoogleChallenge(googleChallenge.value, normalizedPurpose)) {
    scheduleGoogleChallengeRefresh(googleChallenge.value?.expires_at)
    return googleChallenge.value
  }
  if (!force && googleChallengeRequest?.purpose === normalizedPurpose) {
    return googleChallengeRequest.promise
  }

  const promise = prepareSharedLedgerGoogleAuth({ purpose: normalizedPurpose })
    .then((result) => {
      googleChallenge.value = result
      scheduleGoogleChallengeRefresh(result?.expires_at)
      return result
    })
    .finally(() => {
      if (googleChallengeRequest?.promise === promise) {
        googleChallengeRequest = null
      }
    })

  googleChallengeRequest = {
    purpose: normalizedPurpose,
    promise,
  }
  return promise
}

function toGoogleErrorMessage(error, fallback) {
  const code = String(error?.code ?? '').trim()
  if (code === 'google_canceled') return t('settings_account.google_canceled', '已取消 Google 登入')
  if (code === 'google_no_credential') return t('settings_account.google_no_credential', '裝置沒有可用的 Google 帳號，請先新增或改用其他登入方式')
  if (code === 'rate_limited') {
    const retryAfterSeconds = Math.max(0, Number(error?.retryAfterSeconds ?? 0) || 0)
    return retryAfterSeconds > 0
      ? t('settings_account.google_rate_limited_retry', { seconds: retryAfterSeconds }, '操作過於頻繁，請於 {seconds} 秒後再試')
      : t('settings_account.google_rate_limited', '操作過於頻繁，請稍後再試')
  }
  return error?.message || fallback
}

async function submitGoogleIdToken(idToken, purpose) {
  googleAuthSubmitting.value = true
  try {
    const session = await loginSharedLedgerWithGoogle({
      idToken,
      nonce: String(googleChallenge.value?.nonce ?? '').trim(),
      purpose,
    })
    sessionUser.value = session.user
    authForm.value.password = ''
    syncProfileFormFromSession()
    if (!session.user?.must_change_password) {
      await loadReferralSummary()
    } else {
      referralSummary.value = null
    }
    uiStore.pushToast(
      purpose === 'link'
        ? t('settings_account.google_bind_done', 'Google 已綁定完成')
        : t('settings_account.google_login_done', 'Google 登入成功'),
    )
  } catch (error) {
    uiStore.pushToast(toGoogleErrorMessage(error, t('settings_account.google_login_failed', 'Google 登入失敗')), 'error')
  } finally {
    googleAuthSubmitting.value = false
    googleChallenge.value = null
    await refreshGoogleButtonUi()
  }
}

async function submitGooglePasswordVerification(idToken) {
  const nonce = String(googleChallenge.value?.nonce ?? '').trim()
  if (!nonce) {
    throw new Error(t('settings_account.google_nonce_missing', 'Google 驗證資料已過期，請重新確認'))
  }
  googlePasswordVerification.value = {
    idToken: String(idToken ?? '').trim(),
    nonce,
    verifiedAt: new Date().toISOString(),
  }
  googleAuthSubmitting.value = false
  uiStore.pushToast(t('settings_account.google_password_verified', '已確認 Google 登入狀態，現在可以設定密碼。'))
  googleChallenge.value = null
  await refreshGoogleButtonUi()
}

async function refreshGoogleButtonUi() {
  clearGoogleChallengeRefreshTimer()
  const shouldRenderPasswordVerification = requiresGooglePasswordVerification.value
  const shouldRenderAnyGoogleUi = showGoogleAuthAction.value || shouldRenderPasswordVerification
  if (!shouldRenderAnyGoogleUi || apiUnavailable.value || !googleIdentityAvailable.value) {
    googleChallenge.value = null
    clearGoogleButtonHost()
    clearGooglePasswordButtonHost()
    return
  }

  const purpose = shouldRenderPasswordVerification
    ? 'password_change'
    : (sessionUser.value ? 'link' : 'login')
  let challenge = null
  try {
    challenge = await loadGoogleChallenge(purpose)
  } catch (error) {
    clearGoogleButtonHost()
    clearGooglePasswordButtonHost()
    uiStore.pushToast(toGoogleErrorMessage(error, t('settings_account.google_login_failed', 'Google 登入失敗')), 'error')
    return
  }
  if (!challenge) {
    clearGoogleButtonHost()
    clearGooglePasswordButtonHost()
    return
  }

  if (!isWebGoogleRuntime.value) {
    clearGoogleButtonHost()
    clearGooglePasswordButtonHost()
    return
  }

  await nextTick()
  const targetHost = shouldRenderPasswordVerification ? googlePasswordButtonHost.value : googleButtonHost.value
  if (!targetHost) return
  if (shouldRenderPasswordVerification) {
    clearGoogleButtonHost()
  } else {
    clearGooglePasswordButtonHost()
  }

  try {
    await renderGoogleIdentityButton(targetHost, {
      nonce: challenge.nonce,
      text: purpose === 'password_change'
        ? 'continue_with'
        : (purpose === 'link' ? 'continue_with' : 'signin_with'),
      width: 320,
      onCredential: ({ idToken }) => {
        if (purpose === 'password_change') {
          void submitGooglePasswordVerification(idToken)
          return
        }
        void submitGoogleIdToken(idToken, purpose)
      },
      onError: (error) => {
        const message = toGoogleErrorMessage(error, t('settings_account.google_login_failed', 'Google 登入失敗'))
        if (message) {
          uiStore.pushToast(message, 'error')
        }
        void refreshGoogleButtonUi()
      },
    })
  } catch (error) {
    uiStore.pushToast(toGoogleErrorMessage(error, t('settings_account.google_login_failed', 'Google 登入失敗')), 'error')
  }
}

async function handleGoogleAuthAction() {
  if (!isAndroidGoogleRuntime.value || googleAuthSubmitting.value || apiUnavailable.value) return
  const purpose = requiresGooglePasswordVerification.value
    ? 'password_change'
    : (sessionUser.value ? 'link' : 'login')
  googleAuthSubmitting.value = true
  try {
    const challenge = await loadGoogleChallenge(purpose)
    const result = await signInWithGoogleCredentialManager({
      nonce: String(challenge?.nonce ?? '').trim(),
    })
    if (!result?.idToken) {
      throw new Error(t('settings_account.google_id_token_missing', 'Google 未回傳可驗證的登入資料'))
    }
    if (purpose === 'password_change') {
      await submitGooglePasswordVerification(result.idToken)
    } else {
      await submitGoogleIdToken(result.idToken, purpose)
    }
  } catch (error) {
    googleAuthSubmitting.value = false
    uiStore.pushToast(toGoogleErrorMessage(error, t('settings_account.google_login_failed', 'Google 登入失敗')), 'error')
    await refreshGoogleButtonUi()
  }
}

function handleReferralCodePaste(event) {
  const pastedText = String(event?.clipboardData?.getData('text') ?? '')
  const extracted = extractReferralCode(pastedText)
  if (!extracted) return
  event.preventDefault()
  redeemCodeInput.value = extracted
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
    sessionUser.value = session?.user ?? getSharedLedgerSession()?.user ?? null
  } catch {
    sessionUser.value = getSharedLedgerSession()?.user ?? null
  }
  syncSessionStatusFromAuth()
  syncProfileFormFromSession()
  if (!sessionMustChangePassword.value) {
    await loadReferralSummary()
  } else {
    referralSummary.value = null
  }
  await refreshGoogleButtonUi()
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
    await refreshGoogleButtonUi()
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
    await refreshGoogleButtonUi()
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
    await goBackOrFallback(router, '/settings')
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
      googleIdToken: googlePasswordVerification.value.idToken,
      googleNonce: googlePasswordVerification.value.nonce,
    })
    sessionUser.value = session.user
    passwordForm.value.currentPassword = ''
    passwordForm.value.nextPassword = ''
    passwordForm.value.confirmPassword = ''
    clearGooglePasswordVerification()
    passwordSavedMessage.value = t('settings_account.toast.password_changed', '密碼已更新')
    uiStore.pushToast(t('settings_account.toast.password_changed', '密碼已更新'))
    await loadReferralSummary()
    await refreshGoogleButtonUi()
  } catch (error) {
    if ([
      'google_reauth_required',
      'google_nonce_invalid',
      'google_nonce_expired',
      'google_nonce_replayed',
      'google_nonce_purpose_mismatch',
      'google_nonce_user_mismatch',
    ].includes(String(error?.code ?? '').trim())) {
      clearGooglePasswordVerification()
      await refreshGoogleButtonUi()
    }
    uiStore.pushToast(error.message || t('settings_account.toast.password_change_failed', '更改密碼失敗'), 'error')
  } finally {
    passwordSaving.value = false
  }
}

async function handleLogout() {
  loggingOut.value = true
  try {
    await logoutSharedLedgerAccount()
    await disableGoogleIdentityAutoSelect()
    sessionUser.value = null
    referralSummary.value = null
    passwordSavedMessage.value = ''
    clearGooglePasswordVerification()
    syncProfileFormFromSession()
    await refreshGoogleButtonUi()
    uiStore.pushToast(t('settings_account.toast.logout_done', '已登出帳號'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.logout_failed', '登出失敗'), 'error')
  } finally {
    loggingOut.value = false
  }
}

async function submitReferralCode() {
  const normalizedCode = normalizeReferralCodeInput(redeemCodeInput.value)
  if (!normalizedCode || apiUnavailable.value) return
  referralSubmitting.value = true
  try {
    redeemCodeInput.value = normalizedCode
    const result = await redeemReferralCode(normalizedCode)
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
    await navigator.clipboard.writeText([
      `邀請碼：${code}`,
      APP_DOWNLOAD_URL,
    ].join('\n'))
    uiStore.pushToast(t('settings_account.toast.code_copied', '邀請碼已複製'))
  } catch {
    uiStore.pushToast(t('settings_account.toast.copy_failed', '複製邀請碼失敗'), 'error')
  }
}

let unsubscribeSession = null

onMounted(() => {
  unsubscribeSession = subscribeSharedLedgerSession((session) => {
    sessionUser.value = session?.user ?? getSharedLedgerSession()?.user ?? null
    syncSessionStatusFromAuth()
    clearGooglePasswordVerification()
    syncProfileFormFromSession()
    profileSavedMessage.value = ''
    passwordSavedMessage.value = ''
    void refreshGoogleButtonUi()
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

watch(
  () => `${sessionUser.value?.id ?? ''}:${hasPasswordLogin.value}:${googleLinkedProvider.value?.provider_sub ?? ''}:${requiresGooglePasswordVerification.value}`,
  () => {
    if (requiresGooglePasswordVerification.value) return
    clearGooglePasswordVerification()
  },
)

watch(
  () => redeemCodeInput.value,
  (value) => {
    const normalized = normalizeReferralCodeInput(value)
    if (normalized !== value) {
      redeemCodeInput.value = normalized
    }
  },
)

watch(
  () => `${showGoogleAuthAction.value}:${requiresGooglePasswordVerification.value}:${isWebGoogleRuntime.value}:${googleIdentityAvailable.value}:${sessionUser.value?.id ?? ''}:${googleLinkedProvider.value?.provider_sub ?? ''}`,
  () => {
    void refreshGoogleButtonUi()
  },
)

onUnmounted(() => {
  stopResetRequestCountdown()
  clearGoogleChallengeRefreshTimer()
  clearGoogleButtonHost()
  clearGooglePasswordButtonHost()
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

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: var(--primary-soft);
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

.session-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.session-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.session-pill.ok {
  color: #0f6b4c;
  background: color-mix(in srgb, #1b8f6a 16%, var(--card));
}

.session-pill.warn {
  color: #6b5a00;
  background: color-mix(in srgb, #e6c200 18%, var(--card));
}

.session-pill.expired {
  color: #8a3b00;
  background: color-mix(in srgb, #f0a202 18%, var(--card));
}

.session-pill.danger {
  color: #9b1c2c;
  background: color-mix(in srgb, #e85d6a 16%, var(--card));
}

.google-auth-block {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed color-mix(in srgb, var(--line, var(--field-border)) 72%, transparent);
}

.google-button-host {
  min-height: 44px;
}

.google-btn {
  background: #fff;
  color: #1f1f1f;
  border-color: color-mix(in srgb, #dadce0 78%, var(--line, var(--field-border)));
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

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.provider-card {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line, var(--field-border));
  background: color-mix(in srgb, var(--card) 86%, #111 14%);
}

.provider-card.linked {
  border-color: color-mix(in srgb, #2e7d32 55%, var(--line, var(--field-border)));
  background: color-mix(in srgb, #2e7d32 10%, var(--card));
}

.provider-status {
  font-weight: 600;
}

.provider-detail {
  word-break: break-word;
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
