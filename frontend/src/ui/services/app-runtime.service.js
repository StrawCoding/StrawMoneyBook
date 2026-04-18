import { watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { ensureWebSqliteStoreReady } from '@/core/db/web-store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useUiStore } from '@/ui/stores/ui.store'
import {
  autoConnectGoogleBackup,
  runGoogleAutoBackupIfDue,
  runGoogleAutoBackupOnDataChange,
} from '@/ui/services/google-backup.service'
import { runWebdavAutoBackupIfDue, runWebdavAutoBackupOnDataChange } from '@/ui/services/webdav-backup.service'
import { isBankSyncFeatureEnabled } from '@/services/bank-sync/backend'
import { runBankSyncAutoRefreshIfDue } from '@/ui/services/bank-sync-auto-refresh.service'
import { runExchangeRateAutoSyncIfDue } from '@/ui/services/exchange-rate.service'
import { clearHomeWidgetSummary, syncHomeWidgetSummary } from '@/ui/services/home-widget.service'
import { runBudgetSaveIfDue } from '@/core/services/budget-save.service'
import { warmupMembershipRuntime } from '@/core/services/membership.service'
import { runSavingsJarAutoSaveIfDue } from '@/core/services/savings-jar-auto-save.service'
import { syncBookkeepingRemindersForAllLedgers } from '@/ui/services/bookkeeping-reminder.service'
import { loadThemeColor } from '@/ui/services/theme.service'
import { initLocalePreference, translateMessage } from '@/ui/services/i18n.service'
import { getPreferredBookkeepingPath } from '@/ui/services/bookkeeping-mode.service'
import { resolveRouteFromAppUrl as resolveAppUrlRoute } from '@/ui/services/app-url-route'
import { canNavigateBackInApp, resolveBackFallback, shouldConfirmExit } from '@/ui/services/navigation-back.service'
import { extractSharedLedgerInviteCode, restoreSharedLedgerSession } from '@/services/shared-ledger/backend'
import {
  initSharedLedgerBackgroundSync,
  runSharedLedgerBackgroundSyncNow,
  scheduleActiveSharedLedgerAutoSync,
} from '@/ui/services/shared-ledger.service'
import {
  initGoogleDriveLedgerSync,
  runGoogleDriveLedgerBackgroundSyncNow,
  scheduleActiveGoogleDriveLedgerSync,
} from '@/ui/services/google-drive-ledger-sync.service'
import { resolveAndroidBackDecision } from './app-runtime.helpers'

const DATA_CHANGE_BACKUP_DEBOUNCE_MS = 15000
const AUTO_BACKUP_DUE_CHECK_MS = 5 * 60 * 1000
const BACK_EXIT_CONFIRM_WINDOW_MS = 1600

export function initializeAppEnvironment() {
  loadThemeColor()
  initLocalePreference()
}

export function resolveAndroidBackAction({
  currentPath,
  lastBackPressedAt = 0,
  now = Date.now(),
  confirmWindowMs = BACK_EXIT_CONFIRM_WINDOW_MS,
}) {
  return resolveAndroidBackDecision({
    currentPath,
    lastBackPressedAt,
    now,
    confirmWindowMs,
    canNavigateBack: canNavigateBackInApp,
    resolveFallback: resolveBackFallback,
    shouldConfirmExit,
  })
}

function createRuntimeState() {
  return {
    dataChangeBackupTimer: null,
    dataChangeBackupRunning: false,
    autoBackupDueTimer: null,
    lastAndroidBackPressedAt: 0,
    homeWidgetSyncTimer: null,
    hasTriedInteractiveGoogleAutoConnect: false,
  }
}

function triggerBankAutoRefresh(pinia, ledgerId, reason) {
  if (!isBankSyncFeatureEnabled()) return
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  void runBankSyncAutoRefreshIfDue(normalizedLedgerId, { reason })
    .then((result) => {
      if (result?.halted === 'auth_error' && result?.message) {
        useUiStore(pinia).pushToast(
          translateMessage(
            'settings_bank_sync.toast.auto_sync_disabled_auth_error',
            { message: result.message },
            '銀行自動同步已停止：{message}',
          ),
          'error',
        )
      }
    })
    .catch((error) => {
      console.warn('[bank-sync] auto refresh dispatcher failed', {
        ledgerId: normalizedLedgerId,
        reason,
        error,
      })
    })
}

function runBookkeepingReminderSyncInBackground(reason) {
  void syncBookkeepingRemindersForAllLedgers().catch((error) => {
    console.warn(`[bookkeeping-reminder] background sync failed (${reason})`, error)
  })
}

function clearAutoBackupDueTimer(runtimeState, windowObject = globalThis.window) {
  if (!windowObject) return
  if (runtimeState.autoBackupDueTimer != null) {
    windowObject.clearTimeout(runtimeState.autoBackupDueTimer)
    runtimeState.autoBackupDueTimer = null
  }
}

function scheduleHomeWidgetSync(runtimeState, pinia, windowObject = globalThis.window, delayMs = 1200) {
  if (!windowObject) return
  if (runtimeState.homeWidgetSyncTimer != null) {
    windowObject.clearTimeout(runtimeState.homeWidgetSyncTimer)
  }
  runtimeState.homeWidgetSyncTimer = windowObject.setTimeout(() => {
    runtimeState.homeWidgetSyncTimer = null
    void syncActiveLedgerHomeWidget(pinia)
  }, Math.max(0, Number(delayMs) || 0))
}

function scheduleAutoBackupDueCheck(runtimeState, pinia, windowObject = globalThis.window, delayMs = AUTO_BACKUP_DUE_CHECK_MS) {
  if (!windowObject) return
  clearAutoBackupDueTimer(runtimeState, windowObject)
  runtimeState.autoBackupDueTimer = windowObject.setTimeout(() => {
    runtimeState.autoBackupDueTimer = null
    void runAutoBackupDueCheck(runtimeState, pinia, windowObject, 'scheduled_due_check')
  }, Math.max(0, Number(delayMs) || 0))
}

async function runAutoBackupDueCheck(runtimeState, pinia, windowObject, reason = 'scheduled_due_check') {
  const ledgerStore = useLedgerStore(pinia)
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    clearAutoBackupDueTimer(runtimeState, windowObject)
    return { skipped: true, reason: 'missing_ledger' }
  }

  try {
    const [googleResult, webdavResult] = await Promise.allSettled([
      runGoogleAutoBackupIfDue(ledgerId),
      runWebdavAutoBackupIfDue(ledgerId),
    ])
    return {
      skipped: false,
      reason,
      googleResult,
      webdavResult,
    }
  } finally {
    scheduleAutoBackupDueCheck(runtimeState, pinia, windowObject)
  }
}

async function syncActiveLedgerHomeWidget(pinia) {
  const ledgerStore = useLedgerStore(pinia)
  const activeLedger = ledgerStore.activeLedger
  if (!activeLedger?.id) {
    await clearHomeWidgetSummary()
    return
  }
  await syncHomeWidgetSummary(activeLedger.id, {
    currencyCode: activeLedger.currency_code,
    ledgerName: activeLedger.name,
  })
}

function resolveRouteFromAppUrl(rawUrl) {
  return resolveAppUrlRoute(rawUrl, {
    extractSharedLedgerInviteCode,
    getPreferredBookkeepingPath,
  })
}

async function handleAppUrlOpen(router, rawUrl) {
  const target = resolveRouteFromAppUrl(rawUrl)
  if (!target) return
  await router.push(target).catch(() => {})
}

function scheduleAutoBackupOnDataChange(runtimeState, pinia, windowObject = globalThis.window) {
  if (!windowObject) return
  if (runtimeState.dataChangeBackupTimer != null) {
    windowObject.clearTimeout(runtimeState.dataChangeBackupTimer)
  }
  runtimeState.dataChangeBackupTimer = windowObject.setTimeout(() => {
    runtimeState.dataChangeBackupTimer = null
    if (runtimeState.dataChangeBackupRunning) return
    runtimeState.dataChangeBackupRunning = true
    const ledgerStore = useLedgerStore(pinia)
    const ledgerId = ledgerStore.activeLedgerId
    if (!ledgerId) {
      runtimeState.dataChangeBackupRunning = false
      return
    }
    Promise.allSettled([runGoogleAutoBackupOnDataChange(ledgerId), runWebdavAutoBackupOnDataChange(ledgerId)])
      .finally(() => {
        runtimeState.dataChangeBackupRunning = false
      })
  }, DATA_CHANGE_BACKUP_DEBOUNCE_MS)
}

export async function initSqliteWebStoreWithTimeout(timeoutMs = 6000) {
  let timeoutId = null
  try {
    await Promise.race([
      ensureWebSqliteStoreReady(),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`[sqlite] init timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId)
    }
  }
}

function scheduleMembershipWarmup(reason, windowObject = globalThis.window) {
  const run = () => {
    void warmupMembershipRuntime(reason).catch((error) => {
      console.warn(`[membership] warmup failed (${reason})`, error)
    })
  }

  if (windowObject && typeof windowObject.requestIdleCallback === 'function') {
    windowObject.requestIdleCallback(() => {
      run()
    }, { timeout: 800 })
    return
  }

  if (windowObject) {
    windowObject.setTimeout(run, 0)
    return
  }

  run()
}

function androidExitHintMessage() {
  return translateMessage('app.exit_again', '再按一次返回鍵離開 App')
}

function restoreGoogleBackupSessionInBackground(runtimeState, ledgerId, { allowInteractive = false } = {}) {
  if (!ledgerId) return
  const shouldAllowInteractive = Boolean(allowInteractive) && !runtimeState.hasTriedInteractiveGoogleAutoConnect
  if (shouldAllowInteractive) {
    runtimeState.hasTriedInteractiveGoogleAutoConnect = true
  }
  return autoConnectGoogleBackup(ledgerId, {
    allowInteractive: shouldAllowInteractive,
    allowInteractiveWhenGoogleLinked: shouldAllowInteractive,
  }).catch((error) => {
    console.warn('[google-backup] auto sign-in restore failed', error)
    return null
  })
}

function restoreGoogleBackupForActiveLedgerInBackground(runtimeState, ledgerId, { runDueBackup = false, allowInteractive = false } = {}) {
  if (!ledgerId) return
  void (async () => {
    const restoredState = await restoreGoogleBackupSessionInBackground(runtimeState, ledgerId, { allowInteractive })
    if (!runDueBackup || !restoredState?.connected) return
    void runGoogleAutoBackupIfDue(ledgerId)
  })()
}

function restoreSharedLedgerSessionInBackground(reason, { force = false } = {}) {
  void restoreSharedLedgerSession({ force }).catch((error) => {
    const code = String(error?.code ?? '').trim()
    if (code === 'shared_ledger_api_unavailable') {
      return null
    }
    console.warn(`[shared-ledger] session restore failed (${reason})`, error)
    return null
  })
}

function runSavingsJarAutoSaveInBackground(ledgerId, reason) {
  if (!ledgerId) return
  void runSavingsJarAutoSaveIfDue(ledgerId, { reason }).catch((error) => {
    console.warn(`[savings-jar-auto-save] run failed (${reason})`, error)
  })
}

function runBudgetSaveInBackground(ledgerId, reason) {
  if (!ledgerId) return
  void runBudgetSaveIfDue(ledgerId, { reason }).catch((error) => {
    console.warn(`[budget-save] run failed (${reason})`, error)
  })
}

export function installAppRuntime({ pinia, router, windowObject = globalThis.window } = {}) {
  const runtimeState = createRuntimeState()
  const listenerHandles = []
  const removeFns = []
  const ledgerStore = useLedgerStore(pinia)

  function addWindowListener(type, handler, options) {
    if (!windowObject?.addEventListener) return
    windowObject.addEventListener(type, handler, options)
    removeFns.push(() => {
      windowObject.removeEventListener(type, handler, options)
    })
  }

  if (Capacitor.getPlatform() === 'android') {
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void handleAppUrlOpen(router, url)
    }).then((handle) => listenerHandles.push(handle))

    void CapacitorApp.getLaunchUrl().then((result) => {
      const launchUrl = String(result?.url ?? '').trim()
      if (!launchUrl) return
      void handleAppUrlOpen(router, launchUrl)
    }).catch((error) => {
      console.warn('[app-url] getLaunchUrl failed', error)
    })

    void CapacitorApp.addListener('backButton', async () => {
      const overlayCloseEvent = new Event('app:request-close-overlay', { cancelable: true })
      windowObject?.dispatchEvent?.(overlayCloseEvent)
      if (overlayCloseEvent.defaultPrevented) {
        return
      }

      const decision = resolveAndroidBackAction({
        currentPath: String(router.currentRoute.value.path ?? '/'),
        lastBackPressedAt: runtimeState.lastAndroidBackPressedAt,
      })

      if (decision.type === 'back') {
        await router.back()
        return
      }

      if (decision.type === 'replace') {
        await router.replace(decision.path)
        return
      }

      if (decision.type === 'confirm_exit') {
        runtimeState.lastAndroidBackPressedAt = Number(decision.nextLastBackPressedAt ?? Date.now())
        useUiStore(pinia).pushToast(androidExitHintMessage(), 'info')
        return
      }

      await CapacitorApp.exitApp()
    }).then((handle) => listenerHandles.push(handle))

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      restoreSharedLedgerSessionInBackground('app_resume')
      scheduleMembershipWarmup('app_resume', windowObject)
      runBookkeepingReminderSyncInBackground('app_resume')
      windowObject?.dispatchEvent?.(new Event('app:check-update'))
      const currentLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
      if (currentLedgerId) {
        restoreGoogleBackupForActiveLedgerInBackground(runtimeState, currentLedgerId, { runDueBackup: true })
        void runExchangeRateAutoSyncIfDue(currentLedgerId)
        triggerBankAutoRefresh(pinia, currentLedgerId, 'app_resume')
        runSavingsJarAutoSaveInBackground(currentLedgerId, 'app_resume')
        runBudgetSaveInBackground(currentLedgerId, 'app_resume')
        scheduleAutoBackupDueCheck(runtimeState, pinia, windowObject)
      }
      void runSharedLedgerBackgroundSyncNow(pinia)
      void runGoogleDriveLedgerBackgroundSyncNow(pinia)
      void syncActiveLedgerHomeWidget(pinia)
    }).then((handle) => listenerHandles.push(handle))
  }

  restoreSharedLedgerSessionInBackground('app_start', { force: true })
  initSharedLedgerBackgroundSync(pinia)
  initGoogleDriveLedgerSync(pinia)

  addWindowListener('app:data-mutated', () => {
    scheduleAutoBackupOnDataChange(runtimeState, pinia, windowObject)
    scheduleAutoBackupDueCheck(runtimeState, pinia, windowObject, 30000)
    scheduleHomeWidgetSync(runtimeState, pinia, windowObject)
    scheduleActiveSharedLedgerAutoSync(pinia)
    scheduleActiveGoogleDriveLedgerSync(pinia)
  })

  addWindowListener('app:auto-backup-config-updated', () => {
    void runAutoBackupDueCheck(runtimeState, pinia, windowObject, 'config_updated')
  })

  addWindowListener('focus', () => {
    restoreSharedLedgerSessionInBackground('window_focus')
    void runGoogleDriveLedgerBackgroundSyncNow(pinia)
  })

  scheduleMembershipWarmup('app_start', windowObject)
  runBookkeepingReminderSyncInBackground('app_start')
  if (ledgerStore.activeLedgerId) {
    runSavingsJarAutoSaveInBackground(ledgerStore.activeLedgerId, 'app_start')
    runBudgetSaveInBackground(ledgerStore.activeLedgerId, 'app_start')
  }

  const stopLedgerWatcher = watch(
    () => ledgerStore.activeLedgerId,
    (ledgerId) => {
      const normalizedLedgerId = String(ledgerId ?? '').trim()
      if (!normalizedLedgerId) {
        clearAutoBackupDueTimer(runtimeState, windowObject)
        return
      }
      restoreGoogleBackupForActiveLedgerInBackground(runtimeState, normalizedLedgerId, {
        runDueBackup: true,
        allowInteractive: true,
      })
      void runWebdavAutoBackupIfDue(normalizedLedgerId)
      scheduleAutoBackupDueCheck(runtimeState, pinia, windowObject)
      void runExchangeRateAutoSyncIfDue(normalizedLedgerId)
      triggerBankAutoRefresh(pinia, normalizedLedgerId, 'active_ledger_change')
      runSavingsJarAutoSaveInBackground(normalizedLedgerId, 'active_ledger_change')
      runBudgetSaveInBackground(normalizedLedgerId, 'active_ledger_change')
    },
    { immediate: true },
  )
  removeFns.push(stopLedgerWatcher)

  const stopWidgetWatcher = watch(
    () => `${ledgerStore.activeLedgerId}:${String(ledgerStore.activeLedger?.currency_code ?? '')}`,
    () => {
      void syncActiveLedgerHomeWidget(pinia)
    },
    { immediate: true },
  )
  removeFns.push(stopWidgetWatcher)

  windowObject?.dispatchEvent?.(new Event('app:check-update'))

  return {
    dispose() {
      clearAutoBackupDueTimer(runtimeState, windowObject)
      if (windowObject && runtimeState.dataChangeBackupTimer != null) {
        windowObject.clearTimeout(runtimeState.dataChangeBackupTimer)
      }
      if (windowObject && runtimeState.homeWidgetSyncTimer != null) {
        windowObject.clearTimeout(runtimeState.homeWidgetSyncTimer)
      }
      for (const remove of removeFns) {
        remove()
      }
      for (const handle of listenerHandles) {
        handle?.remove?.()
      }
    },
  }
}
