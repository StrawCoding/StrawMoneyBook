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

    <main class="page-container" :class="{ booting: isBooting, 'welcome-mode': showWelcomePage }">
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
          <transition name="route-slide" mode="out-in" appear>
            <component :is="Component" :key="route.fullPath" />
          </transition>
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
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import BottomNav from '@/ui/components/layout/BottomNav.vue'
import ToastHost from '@/ui/components/common/ToastHost.vue'
import AppDialog from '@/ui/components/common/AppDialog.vue'
import WelcomePage from '@/ui/views/WelcomePage.vue'
import { useI18n } from '@/ui/services/i18n.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { checkForAppUpdate, openGooglePlayStore } from '@/ui/services/app-update.service'

const route = useRoute()
const ledgerStore = useLedgerStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const { t } = useI18n()
const hasLedgers = computed(() => ledgerStore.ledgers.length > 0)
const hasAccounts = computed(() => accountStore.accounts.length > 0)
const isBooting = computed(() => !ledgerStore.ready)
const showWelcomePage = computed(() => ledgerStore.ready && (!hasLedgers.value || !hasAccounts.value))
const updateDialogOpen = ref(false)
const updateInfo = ref({
  hasUpdate: false,
  currentVersion: '',
  latestVersion: '',
  playUrl: '',
  message: '',
})
const promptedVersionSet = new Set()
let updateChecking = false

const updateDialogMessage = computed(() => {
  if (!updateInfo.value.latestVersion) return t('app_update.message_no_version')
  const summary = t('app_update.message', {
    latest: updateInfo.value.latestVersion,
    current: updateInfo.value.currentVersion || '-',
  })
  const note = String(updateInfo.value.message ?? '').trim()
  return note ? `${summary}\n${note}` : summary
})

function closeUpdateDialog() {
  updateDialogOpen.value = false
}

function openUpdateInGooglePlay() {
  const opened = openGooglePlayStore(updateInfo.value.playUrl)
  if (!opened) {
    uiStore.pushToast('無法開啟 Google Play 連結', 'error')
  }
  updateDialogOpen.value = false
}

async function checkAppUpdate(options = {}) {
  if (updateChecking) return
  updateChecking = true
  try {
    const result = await checkForAppUpdate(options)
    updateInfo.value = result
    if (!result.hasUpdate || !result.latestVersion) return
    if (promptedVersionSet.has(result.latestVersion)) return
    promptedVersionSet.add(result.latestVersion)
    updateDialogOpen.value = true
  } finally {
    updateChecking = false
  }
}

function onRequestCheckAppUpdate() {
  void checkAppUpdate()
}

onMounted(() => {
  window.addEventListener('app:check-update', onRequestCheckAppUpdate)
  void checkAppUpdate({ force: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('app:check-update', onRequestCheckAppUpdate)
})
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
</style>
