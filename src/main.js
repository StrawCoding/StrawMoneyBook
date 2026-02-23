import { createApp } from 'vue'
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
  faBook,
  faBookOpen,
  faBottleWater,
  faBowlFood,
  faBriefcase,
  faBriefcaseMedical,
  faBurger,
  faBus,
  faCakeCandles,
  faCalendar,
  faCar,
  faCat,
  faCartShopping,
  faChampagneGlasses,
  faChevronDown,
  faCirclePlus,
  faChild,
  faChartPie,
  faCircleInfo,
  faCircleQuestion,
  faCloudArrowUp,
  faCoins,
  faBuildingColumns,
  faCreditCard,
  faDatabase,
  faDog,
  faDumbbell,
  faFileInvoiceDollar,
  faFilm,
  faFutbol,
  faGamepad,
  faGasPump,
  faGear,
  faGift,
  faGlasses,
  faGraduationCap,
  faHandHoldingDollar,
  faHeartPulse,
  faHospital,
  faHouse,
  faHouseMedical,
  faKitMedical,
  faLandmark,
  faLanguage,
  faLaptop,
  faLightbulb,
  faMagnifyingGlass,
  faMobileScreenButton,
  faMicrophone,
  faMoneyBillTransfer,
  faMoneyBillWave,
  faMoneyCheckDollar,
  faMotorcycle,
  faMugHot,
  faMusic,
  faNotesMedical,
  faPaperPlane,
  faPalette,
  faPersonRunning,
  faPhone,
  faPiggyBank,
  faPlane,
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
  faTrain,
  faTrainSubway,
  faToolbox,
  faTv,
  faUtensils,
  faUsers,
  faUserGroup,
  faVolleyball,
  faWallet,
  faWandMagicSparkles,
  faWifi,
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
import { runGoogleAutoBackupIfDue, runGoogleAutoBackupOnDataChange } from '@/ui/services/google-backup.service'
import { runWebdavAutoBackupIfDue, runWebdavAutoBackupOnDataChange } from '@/ui/services/webdav-backup.service'
import { runExchangeRateAutoSyncIfDue } from '@/ui/services/exchange-rate.service'
import { warmupMembershipRuntime } from '@/core/services/membership.service'
import { loadThemeColor } from '@/ui/services/theme.service'
import { initLocalePreference } from '@/ui/services/i18n.service'
import '@/ui/assets/css/global.css'

const DATA_CHANGE_BACKUP_DEBOUNCE_MS = 15000
let dataChangeBackupTimer = null
let dataChangeBackupRunning = false

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
  faGift,
  faHeartPulse,
  faGraduationCap,
  faBook,
  faCartShopping,
  faBagShopping,
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
  faBaby,
  faBaseball,
  faBasketball,
  faBicycle,
  faBookOpen,
  faBottleWater,
  faBriefcaseMedical,
  faCakeCandles,
  faCalendar,
  faCat,
  faChampagneGlasses,
  faChild,
  faHandHoldingDollar,
  faDog,
  faDumbbell,
  faFileInvoiceDollar,
  faFutbol,
  faMoneyBillTransfer,
  faMoneyCheckDollar,
  faMotorcycle,
  faMusic,
  faNotesMedical,
  faMicrophone,
  faPalette,
  faPaperPlane,
  faPersonRunning,
  faPhone,
  faPills,
  faPlug,
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
  faTrainSubway,
  faToolbox,
  faTv,
  faUsers,
  faUserGroup,
  faVolleyball,
  faWandMagicSparkles,
  faWifi,
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

async function main() {
  loadThemeColor()
  initLocalePreference()

  const app = createApp(App)
  const pinia = createPinia()

  app.component('font-awesome-icon', FontAwesomeIcon)
  app.use(pinia)
  app.use(router)
  app.mount('#app')

  if (Capacitor.getPlatform() === 'android') {
    CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
      const overlayCloseEvent = new Event('app:request-close-overlay', { cancelable: true })
      window.dispatchEvent(overlayCloseEvent)
      if (overlayCloseEvent.defaultPrevented) {
        return
      }

      if (canGoBack && router.currentRoute.value.path !== '/') {
        await router.back()
        return
      }
      await CapacitorApp.exitApp()
    })

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      scheduleMembershipWarmup('app_resume')
      window.dispatchEvent(new Event('app:check-update'))
      const ledgerStore = useLedgerStore(pinia)
      if (ledgerStore.activeLedgerId) {
        void runExchangeRateAutoSyncIfDue(ledgerStore.activeLedgerId)
      }
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
    if (typeof window !== 'undefined') {
      window.addEventListener('app:data-mutated', () => {
        scheduleAutoBackupOnDataChange(pinia)
      })
    }
    if (ledgerStore.activeLedgerId) {
      void runGoogleAutoBackupIfDue(ledgerStore.activeLedgerId)
      void runWebdavAutoBackupIfDue(ledgerStore.activeLedgerId)
      void runExchangeRateAutoSyncIfDue(ledgerStore.activeLedgerId)
    }

    scheduleMembershipWarmup('app_start')
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('app:check-update'))
    }
  } catch (error) {
    console.error('[bootstrap] failed', error)
    const uiStore = useUiStore(pinia)
    const message = String(error?.message ?? '未知錯誤')
    uiStore.pushToast(`初始化失敗：${message}`, 'error')
  }
}

main().catch((error) => {
  console.error('[main] fatal error', error)
})
