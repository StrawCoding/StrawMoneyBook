import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'

const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GOOGLE_SCOPES = ['email', 'profile', DRIVE_APPDATA_SCOPE]

let initializedClientId = ''
let cachedAccessToken = ''
let cachedProfile = null
let ongoingSignInPromise = null

const GOOGLE_REAUTH_REQUIRED_CODE = 'GOOGLE_REAUTH_REQUIRED'

function assertNativePlatform() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Google 備份僅支援 App 裝置')
  }
}

function extractToken(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  return String(raw.token ?? '').trim()
}

function getConfiguredWebClientId() {
  return String(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim()
}

function isAccountReauthError(error) {
  const text = String(error?.message ?? error ?? '').toLowerCase()
  return text.includes('account reauth failed') || text.includes('[16]')
}

function extractErrorDebugParts(error) {
  const parts = []
  const code = String(error?.code ?? error?.errorCode ?? '').trim()
  const status = String(error?.status ?? '').trim()
  const name = String(error?.name ?? '').trim()
  const raw = String(error?.message ?? error ?? '').trim()
  if (code) parts.push(`code=${code}`)
  if (status) parts.push(`status=${status}`)
  if (name && name !== 'Error') parts.push(`name=${name}`)
  if (raw) parts.push(`raw=${raw}`)
  return parts
}

function appendDebugDetails(message, error) {
  const parts = extractErrorDebugParts(error)
  if (!parts.length) return message
  return `${message}（${parts.join(' | ')}）`
}

function normalizeGoogleAuthError(error) {
  if (isAccountReauthError(error)) {
    return new Error(
      appendDebugDetails(
        'Google 需要重新授權，請再試一次；若仍失敗請先在裝置 Google 帳號中移除本 App 授權後重登。',
        error,
      ),
    )
  }
  const message = String(error?.message ?? '').trim()
  return new Error(appendDebugDetails(message || 'Google 登入失敗', error))
}

function createReauthRequiredError(message = 'Google 需要重新授權，請到自動備份頁重新登入 Google。', reason = null) {
  const error = new Error(appendDebugDetails(message, reason))
  error.code = GOOGLE_REAUTH_REQUIRED_CODE
  return error
}

async function loginGoogleWithOptions(options = {}) {
  return SocialLogin.login({
    provider: 'google',
    options: {
      scopes: GOOGLE_SCOPES,
      ...options,
    },
  })
}

export async function initGoogleAuth() {
  assertNativePlatform()
  const clientId = getConfiguredWebClientId()
  if (!clientId) {
    throw new Error('缺少 Google Web Client ID（請設定 VITE_GOOGLE_WEB_CLIENT_ID）')
  }
  if (initializedClientId === clientId) return

  await SocialLogin.initialize({
    google: {
      webClientId: clientId,
      mode: 'online',
    },
  })
  initializedClientId = clientId
}

export async function googleSignIn() {
  if (ongoingSignInPromise) {
    return ongoingSignInPromise
  }

  ongoingSignInPromise = (async () => {
    await initGoogleAuth()
    let response
    try {
      // 單次登入就強制刷新 token，避免先失敗再二次互動登入導致雙彈窗。
      response = await loginGoogleWithOptions({
        forceRefreshToken: true,
        filterByAuthorizedAccounts: false,
      })
    } catch (error) {
      if (isAccountReauthError(error)) {
        try {
          await SocialLogin.logout({ provider: 'google' })
        } catch {
          // ignore logout failures
        }
        try {
          // Retry once with explicit prompt/standard style after clearing stale auth state.
          response = await loginGoogleWithOptions({
            forceRefreshToken: true,
            filterByAuthorizedAccounts: false,
            forcePrompt: true,
            style: 'standard',
          })
        } catch (retryError) {
          throw normalizeGoogleAuthError(
            new Error(
              `首次登入失敗：${String(error?.message ?? error)}；重試仍失敗：${String(retryError?.message ?? retryError)}`,
            ),
          )
        }
      } else {
        throw normalizeGoogleAuthError(error)
      }
    }

    if (response.provider !== 'google' || response.result?.responseType !== 'online') {
      throw new Error('Google 登入失敗，請重試')
    }

    const accessToken = extractToken(response.result.accessToken)
    if (!accessToken) {
      throw new Error('Google 登入成功但未取得 access token')
    }

    cachedAccessToken = accessToken
    cachedProfile = {
      email: response.result.profile?.email || '',
      name: response.result.profile?.name || '',
      imageUrl: response.result.profile?.imageUrl || '',
    }

    return {
      accessToken,
      profile: cachedProfile,
    }
  })()

  try {
    return await ongoingSignInPromise
  } finally {
    ongoingSignInPromise = null
  }
}

export async function getAccessToken(options = {}) {
  if (cachedAccessToken) return cachedAccessToken
  const interactive = options?.interactive !== false

  if (interactive) {
    // Keep manual flows to a single interactive login to avoid duplicate account prompts.
    try {
      const signed = await googleSignIn()
      return signed.accessToken
    } catch (error) {
      throw normalizeGoogleAuthError(error)
    }
  }

  await initGoogleAuth()
  try {
    const loginState = await SocialLogin.isLoggedIn({ provider: 'google' })
    if (!loginState?.isLoggedIn) {
      throw createReauthRequiredError()
    }
    const auth = await SocialLogin.getAuthorizationCode({ provider: 'google' })
    const token = extractToken(auth?.accessToken)
    if (token) {
      cachedAccessToken = token
      return token
    }
    throw createReauthRequiredError()
  } catch (error) {
    console.warn('[google-auth] background token fetch failed', error)
    throw createReauthRequiredError(undefined, error)
  }
}

export async function reauth() {
  cachedAccessToken = ''
  return getAccessToken()
}

export async function googleSignOut() {
  try {
    await SocialLogin.logout({ provider: 'google' })
  } finally {
    cachedAccessToken = ''
    cachedProfile = null
  }
}

export function getCachedGoogleProfile() {
  return cachedProfile
}
