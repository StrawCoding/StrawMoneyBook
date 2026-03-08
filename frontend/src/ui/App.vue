<template>
  <div class="app-shell" :class="{ booting: isBooting, 'welcome-mode': showWelcomePage }">
    <header v-if="!isBooting && !showWelcomePage" class="top-bar">
      <div class="title-wrap">
        <img class="brand-logo" src="@/ui/assets/logo.png" alt="StrawMoneyBook logo" />
        <h1>StrawMoneyBook</h1>
      </div>
      <transition name="fade-scale">
        <RouterLink
          v-if="route.name === 'home' && hasLedgers"
          class="menu-btn"
          :aria-label="t('app.open_menu')"
          to="/features"
        >
          <font-awesome-icon icon="fa-solid fa-bars" />
        </RouterLink>
      </transition>
    </header>

    <main class="page-container" :class="{ booting: isBooting, 'welcome-mode': showWelcomePage }" :style="pageContainerStyle">
      <transition name="boot-overlay" appear>
        <section v-if="isBooting" class="boot-layer card">
          <img class="boot-logo" src="@/ui/assets/logo.png" alt="StrawMoneyBook logo" />
          <p class="boot-title">StrawMoneyBook</p>
          <p class="boot-subtitle">{{ t('app.loading') }}</p>
          <div class="boot-progress" aria-hidden="true" />
        </section>
      </transition>
      <template v-if="!isBooting">
        <WelcomePage v-if="showWelcomePage" />
        <router-view v-else v-slot="{ Component, route }">
          <transition v-if="!disableNextRouteTransition" name="route-slide" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
          <component v-else :is="Component" :key="route.fullPath" />
        </router-view>
      </template>
    </main>

    <transition name="fade-scale" appear>
      <BottomNav v-if="hasLedgers && !isBooting && !showWelcomePage" />
    </transition>
    <ToastHost />
    <AppDialog
      :open="updateDialogOpen"
      :title="t('app_update.title')"
      :message="updateDialogMessage"
      :cancel-text="t('app_update.later')"
      :confirm-text="t('app_update.google_play')"
      @close="closeUpdateDialog"
      @confirm="openUpdateInGooglePlay"
    />
    <transition name="overlay-fade">
      <section v-if="securityLocked" class="security-mask" @click.self="requestSecurityUnlock('settings_security.unlock_prompt')">
        <article class="card security-panel">
          <div class="security-icon">
            <font-awesome-icon icon="fa-solid fa-shield-halved" />
          </div>
          <h3>{{ t('settings_security.locked_title') }}</h3>
          <p class="muted security-message">{{ t('settings_security.locked_description') }}</p>
          <button class="btn primary" :disabled="securityUnlocking" @click="requestSecurityUnlock('settings_security.unlock_prompt')">
            {{ securityUnlocking ? t('settings_security.unlocking') : t('settings_security.unlock_now') }}
          </button>
        </article>
      </section>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import BottomNav from '@/ui/components/layout/BottomNav.vue'
import ToastHost from '@/ui/components/common/ToastHost.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import WelcomePage from '@/ui/views/WelcomePage.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { checkForAppUpdate, openGooglePlayStore } from '@/ui/services/app-update.service'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { initGoogleAuth, getAccessToken } from '@/services/google/auth'
import { canNavigateBackInApp } from '@/ui/services/navigation-back.service'
import { disableNextRouteTransition, routeRestoreMinHeight } from '@/ui/router'
import {
  authenticateSecurityLock,
  getSecurityLockAvailability,
  setSecurityLockEnabled,
  useSecurityLockEnabled,
} from '@/ui/services/security-lock.service'

const route = useRoute()
const router = useRouter()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()
const hasLedgers = computed(() => ledgerStore.ledgers.length > 0)
const hasAccounts = computed(() => accountStore.accounts.length > 0)
const isBooting = computed(() => !ledgerStore.ready)
const showWelcomePage = computed(() => ledgerStore.ready && (!hasLedgers.value || !hasAccounts.value))
const pageContainerStyle = computed(() => {
  const minHeight = Number(routeRestoreMinHeight.value ?? 0) || 0
  if (minHeight <= 0) return null
  return {
    minHeight: `${minHeight}px`,
  }
})
const updateDialogOpen = ref(false)
const updateInfo = ref({
  hasUpdate: false,
  checkFailed: false,
  currentVersion: '',
  latestVersion: '',
  playUrl: '',
  message: '',
})
const promptedVersionSet = new Set()
let promptedCheckFailedFallback = false
let updateChecking = false
const securityLockEnabled = useSecurityLockEnabled()
const securityLocked = ref(securityLockEnabled.value)
const securityUnlocking = ref(false)
let securityStateListener = null
let lastSecurityUnlockAt = 0
const SECURITY_UNLOCK_COOLDOWN_MS = 1200
let initialSecurityUnlockTimer = null

const updateDialogMessage = computed(() => {
  if (updateInfo.value.checkFailed) {
    const detail = String(updateInfo.value.message ?? '').trim()
    return detail
      ? `${t('app_update.check_failed_prompt')}\n${detail}`
      : t('app_update.check_failed_prompt')
  }
  const summary = t('app_update.message_no_version')
  const note = String(updateInfo.value.message ?? '').trim()
  return note ? `${summary}\n${note}` : summary
})

function closeUpdateDialog() {
  updateDialogOpen.value = false
}

function openUpdateInGooglePlay() {
  const opened = openGooglePlayStore(updateInfo.value.playUrl)
  if (!opened) {
    uiStore.pushToast(t('settings_version.toast.open_play_failed'), 'error')
  }
  updateDialogOpen.value = false
}

async function checkAppUpdate(options = {}) {
  if (updateChecking) return
  updateChecking = true
  try {
    const result = await checkForAppUpdate(options)
    updateInfo.value = result
    if (result.hasUpdate) {
      const updateKey = String(result.latestVersion ?? '').trim() || 'update_available'
      if (!promptedVersionSet.has(updateKey)) {
        promptedVersionSet.add(updateKey)
        updateDialogOpen.value = true
      }
      return
    }
    if (result.checkFailed && !promptedCheckFailedFallback) {
      promptedCheckFailedFallback = true
      updateDialogOpen.value = true
    }
  } finally {
    updateChecking = false
  }
}

function onRequestCheckAppUpdate() {
  void checkAppUpdate({ force: true })
}

function resolveBackButtonAnchor(event) {
  if (event.defaultPrevented) return null
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('a.back-btn')
}

function onBackButtonAnchorClick(event) {
  const anchor = resolveBackButtonAnchor(event)
  if (!anchor) return
  if (!canNavigateBackInApp(route.fullPath)) return
  event.preventDefault()
  void router.back()
}

function onRequestCloseOverlay(event) {
  if (!securityLocked.value) return
  event.preventDefault()
}

async function requestSecurityUnlock(reasonKey = 'settings_security.unlock_prompt') {
  if (!securityLockEnabled.value) {
    securityLocked.value = false
    return true
  }
  if (securityUnlocking.value) return false

  const availability = await getSecurityLockAvailability(t('settings_security.only_android'))
  if (!availability.available) {
    setSecurityLockEnabled(false)
    securityLocked.value = false
    uiStore.pushToast(
      t('settings_security.toast.auto_disabled', {
        reason: availability.message || t('settings_security.toast.not_supported'),
      }),
      'error',
    )
    return false
  }

  securityLocked.value = true
  securityUnlocking.value = true
  try {
    await authenticateSecurityLock({
      title: t('settings_security.title'),
      reason: t(reasonKey),
      unsupportedMessage: t('settings_security.toast.not_supported'),
      failureMessage: t('settings_security.toast.unlock_failed'),
    })
    securityLocked.value = false
    lastSecurityUnlockAt = Date.now()
    return true
  } catch (error) {
    if (String(error?.code ?? '') !== 'auth_canceled') {
      uiStore.pushToast(error?.message || t('settings_security.toast.unlock_failed'), 'error')
    }
    return false
  } finally {
    securityUnlocking.value = false
  }
}

onMounted(() => {
  window.addEventListener('app:check-update', onRequestCheckAppUpdate)
  window.addEventListener('click', onBackButtonAnchorClick, true)
  window.addEventListener('app:request-close-overlay', onRequestCloseOverlay)
  void checkAppUpdate({ force: true })
  if (securityLockEnabled.value) {
    initialSecurityUnlockTimer = window.setTimeout(() => {
      initialSecurityUnlockTimer = null
      void requestSecurityUnlock('settings_security.unlock_prompt')
    }, 350)
  }
  if (Capacitor.getPlatform() === 'android') {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!securityLockEnabled.value) return
      if (!isActive) {
        securityLocked.value = true
        return
      }
      if (Date.now() - lastSecurityUnlockAt < SECURITY_UNLOCK_COOLDOWN_MS) return
      void requestSecurityUnlock('settings_security.resume_prompt')
    }).then((handle) => {
      securityStateListener = handle
    })
  }
  // 嘗試在背景進行非互動式 Google 登入（僅在 native 平台）
  ;(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await initGoogleAuth()
        try {
          await getAccessToken({ interactive: false })
        } catch (e) {
          // 非互動式登入失敗則不提示，用戶仍可在設定頁手動登入
        }
      }
    } catch (err) {
      // 初始化或登入錯誤不應影響主流程
      console.warn('[app] background google silent login failed', err)
    }
  })()
})

onBeforeUnmount(() => {
  window.removeEventListener('app:check-update', onRequestCheckAppUpdate)
  window.removeEventListener('click', onBackButtonAnchorClick, true)
  window.removeEventListener('app:request-close-overlay', onRequestCloseOverlay)
  if (initialSecurityUnlockTimer !== null) {
    window.clearTimeout(initialSecurityUnlockTimer)
    initialSecurityUnlockTimer = null
  }
  securityStateListener?.remove?.()
})

watch(
  () => securityLockEnabled.value,
  (enabled) => {
    if (!enabled) {
      securityLocked.value = false
    }
  },
)
</script>

<style scoped>.app-shell {
  padding-top: calc(10px + var(--status-bar-height))
}
.app-shell.booting {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding-top: 0;
  padding-bottom: 0;
}
.app-shell.welcome-mode {
  height: 100dvh;
  overflow: hidden;
  padding-bottom: 0;
}
.page-container.booting {
  width: min(560px, calc(100vw - 24px));
}
.page-container.welcome-mode {
  width: 100%;
  height: 100%;
  display: grid;
  align-items: center;
  overflow: hidden;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px
}
.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px
}
.menu-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border);
  color: var(--text);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-soft-accent)
}
.boot-layer {
  min-height: clamp(260px, 54vh, 440px);
  display: grid;
  place-items: center;
  place-content: center;
  gap: 10px;
  border: 1px solid var(--field-border);
  background:
    radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 48%),
    radial-gradient(circle at 80% 0%, color-mix(in srgb, var(--ok) 22%, transparent), transparent 44%),
    var(--card);
}
.boot-logo {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  animation: boot-logo-float 1500ms ease-in-out infinite
}
.boot-title {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.02em
}
.boot-subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 14px
}
.boot-progress {
  width: min(240px, 70vw);
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 24%, transparent);
  overflow: hidden;
  position: relative
}
.boot-progress::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, var(--primary) 42%, transparent 85%);
  transform: translateX(-100%);
  animation: boot-progress 1100ms linear infinite
}
.boot-overlay-enter-active,
.boot-overlay-leave-active {
  transition: opacity var(--anim-mid) ease, transform var(--anim-mid) var(--anim-spring);
}
.boot-overlay-enter-from,
.boot-overlay-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.99);
}
@keyframes boot-logo-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes boot-progress {
  to {
    transform: translateX(100%);
  }
}
.security-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg) 82%, black), color-mix(in srgb, var(--bg-soft) 88%, black)),
    var(--overlay-backdrop);
}
.security-panel {
  width: min(420px, 100%);
  padding: 20px;
  display: grid;
  gap: 12px;
  text-align: center;
}
.security-panel h3 {
  margin: 0;
}
.security-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-size: 22px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
}
.security-message {
  margin: 0;
  white-space: pre-line;
}
</style>
