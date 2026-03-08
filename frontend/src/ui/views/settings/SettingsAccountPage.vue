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

      <article v-if="!sessionUser" class="card panel">
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
        <article class="card panel">
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
                :disabled="profileSaving || apiUnavailable"
              />
            </label>

            <label class="field">
              {{ t('settings_account.avatar_url', '頭貼網址') }}
              <input
                v-model.trim="profileForm.avatarUrl"
                class="input"
                type="url"
                :placeholder="t('settings_account.avatar_url_placeholder', '可留空，則使用預設頭像')"
                :disabled="profileSaving || apiUnavailable"
              />
            </label>
          </div>

          <div class="action-row">
            <button class="btn primary" :disabled="profileSaving || apiUnavailable || !canSaveProfile" @click="saveProfile">
              {{ profileSaving ? t('settings_account.saving', '儲存中...') : t('common.save') }}
            </button>
            <button class="btn" :disabled="loggingOut || apiUnavailable" @click="handleLogout">
              {{ loggingOut ? t('settings_account.logging_out', '登出中...') : t('settings_account.logout', '登出') }}
            </button>
          </div>
        </article>

        <article class="card panel">
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/ui/services/i18n.service'
import { useUiStore } from '@/ui/stores/ui.store'
import { getMembershipTierSnapshot } from '@/core/services/membership.service'
import {
  getReferralSummary,
  getSharedLedgerApiUnavailableMessage,
  getSharedLedgerSession,
  isSharedLedgerApiConfigured,
  loginSharedLedgerAccount,
  logoutSharedLedgerAccount,
  redeemReferralCode,
  refreshSharedLedgerSession,
  registerSharedLedgerAccount,
  subscribeSharedLedgerSession,
  updateSharedLedgerProfile,
} from '@/services/shared-ledger/backend'

const uiStore = useUiStore()
const { t } = useI18n()

const apiUnavailable = computed(() => !isSharedLedgerApiConfigured())
const apiUnavailableMessage = computed(() => getSharedLedgerApiUnavailableMessage())
const authMode = ref('login')
const authSubmitting = ref(false)
const profileSaving = ref(false)
const loggingOut = ref(false)
const referralSubmitting = ref(false)
const sessionUser = ref(getSharedLedgerSession()?.user ?? null)
const referralSummary = ref(null)
const redeemCodeInput = ref('')
const authForm = ref({
  email: '',
  displayName: '',
  password: '',
})
const profileForm = ref({
  displayName: '',
  avatarUrl: '',
})

const canSubmitAuth = computed(() => {
  if (!authForm.value.email || !authForm.value.password) return false
  if (authMode.value === 'register' && !authForm.value.displayName) return false
  return true
})

const canSaveProfile = computed(() => {
  if (!sessionUser.value) return false
  return (
    String(profileForm.value.displayName ?? '').trim() !== String(sessionUser.value.display_name ?? '').trim()
    || String(profileForm.value.avatarUrl ?? '').trim() !== String(sessionUser.value.avatar_url ?? '').trim()
  )
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

async function loadReferralSummary() {
  if (!sessionUser.value || apiUnavailable.value) {
    referralSummary.value = null
    return
  }
  try {
    const result = await getReferralSummary()
    referralSummary.value = result.summary ?? null
    sessionUser.value = result.user ?? sessionUser.value
    syncProfileFormFromSession()
  } catch (error) {
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
  await loadReferralSummary()
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
    syncProfileFormFromSession()
    await loadReferralSummary()
    uiStore.pushToast(
      authMode.value === 'login'
        ? t('settings_account.toast.login_done', '登入成功')
        : t('settings_account.toast.register_done', '註冊成功'),
    )
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.auth_failed', '登入失敗'), 'error')
  } finally {
    authSubmitting.value = false
  }
}

async function saveProfile() {
  if (!canSaveProfile.value || apiUnavailable.value) return
  profileSaving.value = true
  try {
    const result = await updateSharedLedgerProfile({
      displayName: profileForm.value.displayName,
      avatarUrl: profileForm.value.avatarUrl,
    })
    sessionUser.value = result.user
    syncProfileFormFromSession()
    uiStore.pushToast(t('settings_account.toast.profile_saved', '帳號資料已更新'))
  } catch (error) {
    uiStore.pushToast(error.message || t('settings_account.toast.profile_failed', '更新帳號資料失敗'), 'error')
  } finally {
    profileSaving.value = false
  }
}

async function handleLogout() {
  loggingOut.value = true
  try {
    await logoutSharedLedgerAccount()
    sessionUser.value = null
    referralSummary.value = null
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
  })
  void refreshSession()
})

onUnmounted(() => {
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

.notice {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, #f44336 10%, var(--card));
}

.section-head,
.tab-row,
.action-row,
.join-row,
.referral-code-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.tab-btn {
  border: 1px solid var(--line, var(--field-border));
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 8px 14px;
  font: inherit;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--primary) 18%, var(--card));
  border-color: color-mix(in srgb, var(--primary) 50%, var(--line, var(--field-border)));
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

@media (max-width: 640px) {
  .section-head,
  .join-row,
  .referral-code-row,
  .profile-row {
    flex-direction: column;
    align-items: stretch;
  }

  .avatar-wrap {
    margin: 0 auto;
  }
}
</style>
