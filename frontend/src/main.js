import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import App from '@/ui/App.vue'
import router from '@/ui/router'
import { useUiStore } from '@/ui/stores/ui.store'
import { bootstrapApp } from '@/ui/services/app-bootstrap.service'
import {
  initSqliteWebStoreWithTimeout,
  initializeAppEnvironment,
  installAppRuntime,
} from '@/ui/services/app-runtime.service'
import { translateMessage } from '@/ui/services/i18n.service'
import { installGlobalErrorLogging } from '@/ui/services/error-log.service'
import '@/ui/assets/css/global.css'
import '@/ui/assets/css/apple-ui.css'
import '@/ui/assets/css/habitat-ui.css'

async function main() {
  initializeAppEnvironment()

  // Load icons in parallel with sqlite. Awaiting the FA chunk before
  // initWebStore serializes ~170kB vendor-icons ahead of WASM and can
  // leave bootstrap stuck on core-db after the 6s sqlite race times out.
  const iconsReady = import('@/ui/utils/fa-icon-registry.js')
    .then(({ registerAppIcons }) => {
      registerAppIcons()
    })
    .catch((error) => {
      console.error('[icons] registry failed', error)
    })

  const app = createApp(App)
  const pinia = createPinia()

  app.component('font-awesome-icon', FontAwesomeIcon)
  app.use(pinia)
  app.use(router)
  installGlobalErrorLogging(app, { router })
  app.mount('#app')

  try {
    await initSqliteWebStoreWithTimeout()
  } catch (error) {
    console.error('[sqlite] init failed, continue bootstrap', error)
  }

  try {
    await Promise.all([
      bootstrapApp(pinia),
      iconsReady,
    ])
    installAppRuntime({ pinia, router })
  } catch (error) {
    console.error('[bootstrap] failed', error)
    const uiStore = useUiStore(pinia)
    const message = String(error?.message ?? translateMessage('common.unknown_error', '未知錯誤'))
    const integrityHint = error?.code === 'LOCAL_DB_INTEGRITY' || error?.silentWipeBlocked
      ? (
        error?.code === 'APP_DOWNGRADE_BLOCKED'
          ? translateMessage(
            'error.install_from_play',
            '請至 Play 商店安裝相同或更新版本；不要用舊 APK／快取覆寫。系統不會自動清空帳本。',
          )
          : translateMessage(
            'error.no_auto_wipe',
            '系統不會自動清空帳本。請至資料管理／自動備份／帳本同步還原，或明確執行「重設全部資料」。',
          )
      )
      : ''
    uiStore.pushToast(
      translateMessage(
        'error.init_failed',
        { message: integrityHint ? `${message} ${integrityHint}` : message },
        '初始化失敗：{message}',
      ),
      'error',
    )
  }
}

main().catch((error) => {
  console.error('[main] fatal error', error)
})
