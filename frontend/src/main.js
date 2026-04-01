import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowDown,
  faArrowRightArrowLeft,
  faArrowTrendUp,
  faArrowUp,
  faBagShopping,
  faBaby,
  faBaseball,
  faBars,
  faBasketball,
  faBicycle,
  faBolt,
  faBeerMugEmpty,
  faBook,
  faBookOpen,
  faBottleDroplet,
  faBottleWater,
  faBoxArchive,
  faBowlFood,
  faBriefcase,
  faBriefcaseMedical,
  faBrush,
  faBurger,
  faBus,
  faCakeCandles,
  faCalendar,
  faCar,
  faCamera,
  faCat,
  faCartShopping,
  faChampagneGlasses,
  faChartLine,
  faChevronDown,
  faCirclePlus,
  faCircleDollarToSlot,
  faChild,
  faChartPie,
  faCircleInfo,
  faCircleQuestion,
  faCloudArrowUp,
  faCoins,
  faCoffee,
  faBuildingColumns,
  faBuilding,
  faCreditCard,
  faCrown,
  faDatabase,
  faDog,
  faDroplet,
  faDumbbell,
  faFileInvoiceDollar,
  faFilm,
  faFish,
  faFutbol,
  faGamepad,
  faGasPump,
  faGear,
  faGem,
  faGift,
  faGlasses,
  faGraduationCap,
  faHammer,
  faHandHoldingDollar,
  faHeartPulse,
  faHospital,
  faHouse,
  faHouseMedical,
  faKitMedical,
  faIceCream,
  faKey,
  faLandmark,
  faLanguage,
  faLaptop,
  faLightbulb,
  faLock,
  faMagnifyingGlass,
  faMobile,
  faMobileScreenButton,
  faMoneyBill,
  faMicrophone,
  faMoneyBillTransfer,
  faMoneyBillTrendUp,
  faMoneyBillWave,
  faMoneyCheckDollar,
  faMotorcycle,
  faMoon,
  faMugHot,
  faMusic,
  faNotesMedical,
  faPaperPlane,
  faPalette,
  faPaw,
  faPercent,
  faPersonRunning,
  faPhone,
  faPiggyBank,
  faPlane,
  faPizzaSlice,
  faPlug,
  faPills,
  faPrint,
  faReceipt,
  faSackDollar,
  faScrewdriverWrench,
  faSchool,
  faScissors,
  faShieldHalved,
  faShirt,
  faShop,
  faShower,
  faSoap,
  faStore,
  faTag,
  faTags,
  faTaxi,
  faTooth,
  faTicket,
  faTrain,
  faTrainSubway,
  faToolbox,
  faTree,
  faTv,
  faSeedling,
  faSun,
  faUtensils,
  faUsers,
  faUserGroup,
  faVault,
  faVolleyball,
  faWallet,
  faWandMagicSparkles,
  faWifi,
  faWrench,
  faAppleWhole,
  faBasketShopping,
  faCalendarDays,
  faCapsules,
  faClockRotateLeft,
  faHouseLaptop,
  faLocationDot,
  faMoneyBill1Wave,
  faShieldHeart,
  faStethoscope,
  faSyringe,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import App from '@/ui/App.vue'
import router from '@/ui/router'
import { bootstrapApp } from '@/core/services/bootstrap.service'
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
import { warmupMembershipRuntime } from '@/core/services/membership.service'
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
import { installGlobalErrorLogging } from '@/ui/services/error-log.service'
import '@/ui/assets/css/global.css'

const DATA_CHANGE_BACKUP_DEBOUNCE_MS = 15000
const AUTO_BACKUP_DUE_CHECK_MS = 5 * 60 * 1000
const BACK_EXIT_CONFIRM_WINDOW_MS = 1600
let dataChangeBackupTimer = null
let dataChangeBackupRunning = false
let autoBackupDueTimer = null
let lastAndroidBackPressedAt = 0
let homeWidgetSyncTimer = null
let hasTriedInteractiveGoogleAutoConnect = false

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

function scheduleHomeWidgetSync(pinia, delayMs = 1200) {
  if (typeof window === 'undefined') return
  if (homeWidgetSyncTimer != null) {
    window.clearTimeout(homeWidgetSyncTimer)
  }
  homeWidgetSyncTimer = window.setTimeout(() => {
    homeWidgetSyncTimer = null
    void syncActiveLedgerHomeWidget(pinia)
  }, Math.max(0, Number(delayMs) || 0))
}

function clearAutoBackupDueTimer() {
  if (typeof window === 'undefined') return
  if (autoBackupDueTimer != null) {
    window.clearTimeout(autoBackupDueTimer)
    autoBackupDueTimer = null
  }
}

function scheduleAutoBackupDueCheck(pinia, delayMs = AUTO_BACKUP_DUE_CHECK_MS) {
  if (typeof window === 'undefined') return
  clearAutoBackupDueTimer()
  autoBackupDueTimer = window.setTimeout(() => {
    autoBackupDueTimer = null
    void runAutoBackupDueCheck(pinia, 'scheduled_due_check')
  }, Math.max(0, Number(delayMs) || 0))
}

async function runAutoBackupDueCheck(pinia, reason = 'scheduled_due_check') {
  const ledgerStore = useLedgerStore(pinia)
  const ledgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!ledgerId) {
    clearAutoBackupDueTimer()
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
    scheduleAutoBackupDueCheck(pinia)
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

async function handleAppUrlOpen(rawUrl) {
  const target = resolveRouteFromAppUrl(rawUrl)
  if (!target) return
  await router.push(target).catch(() => {})
}

function scheduleAutoBackupOnDataChange(pinia) {
  if (typeof window === 'undefined') return
  if (dataChangeBackupTimer != null) {
    window.clearTimeout(dataChangeBackupTimer)
  }
  dataChangeBackupTimer = window.setTimeout(() => {
    dataChangeBackupTimer = null
    if (dataChangeBackupRunning) return
    dataChangeBackupRunning = true
    const ledgerStore = useLedgerStore(pinia)
    const ledgerId = ledgerStore.activeLedgerId
    if (!ledgerId) {
      dataChangeBackupRunning = false
      return
    }
    Promise.allSettled([runGoogleAutoBackupOnDataChange(ledgerId), runWebdavAutoBackupOnDataChange(ledgerId)])
      .finally(() => {
        dataChangeBackupRunning = false
      })
  }, DATA_CHANGE_BACKUP_DEBOUNCE_MS)
}

library.add(
  faHouse,
  faChartPie,
  faWallet,
  faGear,
  faPrint,
  faBars,
  faMagnifyingGlass,
  faMoneyBillWave,
  faPiggyBank,
  faBuildingColumns,
  faCreditCard,
  faDatabase,
  faLandmark,
  faLanguage,
  faMobileScreenButton,
  faCoins,
  faSackDollar,
  faUtensils,
  faBowlFood,
  faMugHot,
  faBurger,
  faCar,
  faGasPump,
  faBus,
  faTrain,
  faFilm,
  faGamepad,
  faShirt,
  faBriefcase,
  faBeerMugEmpty,
  faGift,
  faHeartPulse,
  faGraduationCap,
  faBook,
  faCartShopping,
  faBagShopping,
  faBoxArchive,
  faBottleDroplet,
  faBrush,
  faPlane,
  faReceipt,
  faTag,
  faTags,
  faBolt,
  faCloudArrowUp,
  faCircleQuestion,
  faChevronDown,
  faCirclePlus,
  faArrowTrendUp,
  faArrowRightArrowLeft,
  faArrowUp,
  faArrowDown,
  faBuilding,
  faBaby,
  faBaseball,
  faBasketball,
  faBicycle,
  faBookOpen,
  faCamera,
  faBottleWater,
  faBriefcaseMedical,
  faCakeCandles,
  faCalendar,
  faCat,
  faChampagneGlasses,
  faChartLine,
  faChild,
  faCircleDollarToSlot,
  faCoffee,
  faHandHoldingDollar,
  faCrown,
  faDog,
  faDroplet,
  faDumbbell,
  faFileInvoiceDollar,
  faFish,
  faFutbol,
  faGem,
  faMoneyBillTransfer,
  faMoneyCheckDollar,
  faMoneyBill,
  faMoneyBillTrendUp,
  faMotorcycle,
  faMusic,
  faNotesMedical,
  faMicrophone,
  faPalette,
  faPaw,
  faPercent,
  faPaperPlane,
  faPersonRunning,
  faPhone,
  faPills,
  faPlug,
  faHammer,
  faIceCream,
  faKey,
  faLock,
  faMobile,
  faMoon,
  faPizzaSlice,
  faScrewdriverWrench,
  faSchool,
  faScissors,
  faShieldHalved,
  faShower,
  faSoap,
  faShop,
  faStore,
  faTaxi,
  faTooth,
  faTicket,
  faTrainSubway,
  faToolbox,
  faTree,
  faTv,
  faUsers,
  faUserGroup,
  faSeedling,
  faSun,
  faVault,
  faVolleyball,
  faWandMagicSparkles,
  faWifi,
  faWrench,
  faAppleWhole,
  faBasketShopping,
  faCalendarDays,
  faCapsules,
  faClockRotateLeft,
  faGlasses,
  faHouseLaptop,
  faHouseMedical,
  faHospital,
  faKitMedical,
  faLightbulb,
  faLaptop,
  faLocationDot,
  faMoneyBill1Wave,
  faShieldHeart,
  faStethoscope,
  faSyringe,
  faCircleInfo,
)

async function initSqliteWebStoreIfNeeded() {
  await ensureWebSqliteStoreReady()
}

async function initSqliteWebStoreWithTimeout(timeoutMs = 6000) {
  let timeoutId = null
  try {
    await Promise.race([
      initSqliteWebStoreIfNeeded(),
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

function scheduleMembershipWarmup(reason) {
  const run = () => {
    void warmupMembershipRuntime(reason).catch((error) => {
      console.warn(`[membership] warmup failed (${reason})`, error)
    })
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      run()
    }, { timeout: 800 })
    return
  }

  if (typeof window !== 'undefined') {
    window.setTimeout(run, 0)
    return
  }

  run()
}

function androidExitHintMessage() {
  return translateMessage('app.exit_again', '再按一次返回鍵離開 App')
}

function restoreGoogleBackupSessionInBackground(ledgerId, { allowInteractive = false } = {}) {
  if (!ledgerId) return
  const shouldAllowInteractive = Boolean(allowInteractive) && !hasTriedInteractiveGoogleAutoConnect
  if (shouldAllowInteractive) {
    hasTriedInteractiveGoogleAutoConnect = true
  }
  return autoConnectGoogleBackup(ledgerId, {
    allowInteractive: shouldAllowInteractive,
    allowInteractiveWhenGoogleLinked: shouldAllowInteractive,
  }).catch((error) => {
    console.warn('[google-backup] auto sign-in restore failed', error)
    return null
  })
}

function restoreGoogleBackupForActiveLedgerInBackground(ledgerId, { runDueBackup = false, allowInteractive = false } = {}) {
  if (!ledgerId) return
  void (async () => {
    const restoredState = await restoreGoogleBackupSessionInBackground(ledgerId, { allowInteractive })
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

async function main() {
  loadThemeColor()
  initLocalePreference()

  const app = createApp(App)
  const pinia = createPinia()

  app.component('font-awesome-icon', FontAwesomeIcon)
  app.use(pinia)
  app.use(router)
  installGlobalErrorLogging(app, { router })
  app.mount('#app')

  if (Capacitor.getPlatform() === 'android') {
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void handleAppUrlOpen(url)
    })
    void CapacitorApp.getLaunchUrl().then((result) => {
      const launchUrl = String(result?.url ?? '').trim()
      if (!launchUrl) return
      void handleAppUrlOpen(launchUrl)
    }).catch((error) => {
      console.warn('[app-url] getLaunchUrl failed', error)
    })

    CapacitorApp.addListener('backButton', async () => {
      const overlayCloseEvent = new Event('app:request-close-overlay', { cancelable: true })
      window.dispatchEvent(overlayCloseEvent)
      if (overlayCloseEvent.defaultPrevented) {
        return
      }

      const currentPath = String(router.currentRoute.value.path ?? '/')

      if (canNavigateBackInApp(currentPath)) {
        await router.back()
        return
      }

      const fallbackPath = resolveBackFallback(currentPath)
      if (fallbackPath !== currentPath) {
        await router.replace(fallbackPath)
        return
      }

      if (shouldConfirmExit(currentPath)) {
        const now = Date.now()
        if (now - lastAndroidBackPressedAt <= BACK_EXIT_CONFIRM_WINDOW_MS) {
          await CapacitorApp.exitApp()
          return
        }
        lastAndroidBackPressedAt = now
        useUiStore(pinia).pushToast(androidExitHintMessage(), 'info')
        return
      }

      await CapacitorApp.exitApp()
    })

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      restoreSharedLedgerSessionInBackground('app_resume')
      scheduleMembershipWarmup('app_resume')
      window.dispatchEvent(new Event('app:check-update'))
      const ledgerStore = useLedgerStore(pinia)
      if (ledgerStore.activeLedgerId) {
        restoreGoogleBackupForActiveLedgerInBackground(ledgerStore.activeLedgerId, { runDueBackup: true })
        void runExchangeRateAutoSyncIfDue(ledgerStore.activeLedgerId)
        triggerBankAutoRefresh(pinia, ledgerStore.activeLedgerId, 'app_resume')
        scheduleAutoBackupDueCheck(pinia)
      }
      void runSharedLedgerBackgroundSyncNow(pinia)
      void runGoogleDriveLedgerBackgroundSyncNow(pinia)
      void syncActiveLedgerHomeWidget(pinia)
    })
  }

  try {
    await initSqliteWebStoreWithTimeout()
  } catch (error) {
    console.error('[sqlite] init failed, continue bootstrap', error)
  }

  try {
    await bootstrapApp(pinia)
    const ledgerStore = useLedgerStore(pinia)
    restoreSharedLedgerSessionInBackground('app_start', { force: true })
    initSharedLedgerBackgroundSync(pinia)
    initGoogleDriveLedgerSync(pinia)
    if (typeof window !== 'undefined') {
      window.addEventListener('app:data-mutated', () => {
        scheduleAutoBackupOnDataChange(pinia)
        scheduleAutoBackupDueCheck(pinia, 30000)
        scheduleHomeWidgetSync(pinia)
        scheduleActiveSharedLedgerAutoSync(pinia)
        scheduleActiveGoogleDriveLedgerSync(pinia)
      })
      window.addEventListener('app:auto-backup-config-updated', () => {
        void runAutoBackupDueCheck(pinia, 'config_updated')
      })
      window.addEventListener('focus', () => {
        restoreSharedLedgerSessionInBackground('window_focus')
        void runGoogleDriveLedgerBackgroundSyncNow(pinia)
      })
    }

    scheduleMembershipWarmup('app_start')
    watch(
      () => ledgerStore.activeLedgerId,
      (ledgerId) => {
        const normalizedLedgerId = String(ledgerId ?? '').trim()
        if (!normalizedLedgerId) {
          clearAutoBackupDueTimer()
          return
        }
        restoreGoogleBackupForActiveLedgerInBackground(normalizedLedgerId, {
          runDueBackup: true,
          allowInteractive: true,
        })
        void runWebdavAutoBackupIfDue(normalizedLedgerId)
        scheduleAutoBackupDueCheck(pinia)
        void runExchangeRateAutoSyncIfDue(normalizedLedgerId)
        triggerBankAutoRefresh(pinia, normalizedLedgerId, 'active_ledger_change')
      },
      { immediate: true },
    )
    watch(
      () => `${ledgerStore.activeLedgerId}:${String(ledgerStore.activeLedger?.currency_code ?? '')}`,
      () => {
        void syncActiveLedgerHomeWidget(pinia)
      },
      { immediate: true },
    )
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:check-update'))
    }
  } catch (error) {
    console.error('[bootstrap] failed', error)
    const uiStore = useUiStore(pinia)
    const message = String(error?.message ?? translateMessage('common.unknown_error', '未知錯誤'))
    uiStore.pushToast(translateMessage('app.init_failed', { message }, '初始化失敗：{message}'), 'error')
  }
}

main().catch((error) => {
  console.error('[main] fatal error', error)
})
