import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { getConfiguredGoogleWebClientId, getGoogleWebClientIdMissingMessage } from '@/services/google/client-id'

const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GOOGLE_SCOPES = ['email', 'profile', DRIVE_APPDATA_SCOPE]
const GOOGLE_TOKEN_CACHE_KEY = 'straw.google.oauth.token_cache.v1'
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60 * 1000
const GOOGLE_INTERACTIVE_LOGIN_TIMEOUT_MS = 120 * 1000
const GOOGLE_BACKEND_REQUEST_TIMEOUT_MS = 20 * 1000
const GOOGLE_PROFILE_FETCH_TIMEOUT_MS = 8 * 1000
const ONLINE_ACCESS_TOKEN_DEFAULT_TTL_SEC = 55 * 60
const STALE_SIGNIN_PROMISE_MS = GOOGLE_INTERACTIVE_LOGIN_TIMEOUT_MS + GOOGLE_BACKEND_REQUEST_TIMEOUT_MS + 15 * 1000
const GOOGLE_LOGIN_TIMEOUT_MESSAGE = 'Google 登入逾時，請重試'
const GOOGLE_BACKEND_TIMEOUT_MESSAGE = 'Google 授權交換逾時，請檢查網路後重試'
const GOOGLE_OAUTH_DEFAULT_ORIGIN = 'https://api.strawmb.com'

const SERVER_AUTH_CODE_FLOW_REQUESTED = parseBooleanEnv(import.meta.env.VITE_GOOGLE_USE_SERVER_AUTH_CODE ?? 'true')
const SERVER_AUTH_CODE_FLOW_ENABLED = resolveServerAuthCodeFlowEnabled()
const GOOGLE_OAUTH_API_ORIGIN = resolveGoogleOAuthApiOrigin()
const GOOGLE_OAUTH_EXCHANGE_URL = resolveGoogleOAuthEndpoint(
  import.meta.env.VITE_GOOGLE_OAUTH_EXCHANGE_URL,
  '/api/google/oauth/exchange',
)
const GOOGLE_OAUTH_REFRESH_URL = resolveGoogleOAuthEndpoint(
  import.meta.env.VITE_GOOGLE_OAUTH_REFRESH_URL,
  '/api/google/oauth/refresh',
)
const GOOGLE_OAUTH_CLIENT_SHARED_KEY = String(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_SHARED_KEY ?? '').trim()

let initializedClientId = ''
let initializedGoogleMode = ''
let runtimeGoogleModeOverride = ''
let cachedAccessToken = ''
let cachedAccessTokenExpiresAtMs = 0
let cachedRefreshToken = ''
let cachedProfile = null
let ongoingSignInPromise = null
let ongoingSignInStartedAtMs = 0

const GOOGLE_REAUTH_REQUIRED_CODE = 'GOOGLE_REAUTH_REQUIRED'

function parseBooleanEnv(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function isServerAuthCodeModeActive() {
  if (!SERVER_AUTH_CODE_FLOW_ENABLED) return false
  return runtimeGoogleModeOverride !== 'online'
}

function resolveServerAuthCodeFlowEnabled() {
  if (!SERVER_AUTH_CODE_FLOW_REQUESTED) return false
  if (!Capacitor.isNativePlatform()) return true

  const explicitOrigin = String(import.meta.env.VITE_GOOGLE_OAUTH_API_ORIGIN ?? '').trim()
  const exchangeEndpoint = String(import.meta.env.VITE_GOOGLE_OAUTH_EXCHANGE_URL ?? '').trim()
  const refreshEndpoint = String(import.meta.env.VITE_GOOGLE_OAUTH_REFRESH_URL ?? '').trim()
  const hasAbsoluteEndpoints = isAbsoluteHttpUrl(exchangeEndpoint) && isAbsoluteHttpUrl(refreshEndpoint)
  const hasExplicitOrigin = isAbsoluteHttpUrl(explicitOrigin)

  if (hasAbsoluteEndpoints || hasExplicitOrigin) return true

  console.warn(
    '[google-auth] VITE_GOOGLE_USE_SERVER_AUTH_CODE=true but no explicit Google OAuth backend is configured for native runtime; fallback to online mode.',
  )
  return false
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

function resolveGoogleOAuthApiOrigin() {
  const explicitOrigin = String(import.meta.env.VITE_GOOGLE_OAUTH_API_ORIGIN ?? '').trim()
  if (isAbsoluteHttpUrl(explicitOrigin)) {
    return explicitOrigin.replace(/\/+$/, '')
  }

  return GOOGLE_OAUTH_DEFAULT_ORIGIN
}

function resolveGoogleOAuthEndpoint(raw, fallbackPath) {
  const value = String(raw ?? '').trim() || String(fallbackPath ?? '').trim()
  if (!value) return ''
  if (isAbsoluteHttpUrl(value)) return value
  if (!value.startsWith('/')) return value
  if (!Capacitor.isNativePlatform()) return value
  try {
    return new URL(value, `${GOOGLE_OAUTH_API_ORIGIN}/`).toString()
  } catch {
    return `${GOOGLE_OAUTH_API_ORIGIN}${value}`
  }
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  let timeoutId = 0
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })
  return Promise.race([task, timeoutPromise]).finally(() => {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  })
}

async function fetchWithTimeout(url, init, timeoutMs, timeoutMessage) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timeoutId = 0
  if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort()
    }, timeoutMs)
  }

  try {
    return await fetch(url, {
      ...(init ?? {}),
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw new Error(timeoutMessage)
    }
    throw error
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }
}

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

function inferTokenType(raw) {
  const token = String(raw ?? '').trim()
  if (!token) return 'empty'
  if (token.includes('.') && token.split('.').length === 3) return 'id_token_like'
  if (token.startsWith('1//')) return 'refresh_token_like'
  if (token.startsWith('ya29.')) return 'access_token_like'
  return 'unknown'
}

function logTokenDebug(tag, tokenMap = {}) {
  if (!import.meta.env.DEV) return
  const payload = Object.fromEntries(
    Object.entries(tokenMap).map(([name, value]) => [
      name,
      inferTokenType(value),
    ]),
  )
  console.info(`[google-auth] ${tag}`, payload)
}

function normalizeProfile(raw) {
  const profile = raw && typeof raw === 'object' ? raw : {}
  return {
    email: String(profile.email ?? '').trim(),
    name: String(profile.name ?? '').trim(),
    imageUrl: String(profile.imageUrl ?? profile.picture ?? '').trim(),
  }
}

function hasUsableCachedAccessToken() {
  if (!cachedAccessToken) return false
  if (!Number.isFinite(cachedAccessTokenExpiresAtMs) || cachedAccessTokenExpiresAtMs <= 0) return false
  return Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS < cachedAccessTokenExpiresAtMs
}

function canUseStorage() {
  return typeof localStorage !== 'undefined'
}

function persistTokenCache() {
  if (!canUseStorage()) return
  const payload = {
    accessToken: cachedAccessToken,
    accessTokenExpiresAtMs: cachedAccessTokenExpiresAtMs,
    refreshToken: cachedRefreshToken,
    profile: cachedProfile,
    mode: getGoogleInitializeMode(),
  }
  try {
    localStorage.setItem(GOOGLE_TOKEN_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage failures
  }
}

function restoreTokenCache() {
  if (!canUseStorage()) return
  try {
    const raw = localStorage.getItem(GOOGLE_TOKEN_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    cachedAccessToken = extractToken(parsed.accessToken)
    cachedRefreshToken = String(parsed.refreshToken ?? '').trim()
    cachedAccessTokenExpiresAtMs = Math.max(0, Number(parsed.accessTokenExpiresAtMs ?? 0) || 0)
    cachedProfile = normalizeProfile(parsed.profile)
  } catch {
    // ignore parse failures
  }
}

function clearTokenCacheStorage() {
  if (!canUseStorage()) return
  try {
    localStorage.removeItem(GOOGLE_TOKEN_CACHE_KEY)
  } catch {
    // ignore storage failures
  }
}

function updateTokenCache({ accessToken, refreshToken, expiresInSec, expiresAtMs } = {}) {
  if (typeof accessToken === 'string') {
    cachedAccessToken = accessToken.trim()
  }
  if (typeof refreshToken === 'string') {
    cachedRefreshToken = refreshToken.trim()
  }

  const explicitExpiresAt = Number(expiresAtMs)
  if (Number.isFinite(explicitExpiresAt) && explicitExpiresAt > 0) {
    cachedAccessTokenExpiresAtMs = explicitExpiresAt
  } else {
    const sec = Number(expiresInSec)
    cachedAccessTokenExpiresAtMs = Number.isFinite(sec) && sec > 0 ? Date.now() + sec * 1000 : 0
  }

  persistTokenCache()
}

function clearTokenCache({ keepRefreshToken = false } = {}) {
  cachedAccessToken = ''
  cachedAccessTokenExpiresAtMs = 0
  if (!keepRefreshToken) {
    cachedRefreshToken = ''
  }
  if (keepRefreshToken) persistTokenCache()
  else clearTokenCacheStorage()
}

function getIosClientId() {
  return String(import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '').trim()
}

function getConfiguredWebClientId() {
  return getConfiguredGoogleWebClientId()
}

function getGoogleInitializeMode() {
  return isServerAuthCodeModeActive() ? 'offline' : 'online'
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

function normalizeBackendTokenPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const accessToken = extractToken(source.accessToken ?? source.access_token)
  if (!accessToken) {
    throw new Error('後端未回傳 access token')
  }

  const refreshTokenRaw = source.refreshToken ?? source.refresh_token
  const refreshToken = typeof refreshTokenRaw === 'string' ? refreshTokenRaw.trim() : ''

  const expiresInRaw = Number(source.expiresIn ?? source.expires_in ?? 0)
  const expiresInSec = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 0

  const expiresAtRaw = Number(source.accessTokenExpiresAtMs ?? source.access_token_expires_at_ms ?? source.expiresAtMs ?? 0)
  const expiresAtMs = Number.isFinite(expiresAtRaw) && expiresAtRaw > 0 ? expiresAtRaw : 0

  const nestedProfile = normalizeProfile(source.profile)
  const flatProfile = normalizeProfile(source)
  const profile = nestedProfile.email || nestedProfile.name || nestedProfile.imageUrl ? nestedProfile : flatProfile

  logTokenDebug('normalizeBackendTokenPayload', {
    accessToken,
    refreshToken,
    idToken: source.idToken ?? source.id_token,
  })

  return {
    accessToken,
    refreshToken,
    expiresInSec,
    expiresAtMs,
    profile,
  }
}

async function postJson(url, payload) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (GOOGLE_OAUTH_CLIENT_SHARED_KEY) {
    headers['X-Straw-Client-Key'] = GOOGLE_OAUTH_CLIENT_SHARED_KEY
  }
  let response
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
    }, GOOGLE_BACKEND_REQUEST_TIMEOUT_MS, GOOGLE_BACKEND_TIMEOUT_MESSAGE)
  } catch (error) {
    throw new Error(appendDebugDetails(`Google OAuth 請求失敗（url=${url}）`, error))
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message = String(data?.error_description ?? data?.error ?? data?.message ?? text ?? '').trim()
    const errorNumber = String(data?.errorNumber ?? '').trim()
    const suffix = errorNumber ? `（errorNumber=${errorNumber}）` : ''
    throw new Error(`${message || `HTTP ${response.status}`}${suffix}（url=${url}）`)
  }

  if (!data || typeof data !== 'object') {
    throw new Error(`後端回應格式錯誤（url=${url}）`)
  }

  return data
}

async function fetchGoogleProfileByAccessToken(accessToken) {
  if (!accessToken) return null
  try {
    const response = await fetchWithTimeout('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }, GOOGLE_PROFILE_FETCH_TIMEOUT_MS, 'Google 使用者資料讀取逾時')
    if (!response.ok) return null
    const data = await response.json()
    const profile = normalizeProfile(data)
    if (!profile.email && !profile.name && !profile.imageUrl) return null
    return profile
  } catch {
    return null
  }
}

async function exchangeServerAuthCode(serverAuthCode) {
  const code = String(serverAuthCode ?? '').trim()
  if (!code) {
    throw new Error('Google 登入成功但未取得 server auth code')
  }
  if (!GOOGLE_OAUTH_EXCHANGE_URL) {
    throw new Error('缺少 Google OAuth 後端交換端點（請設定 VITE_GOOGLE_OAUTH_EXCHANGE_URL）')
  }
  const payload = await postJson(GOOGLE_OAUTH_EXCHANGE_URL, {
    serverAuthCode: code,
  })
  console.info('[google-auth] exchangeServerAuthCode success')
  return normalizeBackendTokenPayload(payload)
}

async function refreshAccessTokenByBackend(refreshToken) {
  const token = String(refreshToken ?? '').trim()
  if (!token) {
    throw createReauthRequiredError('Google 授權已失效，請到自動備份頁重新登入 Google。')
  }
  if (!GOOGLE_OAUTH_REFRESH_URL) {
    throw new Error('缺少 Google OAuth 後端 refresh 端點（請設定 VITE_GOOGLE_OAUTH_REFRESH_URL）')
  }
  const payload = await postJson(GOOGLE_OAUTH_REFRESH_URL, {
    refreshToken: token,
  })
  logTokenDebug('refreshAccessTokenByBackend request/response', {
    refreshToken: token,
    accessToken: payload?.accessToken ?? payload?.access_token,
  })
  return normalizeBackendTokenPayload(payload)
}

async function loginGoogleWithOptions(options = {}) {
  const preferredEmail = String(options.preferredEmail ?? options.loginHint ?? '').trim()
  const authOptions = {
    scopes: GOOGLE_SCOPES,
    ...options,
  }
  delete authOptions.preferredEmail
  if (preferredEmail && !authOptions.loginHint) {
    authOptions.loginHint = preferredEmail
  }

  return SocialLogin.login({
    provider: 'google',
    options: authOptions,
  })
}

function enableOnlineModeFallback(reason = '') {
  if (runtimeGoogleModeOverride === 'online') return
  runtimeGoogleModeOverride = 'online'
  initializedGoogleMode = ''
  clearTokenCache()
  if (reason) {
    console.warn('[google-auth] switch to online mode fallback', reason)
  }
}

function resolveOnlineProfile(result) {
  return normalizeProfile({
    email: result?.profile?.email || '',
    name: result?.profile?.name || '',
    imageUrl: result?.profile?.imageUrl || '',
  })
}

function resolveOnlineTokenExpiresInSec(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const expiresAtMsRaw = Number(
    source.expiresAtMs ??
    source.expires_at_ms ??
    source.expireTimeMs ??
    source.expirationTimeMs ??
    0,
  )
  if (Number.isFinite(expiresAtMsRaw) && expiresAtMsRaw > Date.now()) {
    const sec = Math.floor((expiresAtMsRaw - Date.now()) / 1000)
    if (sec > 0) return sec
  }

  const expiresInRaw = Number(source.expiresIn ?? source.expires_in ?? source.expires ?? 0)
  if (Number.isFinite(expiresInRaw) && expiresInRaw > 0) return expiresInRaw
  return ONLINE_ACCESS_TOKEN_DEFAULT_TTL_SEC
}

async function tryGetOnlineAccessTokenFromLoggedInSession() {
  const loginState = await SocialLogin.isLoggedIn({ provider: 'google' })
  if (!loginState?.isLoggedIn) return ''

  const auth = await SocialLogin.getAuthorizationCode({ provider: 'google' })
  const token = extractToken(auth?.accessToken)
  if (!token) return ''

  updateTokenCache({
    accessToken: token,
    refreshToken: '',
    expiresInSec: resolveOnlineTokenExpiresInSec(auth),
  })

  const profile = normalizeProfile(auth?.profile)
  if (profile.email || profile.name || profile.imageUrl) {
    cachedProfile = profile
    persistTokenCache()
  }

  return cachedAccessToken
}

function finishOnlineSignIn(result) {
  const accessToken = extractToken(result?.accessToken)
  if (!accessToken) {
    throw new Error('Google 登入成功但未取得 access token')
  }
  updateTokenCache({
    accessToken,
    refreshToken: '',
    expiresInSec: resolveOnlineTokenExpiresInSec(result),
  })
  cachedProfile = resolveOnlineProfile(result)
  persistTokenCache()
  return {
    accessToken,
    profile: cachedProfile,
  }
}

export async function initGoogleAuth() {
  assertNativePlatform()
  const clientId = getConfiguredWebClientId()
  if (!clientId) {
    throw new Error(getGoogleWebClientIdMissingMessage())
  }
  const mode = getGoogleInitializeMode()
  if (initializedClientId === clientId && initializedGoogleMode === mode) return

  const google = {
    webClientId: clientId,
    mode,
  }
  const iOSClientId = getIosClientId()
  if (iOSClientId) {
    google.iOSClientId = iOSClientId
  }
  if (mode === 'offline') {
    google.iOSServerClientId = clientId
  }

  await SocialLogin.initialize({
    google,
  })
  initializedClientId = clientId
  initializedGoogleMode = mode
}

export async function googleSignIn(options = {}) {
  if (ongoingSignInPromise) {
    const elapsedMs = Date.now() - ongoingSignInStartedAtMs
    if (elapsedMs >= 0 && elapsedMs < STALE_SIGNIN_PROMISE_MS) {
      return ongoingSignInPromise
    }
    console.warn('[google-auth] stale sign-in promise detected, forcing a fresh login attempt', { elapsedMs })
    ongoingSignInPromise = null
    ongoingSignInStartedAtMs = 0
  }

  ongoingSignInStartedAtMs = Date.now()
  const signInPromise = (async () => {
    await initGoogleAuth()
    let response
    try {
      // Start with Credential Manager bottom UI so the SocialLogin plugin can fall back to
      // standard UI on NoCredentialException instead of ending the auto-backup login flow.
      // Still force refresh token on this single interactive attempt to avoid a second prompt.
      response = await withTimeout(
        loginGoogleWithOptions({
          forceRefreshToken: true,
          filterByAuthorizedAccounts: false,
          style: 'bottom',
          preferredEmail: options.preferredEmail,
        }),
        GOOGLE_INTERACTIVE_LOGIN_TIMEOUT_MS,
        GOOGLE_LOGIN_TIMEOUT_MESSAGE,
      )
    } catch (error) {
      if (isAccountReauthError(error)) {
        try {
          await SocialLogin.logout({ provider: 'google' })
        } catch {
          // ignore logout failures
        }
        try {
          // Retry once with explicit prompt/standard style after clearing stale auth state.
          response = await withTimeout(
            loginGoogleWithOptions({
              forceRefreshToken: true,
              filterByAuthorizedAccounts: false,
              forcePrompt: true,
              style: 'standard',
              preferredEmail: options.preferredEmail,
            }),
            GOOGLE_INTERACTIVE_LOGIN_TIMEOUT_MS,
            GOOGLE_LOGIN_TIMEOUT_MESSAGE,
          )
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

    if (response.provider !== 'google') {
      throw new Error('Google 登入失敗，請重試')
    }

    if (isServerAuthCodeModeActive()) {
      try {
        if (response.result?.responseType !== 'offline') {
          throw new Error('Google 登入成功但未取得 server auth code')
        }
        const exchanged = await exchangeServerAuthCode(response.result.serverAuthCode)
        const accessToken = exchanged.accessToken
        const refreshToken = exchanged.refreshToken || cachedRefreshToken
        const profileFromToken = exchanged.profile
        const profileFromGoogle = profileFromToken.email || profileFromToken.name || profileFromToken.imageUrl
          ? profileFromToken
          : await fetchGoogleProfileByAccessToken(accessToken)

        updateTokenCache({
          accessToken,
          refreshToken,
          expiresInSec: exchanged.expiresInSec,
          expiresAtMs: exchanged.expiresAtMs,
        })

        cachedProfile = normalizeProfile(profileFromGoogle)
        persistTokenCache()
        return {
          accessToken: cachedAccessToken,
          profile: cachedProfile,
        }
      } catch (offlineError) {
        console.warn('[google-auth] offline auth flow failed, fallback to online mode', offlineError)
        enableOnlineModeFallback(String(offlineError?.message ?? offlineError))
        await initGoogleAuth()

        let onlineResponse = response
        if (onlineResponse.result?.responseType !== 'online' || !extractToken(onlineResponse.result?.accessToken)) {
          onlineResponse = await withTimeout(
            loginGoogleWithOptions({
              forceRefreshToken: true,
              filterByAuthorizedAccounts: false,
              forcePrompt: true,
              style: 'standard',
              preferredEmail: options.preferredEmail,
            }),
            GOOGLE_INTERACTIVE_LOGIN_TIMEOUT_MS,
            GOOGLE_LOGIN_TIMEOUT_MESSAGE,
          )
        }

        if (onlineResponse.result?.responseType !== 'online') {
          throw normalizeGoogleAuthError(offlineError)
        }
        return finishOnlineSignIn(onlineResponse.result)
      }
    }

    if (response.result?.responseType !== 'online') {
      throw new Error('Google 登入失敗，請重試')
    }

    return finishOnlineSignIn(response.result)
  })()
  ongoingSignInPromise = signInPromise

  try {
    return await signInPromise
  } finally {
    if (ongoingSignInPromise === signInPromise) {
      ongoingSignInPromise = null
      ongoingSignInStartedAtMs = 0
    }
  }
}

export async function getAccessToken(options = {}) {
  if (hasUsableCachedAccessToken()) return cachedAccessToken
  const interactive = options?.interactive !== false
  const preferredEmail = String(options?.preferredEmail ?? '').trim()

  if (isServerAuthCodeModeActive()) {
    if (cachedRefreshToken) {
      try {
        const refreshed = await refreshAccessTokenByBackend(cachedRefreshToken)
        updateTokenCache({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || cachedRefreshToken,
          expiresInSec: refreshed.expiresInSec,
          expiresAtMs: refreshed.expiresAtMs,
        })
        if (!cachedProfile?.email) {
          const refreshedProfile = refreshed.profile.email || refreshed.profile.name || refreshed.profile.imageUrl
            ? refreshed.profile
            : await fetchGoogleProfileByAccessToken(refreshed.accessToken)
          if (refreshedProfile) {
            cachedProfile = normalizeProfile(refreshedProfile)
            persistTokenCache()
          }
        }
        return cachedAccessToken
      } catch (error) {
        console.warn('[google-auth] backend refresh failed', error)
      }
    }

    if (interactive) {
      try {
        const signed = await googleSignIn({ preferredEmail })
        return signed.accessToken
      } catch (error) {
        throw normalizeGoogleAuthError(error)
      }
    }
    throw createReauthRequiredError()
  }

  await initGoogleAuth()
  try {
    const token = await tryGetOnlineAccessTokenFromLoggedInSession()
    if (token) return token
  } catch (error) {
    if (!interactive) {
      console.warn('[google-auth] background token fetch failed', error)
      throw createReauthRequiredError(undefined, error)
    }
    console.warn('[google-auth] silent token fetch before interactive sign-in failed', error)
  }

  if (interactive) {
    // Keep manual flows to a single interactive login to avoid duplicate account prompts.
    try {
      const signed = await googleSignIn({ preferredEmail })
      return signed.accessToken
    } catch (error) {
      throw normalizeGoogleAuthError(error)
    }
  }

  throw createReauthRequiredError()
}

export async function reauth(options = {}) {
  const interactive = options?.interactive !== false
  clearTokenCache({ keepRefreshToken: isServerAuthCodeModeActive() })
  return getAccessToken({ interactive })
}

export async function googleSignOut() {
  try {
    await SocialLogin.logout({ provider: 'google' })
  } catch (error) {
    if (!SERVER_AUTH_CODE_FLOW_ENABLED) throw error
    const message = String(error?.message ?? '').toLowerCase()
    if (!message.includes('offline mode')) throw error
  } finally {
    clearTokenCache()
    cachedProfile = null
  }
}

export function getCachedGoogleProfile() {
  return cachedProfile
}

export function hasCachedGoogleAuthSession() {
  const profile = cachedProfile && typeof cachedProfile === 'object' ? cachedProfile : {}
  return Boolean(
    cachedRefreshToken
    || hasUsableCachedAccessToken()
    || profile.email
    || profile.name
    || profile.imageUrl,
  )
}

restoreTokenCache()
