import gplay from 'google-play-scraper'

const REQUEST_TIMEOUT_MS = 10 * 1000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 100

const DEFAULT_APP_ID = String(process.env.VITE_GOOGLE_PLAY_APP_ID ?? process.env.GOOGLE_PLAY_APP_ID ?? '').trim()
const DEFAULT_COUNTRY = normalizeCountry(process.env.GOOGLE_PLAY_COUNTRY) || 'tw'
const DEFAULT_LANG = normalizeLang(process.env.GOOGLE_PLAY_LANG) || 'zh_TW'

const latestVersionCache = new Map()

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res)
  res.status(statusCode).json(payload)
}

function normalizeAppId(rawValue) {
  const appId = String(rawValue ?? '').trim()
  if (!appId) return ''
  if (!/^[A-Za-z0-9._]+$/.test(appId)) return ''
  if (!appId.includes('.')) return ''
  return appId
}

function normalizeCountry(rawValue) {
  const country = String(rawValue ?? '').trim().toLowerCase()
  if (!country) return ''
  if (!/^[a-z]{2}$/.test(country)) return ''
  return country
}

function normalizeLang(rawValue) {
  const lang = String(rawValue ?? '').trim()
  if (!lang) return ''
  if (!/^[A-Za-z_]{2,10}$/.test(lang)) return ''
  return lang
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  let timeoutId = 0
  const timeoutTask = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([task, timeoutTask]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function cacheKeyOf({ appId, country, lang }) {
  return `${appId}::${country}::${lang}`
}

function pruneCache(nowMs = Date.now()) {
  for (const [key, cache] of latestVersionCache.entries()) {
    if (!cache || cache.expiresAtMs <= nowMs) {
      latestVersionCache.delete(key)
    }
  }

  while (latestVersionCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = latestVersionCache.keys().next().value
    if (!oldestKey) break
    latestVersionCache.delete(oldestKey)
  }
}

function getCachedLatestVersion(params) {
  const nowMs = Date.now()
  pruneCache(nowMs)
  const key = cacheKeyOf(params)
  const cache = latestVersionCache.get(key)
  if (!cache || cache.expiresAtMs <= nowMs) return null
  return cache.payload
}

function setCachedLatestVersion(params, payload) {
  const nowMs = Date.now()
  pruneCache(nowMs)
  const key = cacheKeyOf(params)
  latestVersionCache.set(key, {
    expiresAtMs: nowMs + CACHE_TTL_MS,
    payload,
  })
  pruneCache(nowMs)
}

function resolvePlayUrl(appId, rawUrl) {
  const playUrl = String(rawUrl ?? '').trim()
  if (playUrl) return playUrl
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`
}

async function fetchLatestVersionFromPlayApi({ appId, country, lang }) {
  const appInfo = await withTimeout(
    gplay.app({
      appId,
      country,
      lang,
    }),
    REQUEST_TIMEOUT_MS,
    'Google Play API timeout',
  )

  const latestVersion = String(appInfo?.version ?? '').trim()
  if (!latestVersion) {
    throw new Error('Google Play API missing version')
  }

  return {
    appId,
    latestVersion,
    playUrl: resolvePlayUrl(appId, appInfo?.url),
    title: String(appInfo?.title ?? '').trim(),
    source: 'play_api',
    checkedAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Method not allowed' })
    return
  }

  const appId = normalizeAppId(req.query?.appId ?? req.query?.app_id ?? DEFAULT_APP_ID)
  const country = normalizeCountry(req.query?.country ?? DEFAULT_COUNTRY) || DEFAULT_COUNTRY
  const lang = normalizeLang(req.query?.lang ?? DEFAULT_LANG) || DEFAULT_LANG

  if (!appId) {
    sendJson(res, 400, {
      error: 'missing_app_id',
      message: 'appId is required',
    })
    return
  }

  const requestParams = { appId, country, lang }
  const cached = getCachedLatestVersion(requestParams)
  if (cached) {
    sendJson(res, 200, { ...cached, cached: true })
    return
  }

  try {
    const payload = await fetchLatestVersionFromPlayApi(requestParams)
    setCachedLatestVersion(requestParams, payload)
    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 502, {
      error: 'play_api_request_failed',
      message: String(error?.message ?? error ?? 'Google Play API request failed'),
    })
  }
}
