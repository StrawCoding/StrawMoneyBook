<template>
  <div class="app-shell" :class="{ booting: isBooting, 'welcome-mode': showGuidedFlow }">
    <header v-if="!isBooting && !showGuidedFlow" class="top-bar">
      <div class="title-wrap">
        <img class="brand-logo" :src="BRAND_LOGO_URL" alt="StrawMoneyBook logo" />
        <div class="brand-text">
          <h1>StrawMoneyBook</h1>
        </div>
      </div>
    </header>

    <main class="page-container" :class="{ booting: isBooting, 'welcome-mode': showGuidedFlow }">
      <transition name="boot-overlay" appear>
        <section v-if="isBooting" class="boot-layer card">
          <img class="boot-logo" :src="BRAND_LOGO_URL" alt="StrawMoneyBook logo" />
          <p class="boot-title">StrawMoneyBook</p>
          <p class="boot-subtitle">{{ t('app.loading') }}</p>
          <div class="boot-progress" aria-hidden="true" />
        </section>
      </transition>
      <template v-if="!isBooting">
        <WelcomePage v-if="showWelcomePage" />
        <router-view v-else v-slot="{ Component, route }">
          <div ref="routeStageRef" class="route-stage" :class="{ transitioning: routeTransitioning }">
            <transition
              name="route-fade"
              mode="out-in"
              @before-enter="handleRouteBeforeEnter"
              @before-leave="handleRouteBeforeLeave"
              @after-enter="handleRouteAfterEnter"
              @after-leave="handleRouteAfterLeave"
            >
              <component :is="Component" :key="resolveRouteTransitionKey(route)" />
            </transition>
          </div>
        </router-view>
      </template>
    </main>

    <transition name="fade-scale" appear>
      <BottomNav v-if="hasLedgers && !isBooting && !showGuidedFlow" />
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
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import BottomNav from '@/ui/components/layout/BottomNav.vue'
import ToastHost from '@/ui/components/common/ToastHost.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import { BRAND_LOGO_URL } from '@/ui/constants/brand-assets'
import WelcomePage from '@/ui/views/WelcomePage.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { shouldShowWelcomePage } from '@/ui/services/setup-flow.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { useAppShellRuntime } from '@/ui/composables/useAppShellRuntime'
import { isAppShellBooting } from '@/ui/composables/app-shell-runtime.helpers'

const route = useRoute()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()
const hasLedgers = computed(() => ledgerStore.ledgers.length > 0)
const hasAccounts = computed(() => accountStore.accounts.length > 0)
const isBooting = computed(() => isAppShellBooting({
  ledgerReady: ledgerStore.ready,
  hasLedgers: hasLedgers.value,
  accountReady: accountStore.ready,
}))
const allowWithoutSetup = computed(() => Boolean(route.meta?.allowWithoutSetup))
const showWelcomePage = computed(() => shouldShowWelcomePage({
  ready: ledgerStore.ready,
  allowWithoutSetup: allowWithoutSetup.value,
  hasLedgers: hasLedgers.value,
  hasAccounts: hasAccounts.value,
  routeName: route.name,
}))
const showGuidedFlow = computed(() => showWelcomePage.value || route.name === 'post-setup-intro')
const {
  routeStageRef,
  routeTransitioning,
  updateDialogOpen,
  updateDialogMessage,
  closeUpdateDialog,
  openUpdateInGooglePlay,
  securityLocked,
  securityUnlocking,
  requestSecurityUnlock,
  handleRouteBeforeEnter,
  handleRouteBeforeLeave,
  handleRouteAfterEnter,
  handleRouteAfterLeave,
  resolveRouteTransitionKey,
} = useAppShellRuntime({ t, uiStore })
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
.route-stage {
  position: relative;
  width: 100%;
  min-height: 0;
}
.route-stage.transitioning {
  overflow: clip;
}
.route-fade-enter-active,
.route-fade-leave-active {
  transition:
    opacity 220ms var(--anim-standard),
    transform 260ms var(--anim-spring);
  will-change: opacity, transform;
  backface-visibility: hidden;
  transform-origin: top center;
}
.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
.route-fade-enter-from {
  transform: translate3d(0, 12px, 0) scale(0.994);
}
.route-fade-leave-to {
  transform: translate3d(0, -8px, 0) scale(0.998);
}
.route-fade-leave-active {
  pointer-events: none;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px
}
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent)
}
.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.menu-btn {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  color: var(--text-soft);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--btn-bg);
  font-size: 15px;
  transition: all var(--anim-fast) var(--anim-standard);
}
.menu-btn:active {
  transform: scale(0.93);
  background: var(--surface-highlight);
  color: var(--primary);
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
  will-change: transform, opacity;
}
.boot-logo {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  animation: boot-logo-float 1900ms var(--anim-standard) infinite;
  will-change: transform;
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
  animation: boot-progress 1250ms linear infinite;
  will-change: transform;
}
.boot-overlay-enter-active,
.boot-overlay-leave-active {
  transition: opacity var(--anim-mid) ease, transform var(--anim-mid) var(--anim-spring);
  will-change: opacity, transform;
  backface-visibility: hidden;
}
.boot-overlay-enter-from,
.boot-overlay-leave-to {
  opacity: 0;
  transform: translate3d(0, 6px, 0) scale(0.995);
}
@keyframes boot-logo-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -4px, 0);
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
