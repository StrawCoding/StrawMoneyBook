import capacitorConfig from '../../../capacitor.config.json'
import appPackage from '../../../package.json'

const DEFAULT_UPDATE_MANIFEST_URL = 'https://www.strawmb.com/app-update.json'
const SECONDARY_UPDATE_MANIFEST_URL = 'https://strawmb.com/app-update.json'
const UPDATE_CHECK_TTL_MS = 30 * 60 * 1000
const UPDATE_FETCH_TIMEOUT_MS = 6000

const UPDATE_MANIFEST_URLS = resolveUpdateManifestUrls(import.meta.env.VITE_APP_UPDATE_CHECK_URL)
const APP_ID = String(import.meta.env.VITE_GOOGLE_PLAY_APP_ID ?? capacitorConfig?.appId ?? '').trim()
const DEFAULT_PLAY_URL = APP_ID ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(APP_ID)}` : ''
const CONFIGURED_PLAY_URL = String(import.meta.env.VITE_GOOGLE_PLAY_APP_URL ?? '').trim()
const GOOGLE_PLAY_URL = CONFIGURED_PLAY_URL || DEFAULT_PLAY_URL

let cachedCheckResult = null
let cachedCheckAtMs = 0

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

  const deduped = []
  const seen = new Set()
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    deduped.push(candidate)
  }
  return deduped
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
  if (!force && cachedCheckResult && now - cachedCheckAtMs <= UPDATE_CHECK_TTL_MS) {
    return cachedCheckResult
  }

  const currentVersion = getCurrentAppVersion()
  if (!UPDATE_MANIFEST_URLS.length) {
    const result = {
      hasUpdate: false,
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
  for (const url of UPDATE_MANIFEST_URLS) {
    try {
      const payload = normalizeManifestPayload(await fetchUpdateManifestPayload(url))
      if (!payload.latestVersion) {
        errors.push(`${url}: 缺少 latestVersion`)
        continue
      }

      const hasUpdate = compareAppVersions(payload.latestVersion, currentVersion) > 0
      const result = {
        hasUpdate,
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
      const message = String(error?.message ?? '').trim() || '未知錯誤'
      errors.push(`${url}: ${message}`)
    }
  }

  const result = {
    hasUpdate: false,
    currentVersion,
    latestVersion: '',
    playUrl: GOOGLE_PLAY_URL,
    message: errors.join(' | '),
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
