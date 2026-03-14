import { Capacitor, registerPlugin } from '@capacitor/core'

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const GOOGLE_WEB_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim()
const GoogleIdentity = registerPlugin('GoogleIdentity')

let gisScriptPromise = null

function createGoogleIdentityError(message, code = 'google_identity_error') {
  const error = new Error(String(message ?? '').trim() || 'Google identity error')
  error.code = code
  return error
}

function getGoogleAccountsIdApi() {
  return globalThis.google?.accounts?.id ?? null
}

function isWebRuntime() {
  return Capacitor.getPlatform() === 'web'
}

export function isGoogleIdentitySupported() {
  if (!GOOGLE_WEB_CLIENT_ID) return false
  if (isWebRuntime()) return true
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function getGoogleIdentityUnavailableReason() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return '缺少 Google Web Client ID（請設定 VITE_GOOGLE_WEB_CLIENT_ID）'
  }
  if (isWebRuntime()) return ''
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return ''
  if (Capacitor.isNativePlatform()) {
    return '目前僅支援 Android App 的 Google 登入'
  }
  return '缺少 Google Web Client ID（請設定 VITE_GOOGLE_WEB_CLIENT_ID）'
}

async function loadGoogleIdentityScript() {
  if (!isWebRuntime()) {
    throw createGoogleIdentityError('Web GIS 僅支援瀏覽器環境', 'google_identity_web_only')
  }
  if (gisScriptPromise) return gisScriptPromise

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(createGoogleIdentityError('Google Identity Services 載入失敗', 'google_gis_load_failed')), { once: true })
      if (getGoogleAccountsIdApi()) resolve()
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(createGoogleIdentityError('Google Identity Services 載入失敗', 'google_gis_load_failed'))
    document.head.appendChild(script)
  }).finally(() => {
    if (!getGoogleAccountsIdApi()) {
      gisScriptPromise = null
    }
  })

  return gisScriptPromise
}

function normalizeNativeError(error) {
  const message = String(error?.message ?? error ?? '').trim() || 'Google 登入失敗'
  const code = String(error?.code ?? '').trim()
  return createGoogleIdentityError(message, code || 'google_identity_native_failed')
}

export async function signInWithGoogleCredentialManager({ nonce } = {}) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw createGoogleIdentityError('Credential Manager 僅支援 Android App', 'google_identity_android_only')
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw createGoogleIdentityError('缺少 Google Web Client ID', 'google_client_id_missing')
  }
  if (!nonce) {
    throw createGoogleIdentityError('缺少 Google nonce', 'google_nonce_required')
  }

  try {
    const result = await GoogleIdentity.signIn({
      serverClientId: GOOGLE_WEB_CLIENT_ID,
      nonce: String(nonce).trim(),
      filterByAuthorizedAccounts: false,
    })
    return {
      idToken: String(result?.idToken ?? '').trim(),
      displayName: String(result?.displayName ?? '').trim(),
      email: String(result?.email ?? '').trim(),
      avatarUrl: String(result?.avatarUrl ?? '').trim(),
    }
  } catch (error) {
    throw normalizeNativeError(error)
  }
}

export async function renderGoogleIdentityButton(container, {
  nonce,
  text = 'signin_with',
  theme = 'outline',
  shape = 'pill',
  size = 'large',
  width = 280,
  onCredential = null,
  onError = null,
} = {}) {
  if (!container) {
    throw createGoogleIdentityError('缺少 Google 按鈕容器', 'google_button_container_missing')
  }
  if (!isWebRuntime()) {
    throw createGoogleIdentityError('Google GIS 按鈕僅支援 Web', 'google_identity_web_only')
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw createGoogleIdentityError('缺少 Google Web Client ID', 'google_client_id_missing')
  }
  if (!nonce) {
    throw createGoogleIdentityError('缺少 Google nonce', 'google_nonce_required')
  }

  await loadGoogleIdentityScript()
  const accounts = getGoogleAccountsIdApi()
  if (!accounts) {
    throw createGoogleIdentityError('Google Identity Services 尚未就緒', 'google_gis_not_ready')
  }

  container.innerHTML = ''
  accounts.initialize({
    client_id: GOOGLE_WEB_CLIENT_ID,
    nonce: String(nonce).trim(),
    ux_mode: 'popup',
    cancel_on_tap_outside: true,
    callback: (response) => {
      const idToken = String(response?.credential ?? '').trim()
      if (!idToken) {
        const error = createGoogleIdentityError('Google 未回傳 ID token', 'google_id_token_missing')
        if (typeof onError === 'function') onError(error)
        return
      }
      if (typeof onCredential === 'function') {
        onCredential({
          idToken,
          selectBy: String(response?.select_by ?? '').trim(),
        })
      }
    },
    error_callback: (reason) => {
      if (typeof onError === 'function') {
        onError(createGoogleIdentityError(String(reason?.type ?? 'Google 登入失敗'), 'google_gis_error'))
      }
    },
  })
  accounts.renderButton(container, {
    type: 'standard',
    theme,
    text,
    shape,
    size,
    logo_alignment: 'left',
    width,
  })
}

export async function disableGoogleIdentityAutoSelect() {
  if (isWebRuntime()) {
    const accounts = getGoogleAccountsIdApi()
    accounts?.disableAutoSelect?.()
    return
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await GoogleIdentity.clearCredentialState()
    } catch {
      // ignore credential clearing failures during logout
    }
  }
}
