import capacitorConfig from '../../../capacitor.config.json'
import appPackage from '../../../package.json'
import { Capacitor } from '@capacitor/core'
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'

const DEFAULT_UPDATE_MANIFEST_URL = 'https://www.strawmb.com/app-update.json'
const SECONDARY_UPDATE_MANIFEST_URL = 'https://strawmb.com/app-update.json'
const LOCAL_UPDATE_MANIFEST_URL = '/app-update.json'
const LOCAL_UPDATE_MANIFEST_RELATIVE_URL = './app-update.json'
const DEFAULT_PLAY_VERSION_API_URL = 'https://www.strawmb.com/api/app-update/play'
const SECONDARY_PLAY_VERSION_API_URL = 'https://strawmb.com/api/app-update/play'
const LOCAL_PLAY_VERSION_API_URL = '/api/app-update/play'
const LOCAL_PLAY_VERSION_API_RELATIVE_URL = './api/app-update/play'
const UPDATE_CHECK_SUCCESS_TTL_MS = 30 * 60 * 1000
const UPDATE_CHECK_DEGRADED_TTL_MS = 3 * 60 * 1000
const UPDATE_CHECK_FAILURE_TTL_MS = 45 * 1000
const UPDATE_FETCH_TIMEOUT_MS = 6000

const UPDATE_MANIFEST_URLS = resolveUpdateManifestUrls(import.meta.env.VITE_APP_UPDATE_CHECK_URL)
const UPDATE_PLAY_API_URLS = resolvePlayApiUrls(import.meta.env.VITE_APP_UPDATE_PLAY_API_URL)
const PLAY_API_COUNTRY = normalizePlayCountry(import.meta.env.VITE_GOOGLE_PLAY_COUNTRY)
const PLAY_API_LANG = normalizePlayLang(import.meta.env.VITE_GOOGLE_PLAY_LANG)
const APP_ID = String(import.meta.env.VITE_GOOGLE_PLAY_APP_ID ?? capacitorConfig?.appId ?? '').trim()
const DEFAULT_PLAY_URL = APP_ID ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(APP_ID)}` : ''
const CONFIGURED_PLAY_URL = String(import.meta.env.VITE_GOOGLE_PLAY_APP_URL ?? '').trim()
const GOOGLE_PLAY_URL = CONFIGURED_PLAY_URL || DEFAULT_PLAY_URL

let cachedCheckResult = null
let cachedCheckAtMs = 0

function isNativeAndroidPlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function normalizePlayCountry(rawValue) {
  const value = String(rawValue ?? '').trim().toLowerCase()
  if (!value) return ''
  if (!/^[a-z]{2}$/.test(value)) return ''
  return value
}

function normalizePlayLang(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value) return ''
  if (!/^[A-Za-z_]{2,10}$/.test(value)) return ''
  return value
}

function resolveCheckCacheTtlMs(result) {
  if (!result || typeof result !== 'object') return 0
  if (Boolean(result.checkFailed)) return UPDATE_CHECK_FAILURE_TTL_MS
  if (Boolean(result.usedLocalFallback)) return UPDATE_CHECK_DEGRADED_TTL_MS
  return UPDATE_CHECK_SUCCESS_TTL_MS
}

function isLocalManifestUrl(url) {
  const source = String(url ?? '').trim()
  if (!source) return false
  if (source.startsWith('/') || source.startsWith('./')) return true
  if (!/^https?:\/\//i.test(source)) return false
  if (typeof window === 'undefined') return false
  try {
    const parsed = new URL(source)
    return parsed.origin === window.location.origin
  } catch {
    return false
  }
}

function getCurrentAppVersion() {
  return String(appPackage?.version ?? '0.0.0')
}

function resolveUpdateManifestUrls(rawValue) {
  const candidates = String(rawValue ?? '')
    .split(/[,\n]/)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)

  if (!candidates.length) {
    candidates.push(DEFAULT_UPDATE_MANIFEST_URL, SECONDARY_UPDATE_MANIFEST_URL)
  }
  candidates.push(LOCAL_UPDATE_MANIFEST_URL, LOCAL_UPDATE_MANIFEST_RELATIVE_URL)

  const deduped = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    deduped.push(candidate)
  }
  return deduped
}

function resolvePlayApiUrls(rawValue) {
  const candidates = String(rawValue ?? '')
    .split(/[,\n]/)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)

  if (!candidates.length) {
    candidates.push(DEFAULT_PLAY_VERSION_API_URL, SECONDARY_PLAY_VERSION_API_URL)
  }
  if (Boolean(import.meta.env.DEV)) {
    candidates.push(LOCAL_PLAY_VERSION_API_URL, LOCAL_PLAY_VERSION_API_RELATIVE_URL)
  }

  const deduped = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    deduped.push(candidate)
  }
  return deduped
}

function summarizeRawErrorText(text, maxLength = 180) {
  const compact = String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) return ''
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength)}...`
}

function isLikelyHtmlResponse(text) {
  const source = String(text ?? '').trim().toLowerCase()
  if (!source) return false
  return /<!doctype html|<html|<head|<title|<body|strawmoneybook/.test(source)
}

function resolveHttpErrorDetail(responseText) {
  const text = String(responseText ?? '').trim()
  if (!text) return ''

  try {
    const payload = JSON.parse(text)
    if (payload && typeof payload === 'object') {
      const fields = [payload.error, payload.message, payload.details]
        .map((item) => summarizeRawErrorText(item, 140))
        .filter(Boolean)
      if (fields.length) {
        return fields.join(' | ')
      }
    }
  } catch {
    // ignore
  }

  return summarizeRawErrorText(text)
}

function normalizeUpdateFetchErrorMessage(error) {
  const raw = String(error?.message ?? error ?? '').trim()
  if (!raw) return '未知錯誤'
  if (/回應為 html|收到 html|api_not_deployed_html/i.test(raw)) {
    return 'Play 版本 API 未部署或 URL 指到前端頁面（非 JSON）'
  }
  if (/play_app_not_found|app not found/i.test(raw)) {
    return APP_ID
      ? `Google Play 找不到此 App（${APP_ID}）`
      : 'Google Play 找不到此 App'
  }
  if (/missing_app_id|appid is required/i.test(raw)) {
    return '未設定 Google Play App ID（VITE_GOOGLE_PLAY_APP_ID）'
  }
  if (/http\s*404/i.test(raw) && /play_api|api\/app-update\/play/i.test(raw)) {
    return 'Play 版本 API 路徑不存在（HTTP 404）'
  }
  if (/http\s*(401|403)|unauthorized|forbidden/i.test(raw)) {
    return 'Play 版本 API 無權限存取'
  }
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed|ecconn|enotfound|connection refused/i.test(raw)) {
    return '網路連線失敗或服務無回應'
  }
  if (/timeout|逾時|timed out/i.test(raw)) {
    return '更新檢查逾時'
  }
  return raw
}

function normalizePlayCoreErrorMessage(error) {
  const raw = String(error?.message ?? error ?? '').trim()
  if (!raw) return 'Play Core 錯誤'
  if (/timeout|逾時|timed out/i.test(raw)) {
    return 'Play Core 檢查逾時'
  }
  if (/plugin.*not implemented|not implemented|unimplemented|does not have web implementation|unavailable|not available/i.test(raw)) {
    return 'Play Core 目前不可用'
  }
  return raw
}

function isNetworkLikeUpdateError(message) {
  const text = String(message ?? '').trim().toLowerCase()
  if (!text) return false
  return /網路連線失敗|服務無回應|failed to fetch|networkerror|load failed|fetch failed|network request failed|timeout|timed out|ecconn|enotfound|connection refused/.test(text)
}

function buildPlayApiFailureMessage(errorItems = []) {
  if (!Array.isArray(errorItems) || !errorItems.length) {
    return '無法取得 Play 版本資訊'
  }

  const messages = errorItems
    .map((item) => String(item?.message ?? '').trim())
    .filter(Boolean)

  if (!messages.length) {
    return '無法取得 Play 版本資訊'
  }

  if (messages.some((item) => item.includes('未設定 Google Play App ID'))) {
    return '未設定 Google Play App ID（請設定 VITE_GOOGLE_PLAY_APP_ID）'
  }

  if (messages.some((item) => item.includes('Google Play 找不到此 App'))) {
    return APP_ID
      ? `Google Play 找不到此 App（${APP_ID}），請確認 Play 上架狀態與 appId`
      : 'Google Play 找不到此 App，請確認 appId'
  }

  if (messages.every((item) => item.includes('Play 版本 API 未部署或 URL 指到前端頁面（非 JSON）'))) {
    return 'Play 版本 API 未部署或 URL 錯誤，請設定 VITE_APP_UPDATE_PLAY_API_URL 指向可用的 /api/app-update/play'
  }

  if (messages.every((item) => item.includes('Play 版本 API 路徑不存在（HTTP 404）'))) {
    return 'Play 版本 API 路徑不存在（HTTP 404），請確認 VITE_APP_UPDATE_PLAY_API_URL 與後端部署'
  }

  if (messages.every((item) => isNetworkLikeUpdateError(item))) {
    return '網路連線失敗或 Play 版本服務無回應'
  }

  return errorItems
    .map(({ url, message }) => `${url}: ${message}`)
    .join(' | ')
}

function parseVersionParts(versionText) {
  const groups = String(versionText ?? '')
    .trim()
    .replace(/^v/i, '')
    .match(/\d+/g)
  if (!groups?.length) return []
  return groups
    .map((part) => Number.parseInt(String(part), 10))
    .map((part) => (Number.isFinite(part) ? Math.max(0, part) : 0))
}

function isComparableVersion(versionText) {
  return parseVersionParts(versionText).length > 0
}

export function compareAppVersions(leftVersion, rightVersion) {
  const left = parseVersionParts(leftVersion)
  const right = parseVersionParts(rightVersion)
  const length = Math.max(left.length, right.length, 3)
  for (let index = 0; index < length; index += 1) {
    const l = Number(left[index] ?? 0)
    const r = Number(right[index] ?? 0)
    if (l > r) return 1
    if (l < r) return -1
  }
  return 0
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

function normalizeManifestPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {}
  const latestVersion = String(payload.latestVersion ?? payload.latest_version ?? '').trim()
  const message = String(payload.message ?? payload.note ?? payload.releaseNotes ?? payload.release_notes ?? '').trim()
  const playUrl = String(payload.playUrl ?? payload.play_url ?? GOOGLE_PLAY_URL).trim() || GOOGLE_PLAY_URL
  return {
    latestVersion,
    message,
    playUrl,
  }
}

function normalizePlayApiPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {}
  const latestVersion = String(payload.latestVersion ?? payload.latest_version ?? payload.version ?? '').trim()
  const message = String(payload.message ?? payload.note ?? '').trim()
  const playUrl = String(payload.playUrl ?? payload.play_url ?? payload.url ?? GOOGLE_PLAY_URL).trim() || GOOGLE_PLAY_URL
  return {
    latestVersion,
    message,
    playUrl,
  }
}

function normalizePlayCorePayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {}
  const updateAvailability = Number(payload.updateAvailability)
  if (!Number.isFinite(updateAvailability)) {
    return null
  }

  if (updateAvailability === AppUpdateAvailability.UNKNOWN) {
    return null
  }

  const hasUpdate = updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE
    || updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS
  const latestVersion = String(payload.availableVersionCode ?? '').trim()
  const stalenessDays = Number(payload.clientVersionStalenessDays)
  const messageParts = []
  if (updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS) {
    messageParts.push('更新安裝進行中')
  }
  if (Number.isFinite(stalenessDays) && stalenessDays >= 0) {
    messageParts.push(`已可更新 ${stalenessDays} 天`)
  }

  return {
    hasUpdate,
    latestVersion,
    message: messageParts.join('，'),
    playUrl: GOOGLE_PLAY_URL,
  }
}

function appendQuery(url, query = {}) {
  const target = String(url ?? '').trim()
  if (!target) return ''

  const [rawPath, rawHash = ''] = target.split('#', 2)
  const [basePath, existingQuery = ''] = rawPath.split('?', 2)
  const search = new URLSearchParams(existingQuery)

  for (const [key, value] of Object.entries(query)) {
    const normalizedKey = String(key ?? '').trim()
    const normalizedValue = String(value ?? '').trim()
    if (!normalizedKey || !normalizedValue) continue
    if (search.has(normalizedKey)) continue
    search.set(normalizedKey, normalizedValue)
  }

  const queryText = search.toString()
  const hashText = rawHash ? `#${rawHash}` : ''
  return `${basePath}${queryText ? `?${queryText}` : ''}${hashText}`
}

async function fetchJsonPayload(url, timeoutMessage, emptyMessage, invalidMessage) {
  const response = await withTimeout(
    fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }),
    UPDATE_FETCH_TIMEOUT_MS,
    timeoutMessage,
  )

  const responseText = await response.text()
  if (!response.ok) {
    const detail = resolveHttpErrorDetail(responseText)
    throw new Error(detail ? `HTTP ${response.status} ${detail}` : `HTTP ${response.status}`)
  }

  if (!responseText.trim()) {
    throw new Error(emptyMessage)
  }

  try {
    return JSON.parse(responseText)
  } catch {
    if (isLikelyHtmlResponse(responseText)) {
      throw new Error('api_not_deployed_html: 回應為 HTML')
    }
    throw new Error(`${invalidMessage}${responseText ? `: ${summarizeRawErrorText(responseText, 80)}` : ''}`)
  }
}

async function fetchUpdateManifestPayload(url) {
  return fetchJsonPayload(
    url,
    '檢查更新逾時',
    '更新資訊為空',
    '更新資訊格式錯誤（非 JSON）',
  )
}

async function fetchPlayApiPayload(url) {
  return fetchJsonPayload(
    url,
    'Play API 檢查逾時',
    'Play API 回應為空',
    'Play API 回應格式錯誤（非 JSON）',
  )
}

async function fetchLatestVersionFromPlayCore() {
  if (!isNativeAndroidPlatform()) {
    return {
      payload: null,
      errorMessage: '',
    }
  }

  try {
    const appUpdateInfo = await withTimeout(
      AppUpdate.getAppUpdateInfo(),
      UPDATE_FETCH_TIMEOUT_MS,
      'Play Core 檢查逾時',
    )
    const payload = normalizePlayCorePayload(appUpdateInfo)
    if (!payload) {
      return {
        payload: null,
        errorMessage: 'Play Core 回傳未知狀態',
      }
    }
    return {
      payload,
      errorMessage: '',
    }
  } catch (error) {
    return {
      payload: null,
      errorMessage: normalizePlayCoreErrorMessage(error),
    }
  }
}

async function fetchLatestVersionFromPlayApi() {
  if (!APP_ID) {
    return {
      payload: null,
      errorMessage: '未設定 Google Play App ID（請設定 VITE_GOOGLE_PLAY_APP_ID）',
    }
  }
  if (!UPDATE_PLAY_API_URLS.length) {
    return {
      payload: null,
      errorMessage: '未設定 Play 版本 API（請設定 VITE_APP_UPDATE_PLAY_API_URL）',
    }
  }

  const query = {
    appId: APP_ID,
    country: PLAY_API_COUNTRY,
    lang: PLAY_API_LANG,
  }

  const errors = []
  for (const endpoint of UPDATE_PLAY_API_URLS) {
    const url = appendQuery(endpoint, query)
    if (!url) continue
    try {
      const payload = normalizePlayApiPayload(await fetchPlayApiPayload(url))
      if (!payload.latestVersion) {
        errors.push({
          url,
          message: '缺少 latestVersion',
        })
        continue
      }
      if (!isComparableVersion(payload.latestVersion)) {
        errors.push({
          url,
          message: `latestVersion 不可比較（${payload.latestVersion}）`,
        })
        continue
      }
      return {
        payload,
        errorMessage: '',
      }
    } catch (error) {
      const normalizedError = normalizeUpdateFetchErrorMessage(error)
      const errorMessage = /^HTTP\s*404\b/i.test(normalizedError)
        ? 'Play 版本 API 路徑不存在（HTTP 404）'
        : normalizedError
      errors.push({
        url,
        message: errorMessage,
      })
    }
  }

  const errorMessage = buildPlayApiFailureMessage(errors)
  if (errorMessage) {
    console.warn('[app-update] fetch from Play API failed', errorMessage)
  }
  return {
    payload: null,
    errorMessage,
  }
}

function shouldUsePlayOnlyStrategy() {
  const override = String(import.meta.env.VITE_APP_UPDATE_STRATEGY ?? '').trim().toLowerCase()
  if (override === 'manifest') return false
  if (override === 'play_only') return true
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function checkForAppUpdate(options = {}) {
  const force = Boolean(options?.force)
  const now = Date.now()
  if (!force && cachedCheckResult) {
    const ttlMs = resolveCheckCacheTtlMs(cachedCheckResult)
    if (ttlMs > 0 && now - cachedCheckAtMs <= ttlMs) {
      return cachedCheckResult
    }
  }

  const currentVersion = getCurrentAppVersion()
  const usePlayOnly = shouldUsePlayOnlyStrategy()
  let playCoreErrorMessage = ''

  if (isNativeAndroidPlatform()) {
    const { payload: playCorePayload, errorMessage } = await fetchLatestVersionFromPlayCore()
    if (playCorePayload) {
      const result = {
        hasUpdate: Boolean(playCorePayload.hasUpdate),
        checkFailed: false,
        usedLocalFallback: false,
        source: 'play_core',
        currentVersion,
        latestVersion: playCorePayload.latestVersion,
        playUrl: playCorePayload.playUrl || GOOGLE_PLAY_URL,
        message: playCorePayload.message,
        checkedAt: new Date().toISOString(),
      }
      cachedCheckResult = result
      cachedCheckAtMs = now
      return result
    }
    playCoreErrorMessage = String(errorMessage ?? '').trim()
  }

  const { payload: playPayload, errorMessage: playApiErrorMessage } = await fetchLatestVersionFromPlayApi()
  if (playPayload?.latestVersion) {
    const hasUpdate = compareAppVersions(playPayload.latestVersion, currentVersion) > 0
    const result = {
      hasUpdate,
      checkFailed: false,
      usedLocalFallback: false,
      source: 'play_api',
      currentVersion,
      latestVersion: playPayload.latestVersion,
      playUrl: playPayload.playUrl,
      message: playPayload.message,
      checkedAt: new Date().toISOString(),
    }
    cachedCheckResult = result
    cachedCheckAtMs = now
    return result
  }

  if (usePlayOnly) {
    const combinedFailureMessage = [playCoreErrorMessage, playApiErrorMessage]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(' | ')
    const result = {
      hasUpdate: false,
      checkFailed: true,
      usedLocalFallback: false,
      source: isNativeAndroidPlatform() ? 'play_core' : 'play_api',
      currentVersion,
      latestVersion: '',
      playUrl: GOOGLE_PLAY_URL,
      message: combinedFailureMessage || '無法取得 Play 版本資訊',
      checkedAt: new Date().toISOString(),
    }
    cachedCheckResult = result
    cachedCheckAtMs = now
    return result
  }

  if (!UPDATE_MANIFEST_URLS.length) {
    const result = {
      hasUpdate: false,
      checkFailed: true,
      usedLocalFallback: false,
      source: 'manifest',
      currentVersion,
      latestVersion: '',
      playUrl: GOOGLE_PLAY_URL,
      message: '',
      checkedAt: new Date().toISOString(),
    }
    cachedCheckResult = result
    cachedCheckAtMs = now
    return result
  }

  const errors = []
  const remoteErrors = []
  for (const url of UPDATE_MANIFEST_URLS) {
    const isLocalUrl = isLocalManifestUrl(url)
    try {
      const payload = normalizeManifestPayload(await fetchUpdateManifestPayload(url))
      if (!payload.latestVersion) {
        errors.push(`${url}: 缺少 latestVersion`)
        if (!isLocalUrl) {
          remoteErrors.push(`${url}: 缺少 latestVersion`)
        }
        continue
      }
      if (!isComparableVersion(payload.latestVersion)) {
        const errorText = `${url}: latestVersion 不可比較（${payload.latestVersion}）`
        errors.push(errorText)
        if (!isLocalUrl) {
          remoteErrors.push(errorText)
        }
        continue
      }

      const hasUpdate = compareAppVersions(payload.latestVersion, currentVersion) > 0
      const usedLocalFallback = isLocalUrl && remoteErrors.length > 0
      const result = {
        hasUpdate,
        checkFailed: false,
        usedLocalFallback,
        source: isLocalUrl ? 'local_manifest' : 'manifest',
        currentVersion,
        latestVersion: payload.latestVersion,
        playUrl: payload.playUrl,
        message: payload.message,
        checkedAt: new Date().toISOString(),
      }
      cachedCheckResult = result
      cachedCheckAtMs = now
      return result
    } catch (error) {
      const message = normalizeUpdateFetchErrorMessage(error)
      const errorText = `${url}: ${message}`
      errors.push(errorText)
      if (!isLocalUrl) {
        remoteErrors.push(errorText)
      }
    }
  }

  const allNetworkLike = errors.length > 0
    && errors.every((item) => isNetworkLikeUpdateError(item))
  const fallbackMessage = allNetworkLike
    ? '更新檢查服務暫時無法連線'
    : errors.join(' | ')

  const result = {
    hasUpdate: false,
    checkFailed: true,
    usedLocalFallback: false,
    source: 'manifest',
    currentVersion,
    latestVersion: '',
    playUrl: GOOGLE_PLAY_URL,
    message: fallbackMessage,
    checkedAt: new Date().toISOString(),
  }
  cachedCheckResult = result
  cachedCheckAtMs = now
  return result
}

export function getGooglePlayAppUrl() {
  return GOOGLE_PLAY_URL
}

export function openGooglePlayStore(url = GOOGLE_PLAY_URL) {
  const targetUrl = String(url ?? '').trim()
  if (isNativeAndroidPlatform()) {
    void AppUpdate.openAppStore(APP_ID ? { androidPackageName: APP_ID } : undefined).catch((error) => {
      console.warn('[app-update] open Play Store via Play Core failed', error)
      if (!targetUrl || typeof window === 'undefined') return
      const opened = window.open(targetUrl, '_blank', 'noopener')
      if (!opened) {
        window.location.href = targetUrl
      }
    })
    return true
  }
  if (!targetUrl || typeof window === 'undefined') return false
  const opened = window.open(targetUrl, '_blank', 'noopener')
  if (!opened) {
    window.location.href = targetUrl
  }
  return true
}
