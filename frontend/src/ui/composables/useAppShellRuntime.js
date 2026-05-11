import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { flushDeferredScrollRestore } from '@/ui/services/route-scroll.service'
import { checkForAppUpdate, openGooglePlayStore } from '@/ui/services/app-update.service'
import { initGoogleAuth, getAccessToken } from '@/services/einvoice/auth'
import { canNavigateBackInApp } from '@/ui/services/navigation-back.service'
import {
  authenticateSecurityLock,
  getSecurityLockAvailability,
  setSecurityLockCurrentLocked,
  setSecurityLockEnabled,
  useSecurityLockEnabled,
} from '@/ui/services/security-lock.service'
import {
  buildAppUpdateDialogMessage,
  resolveElementHeight,
  resolveRouteTransitionKey,
  setRouteStageMinHeight,
} from './app-shell-runtime.helpers'

const SECURITY_UNLOCK_COOLDOWN_MS = 1200

export function useAppShellRuntime({ t, uiStore }) {
  const route = useRoute()
  const router = useRouter()
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
  const routeStageRef = ref(null)
  const routeTransitioning = ref(false)
  const securityLockEnabled = useSecurityLockEnabled()
  const securityLocked = ref(securityLockEnabled.value)
  const securityUnlocking = ref(false)
  const updateDialogMessage = computed(() => buildAppUpdateDialogMessage(updateInfo.value, t))

  let promptedCheckFailedFallback = false
  let updateChecking = false
  let securityStateListener = null
  let lastSecurityUnlockAt = 0
  let initialSecurityUnlockTimer = null

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

  function handleRouteBeforeEnter() {
    flushDeferredScrollRestore()
  }

  function handleRouteBeforeLeave(element) {
    routeTransitioning.value = true
    setRouteStageMinHeight(routeStageRef, resolveElementHeight(element))
  }

  function handleRouteAfterEnter(element) {
    setRouteStageMinHeight(routeStageRef, resolveElementHeight(element))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRouteStageMinHeight(routeStageRef, 0)
        routeTransitioning.value = false
      })
    })
  }

  function handleRouteAfterLeave() {
    if (!routeTransitioning.value) {
      setRouteStageMinHeight(routeStageRef, 0)
    }
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
      setSecurityLockCurrentLocked(false)
      return true
    }
    if (securityUnlocking.value) return false

    const availability = await getSecurityLockAvailability(t('settings_security.only_android'))
    if (!availability.available) {
      setSecurityLockEnabled(false)
      securityLocked.value = false
      setSecurityLockCurrentLocked(false)
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
      setSecurityLockCurrentLocked(false)
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
      setSecurityLockCurrentLocked(true)
      initialSecurityUnlockTimer = window.setTimeout(() => {
        initialSecurityUnlockTimer = null
        void requestSecurityUnlock('settings_security.unlock_prompt')
      }, 350)
    } else {
      setSecurityLockCurrentLocked(false)
    }
    if (Capacitor.getPlatform() === 'android') {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!securityLockEnabled.value) return
        if (!isActive) {
          securityLocked.value = true
          setSecurityLockCurrentLocked(true)
          return
        }
        if (Date.now() - lastSecurityUnlockAt < SECURITY_UNLOCK_COOLDOWN_MS) return
        void requestSecurityUnlock('settings_security.resume_prompt')
      }).then((handle) => {
        securityStateListener = handle
      })
    }
    ;(async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          await initGoogleAuth()
          try {
            await getAccessToken({ interactive: false })
          } catch {
            // Ignore non-interactive sign-in failures; user can login from settings.
          }
        }
      } catch (error) {
        console.warn('[app] background google silent login failed', error)
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
        setSecurityLockCurrentLocked(false)
        return
      }
      if (securityLocked.value) {
        setSecurityLockCurrentLocked(true)
      }
    },
  )

  watch(
    () => securityLocked.value,
    (locked) => {
      setSecurityLockCurrentLocked(locked)
    },
    { immediate: true },
  )

  return {
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
  }
}
