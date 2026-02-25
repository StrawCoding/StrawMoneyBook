import capacitorConfig from '../../../capacitor.config.json'
import appPackage from '../../../package.json'

const DEFAULT_UPDATE_MANIFEST_URL = 'https://www.strawmb.com/app-update.json'
const SECONDARY_UPDATE_MANIFEST_URL = 'https://strawmb.com/app-update.json'
const LOCAL_UPDATE_MANIFEST_URL = '/app-update.json'
const LOCAL_UPDATE_MANIFEST_RELATIVE_URL = './app-update.json'
const UPDATE_CHECK_SUCCESS_TTL_MS = 30 * 60 * 1000
const UPDATE_CHECK_DEGRADED_TTL_MS = 3 * 60 * 1000
const UPDATE_CHECK_FAILURE_TTL_MS = 45 * 1000
const UPDATE_FETCH_TIMEOUT_MS = 6000

const UPDATE_MANIFEST_URLS = resolveUpdateManifestUrls(import.meta.env.VITE_APP_UPDATE_CHECK_URL)
const APP_ID = String(import.meta.env.VITE_GOOGLE_PLAY_APP_ID ?? capacitorConfig?.appId ?? '').trim()
const DEFAULT_PLAY_URL = APP_ID ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(APP_ID)}` : ''
const CONFIGURED_PLAY_URL = String(import.meta.env.VITE_GOOGLE_PLAY_APP_URL ?? '').trim()
const GOOGLE_PLAY_URL = CONFIGURED_PLAY_URL || DEFAULT_PLAY_URL

let cachedCheckResult = null
let cachedCheckAtMs = 0

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

function normalizeUpdateFetchErrorMessage(error) {
  const raw = String(error?.message ?? error ?? '').trim()
  if (!raw) return '未知錯誤'
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(raw)) {
    return '網路連線失敗或服務無回應'
  }
  return raw
}

function isNetworkLikeUpdateError(message) {
  const text = String(message ?? '').trim().toLowerCase()
  if (!text) return false
  return /網路連線失敗|服務無回應|failed to fetch|networkerror|load failed|fetch failed|network request failed/.test(text)
}

function parseVersionParts(versionText) {
  return String(versionText ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(String(part).replace(/[^\d].*$/, ''), 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
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

async function fetchUpdateManifestPayload(url) {
  const response = await withTimeout(
    fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }),
    UPDATE_FETCH_TIMEOUT_MS,
    '檢查更新逾時',
  )
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const responseText = await response.text()
  if (!responseText.trim()) {
    throw new Error('更新資訊為空')
  }

  try {
    return JSON.parse(responseText)
  } catch {
    throw new Error('更新資訊格式錯誤（非 JSON）')
  }
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
  if (!UPDATE_MANIFEST_URLS.length) {
    const result = {
      hasUpdate: false,
      checkFailed: true,
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

      const hasUpdate = compareAppVersions(payload.latestVersion, currentVersion) > 0
      const usedLocalFallback = isLocalUrl && remoteErrors.length > 0
      const result = {
        hasUpdate,
        checkFailed: false,
        usedLocalFallback,
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
  if (!targetUrl || typeof window === 'undefined') return false
  const opened = window.open(targetUrl, '_blank', 'noopener')
  if (!opened) {
    window.location.href = targetUrl
  }
  return true
}
