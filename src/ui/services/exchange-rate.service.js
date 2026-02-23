import { Capacitor } from '@capacitor/core'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'

const EXCHANGE_RATE_SETTINGS_KEY = 'exchange_rate.settings'
const EXCHANGE_RATE_SNAPSHOT_KEY = 'exchange_rate.snapshot'
const CBC_FILE_CODE_DAILY = 'BP01D01'
const CBC_API_BASE_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get'
const CBC_API_URL = `https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=${CBC_FILE_CODE_DAILY}`
const EXCHANGE_RATE_PROXY_PATH = '/api/exchange-rate/cbc'
const EXCHANGE_RATE_PROXY_DEFAULT_ORIGIN = 'https://www.strawmb.com'
const EXCHANGE_RATE_PROXY_SECONDARY_ORIGIN = 'https://strawmb.com'
const DEFAULT_SYNC_INTERVAL_HOURS = 24
const FETCH_TIMEOUT_MS = 20000
const FETCH_RETRY_COUNT = 2
const FETCH_RETRY_BASE_DELAY_MS = 450
const EXCHANGE_RATE_PROXY_FALLBACK_ORIGINS = resolveExchangeRateProxyFallbackOrigins()
const EXCHANGE_RATE_PROXY_ENDPOINTS = resolveExchangeRateProxyEndpoints(import.meta.env.VITE_EXCHANGE_RATE_API_BASE_URL)

function ensureLedgerId(ledgerId) {
  if (!ledgerId) {
    throw new Error('缺少帳本 ID')
  }
}

function buildDefaultExchangeRateSettings() {
  return {
    autoSyncEnabled: false,
    provider: 'cbc',
    syncIntervalHours: DEFAULT_SYNC_INTERVAL_HOURS,
  }
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

function normalizeProxyEndpoint(candidate) {
  const raw = String(candidate ?? '').trim()
  if (!raw) return ''

  if (raw.startsWith('/')) {
    return raw
  }

  if (!isAbsoluteHttpUrl(raw)) return ''
  if (/\/api\/exchange-rate\/cbc(?:[/?#]|$)/i.test(raw)) return raw
  return `${raw.replace(/\/+$/, '')}${EXCHANGE_RATE_PROXY_PATH}`
}

function resolveExchangeRateProxyFallbackOrigins() {
  const origins = []

  const explicitOrigin = String(import.meta.env.VITE_EXCHANGE_RATE_API_ORIGIN ?? '').trim()
  if (isAbsoluteHttpUrl(explicitOrigin)) {
    origins.push(explicitOrigin)
  }

  const siteUrl = String(import.meta.env.VITE_PRIVACY_POLICY_URL ?? '').trim()
  if (isAbsoluteHttpUrl(siteUrl)) {
    try {
      origins.push(new URL(siteUrl).origin)
    } catch {
      // ignore parse failures
    }
  }

  origins.push(EXCHANGE_RATE_PROXY_DEFAULT_ORIGIN, EXCHANGE_RATE_PROXY_SECONDARY_ORIGIN)

  const deduped = []
  const seen = new Set()
  for (const origin of origins) {
    const normalized = String(origin ?? '').trim().replace(/\/+$/, '')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }
  return deduped
}

function resolveExchangeRateProxyEndpoints(rawValue) {
  const configured = String(rawValue ?? '')
    .split(/[,\n]/)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)

  const defaults = Capacitor.isNativePlatform()
    ? EXCHANGE_RATE_PROXY_FALLBACK_ORIGINS
    : [EXCHANGE_RATE_PROXY_PATH, ...EXCHANGE_RATE_PROXY_FALLBACK_ORIGINS]

  const candidates = configured.length ? configured : defaults
  const deduped = []
  const seen = new Set()
  for (const candidate of candidates) {
    const endpoint = normalizeProxyEndpoint(candidate)
    if (!endpoint || seen.has(endpoint)) continue
    seen.add(endpoint)
    deduped.push(endpoint)
  }
  return deduped
}

function appendFileNameQuery(url, fileName = CBC_FILE_CODE_DAILY) {
  const target = String(url ?? '').trim()
  if (!target) return ''
  if (/[?&]filename=/i.test(target)) return target
  const joiner = target.includes('?') ? '&' : '?'
  return `${target}${joiner}FileName=${encodeURIComponent(String(fileName ?? '').trim() || CBC_FILE_CODE_DAILY)}`
}

function normalizeExchangeRateSettings(raw) {
  const base = buildDefaultExchangeRateSettings()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    autoSyncEnabled: Boolean(raw.autoSyncEnabled),
    provider: String(raw.provider ?? 'cbc').trim() || 'cbc',
    syncIntervalHours: Math.max(1, Number(raw.syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS) || DEFAULT_SYNC_INTERVAL_HOURS),
  }
}

function buildDefaultExchangeRateSnapshot() {
  return {
    provider: 'cbc',
    sourceFileCode: CBC_FILE_CODE_DAILY,
    syncedAt: '',
    effectiveDate: '',
    dataUpdatedAt: '',
    rates: { USD: 1 },
  }
}

function normalizeCurrencyCodeForRate(code) {
  const raw = String(code ?? '').trim().toUpperCase()
  if (!raw) return ''
  if (raw === 'NTD') return 'TWD'
  if (/^[A-Z]{3}$/.test(raw)) return raw
  return ''
}

function normalizeRateMap(rawRates) {
  const rates = { USD: 1 }
  if (!rawRates || typeof rawRates !== 'object') return rates
  for (const [key, value] of Object.entries(rawRates)) {
    const currency = normalizeCurrencyCodeForRate(key)
    if (!currency) continue
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) continue
    rates[currency] = numeric
  }
  rates.USD = 1
  return rates
}

function normalizeExchangeRateSnapshot(raw) {
  const base = buildDefaultExchangeRateSnapshot()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    provider: String(raw.provider ?? 'cbc').trim() || 'cbc',
    sourceFileCode: String(raw.sourceFileCode ?? CBC_FILE_CODE_DAILY).trim() || CBC_FILE_CODE_DAILY,
    syncedAt: String(raw.syncedAt ?? ''),
    effectiveDate: String(raw.effectiveDate ?? ''),
    dataUpdatedAt: String(raw.dataUpdatedAt ?? ''),
    rates: normalizeRateMap(raw.rates),
  }
}

function parseDateKeyToIso(dateKey) {
  const raw = String(dateKey ?? '').trim()
  if (!/^\d{8}$/.test(raw)) return ''
  const year = raw.slice(0, 4)
  const month = raw.slice(4, 6)
  const day = raw.slice(6, 8)
  return `${year}-${month}-${day}`
}

function parsePairFromLabel(label) {
  const text = String(label ?? '')
  const matched = text.match(/([A-Z]{3})\s*\/\s*([A-Z]{3})/)
  if (!matched) return null
  const left = normalizeCurrencyCodeForRate(matched[1])
  const right = normalizeCurrencyCodeForRate(matched[2])
  if (!left || !right) return null
  return { left, right }
}

function readLatestValidRow(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return null
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (!Array.isArray(row) || !row.length) continue
    const hasValidRate = row.some((cell, cellIndex) => {
      if (cellIndex === 0) return false
      const text = String(cell ?? '').trim()
      if (!text || text === '-') return false
      const numeric = Number(text)
      return Number.isFinite(numeric) && numeric > 0
    })
    if (hasValidRate) return row
  }
  return null
}

function parseCbcRatesPayload(payload) {
  const rows = Array.isArray(payload?.data?.dataSets) ? payload.data.dataSets : []
  const columns = Array.isArray(payload?.data?.structure?.Table1)
    ? payload.data.structure.Table1.map((item) => String(item?.data ?? '').trim())
    : []

  const latestRow = readLatestValidRow(rows)
  if (!latestRow) {
    throw new Error('央行匯率資料為空')
  }

  const rates = { USD: 1 }
  const maxIndex = Math.min(latestRow.length - 1, columns.length)
  for (let index = 1; index <= maxIndex; index += 1) {
    const rawValue = String(latestRow[index] ?? '').trim()
    if (!rawValue || rawValue === '-') continue
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue) || numericValue <= 0) continue

    const pair = parsePairFromLabel(columns[index - 1])
    if (!pair) continue

    if (pair.left === 'USD') {
      rates[pair.right] = 1 / numericValue
      continue
    }

    if (pair.right === 'USD') {
      rates[pair.left] = numericValue
    }
  }

  return {
    provider: 'cbc',
    sourceFileCode: CBC_FILE_CODE_DAILY,
    syncedAt: new Date().toISOString(),
    effectiveDate: parseDateKeyToIso(latestRow[0]),
    dataUpdatedAt: String(payload?.meta?.last_updated ?? ''),
    rates: normalizeRateMap(rates),
  }
}

function withTimeout(task, timeoutMs, timeoutMessage) {
  let timeoutId = null
  const timeoutTask = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([task, timeoutTask]).finally(() => {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
  })
}

function normalizeFetchErrorMessage(error) {
  const message = String(error?.message ?? error ?? '').trim()
  if (!message) return '未知錯誤'
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)) {
    return '網路連線失敗或服務無回應'
  }
  return message
}

function waitFor(delayMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

async function fetchJsonPayload(url) {
  const response = await withTimeout(
    fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }),
    FETCH_TIMEOUT_MS,
    '匯率同步逾時',
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const text = await response.text()
  if (!text.trim()) {
    throw new Error('回應為空')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('回應格式錯誤（非 JSON）')
  }
}

async function fetchJsonPayloadWithRetry(url, sourceLabel = '') {
  let lastError = null
  for (let attempt = 1; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    try {
      return await fetchJsonPayload(url)
    } catch (error) {
      lastError = error
      if (attempt < FETCH_RETRY_COUNT) {
        await waitFor(FETCH_RETRY_BASE_DELAY_MS * attempt)
      }
    }
  }
  const normalizedMessage = normalizeFetchErrorMessage(lastError)
  throw new Error(`${sourceLabel || url}：${normalizedMessage}`)
}

async function fetchCbcRatesPayload() {
  const errors = []

  for (const endpoint of EXCHANGE_RATE_PROXY_ENDPOINTS) {
    const url = appendFileNameQuery(endpoint, CBC_FILE_CODE_DAILY)
    try {
      return await fetchJsonPayloadWithRetry(url, `代理 ${url}`)
    } catch (error) {
      errors.push(String(error?.message ?? '').trim() || `代理 ${url}：未知錯誤`)
    }
  }

  try {
    const cbcUrl = appendFileNameQuery(CBC_API_BASE_URL, CBC_FILE_CODE_DAILY)
    return await fetchJsonPayloadWithRetry(cbcUrl, `央行 ${CBC_API_URL}`)
  } catch (error) {
    errors.push(String(error?.message ?? '').trim() || `央行 ${CBC_API_URL}：未知錯誤`)
  }

  const message = errors.join(' | ')
  if (/網路連線失敗或服務無回應/i.test(message)) {
    throw new Error(`匯率同步失敗：${message}`)
  }
  throw new Error(`匯率同步失敗：${message || '未知錯誤'}`)
}

function hasUsableHistoricalRates(snapshot) {
  const normalized = normalizeExchangeRateSnapshot(snapshot)
  if (!normalized.syncedAt) return false
  const currencyCodes = Object.entries(normalized.rates ?? {})
    .filter(([currency, value]) => currency !== 'USD' && Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([currency]) => currency)
  return currencyCodes.length > 0
}

export async function getExchangeRateSettings(ledgerId) {
  ensureLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, EXCHANGE_RATE_SETTINGS_KEY)
  return normalizeExchangeRateSettings(stored)
}

export async function updateExchangeRateSettings(ledgerId, patch = {}) {
  ensureLedgerId(ledgerId)
  const current = await getExchangeRateSettings(ledgerId)
  const next = normalizeExchangeRateSettings({ ...current, ...patch })
  await setSetting(ledgerId, EXCHANGE_RATE_SETTINGS_KEY, next)
  return next
}

export async function getExchangeRateSnapshot(ledgerId) {
  ensureLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, EXCHANGE_RATE_SNAPSHOT_KEY)
  return normalizeExchangeRateSnapshot(stored)
}

export async function syncCbcExchangeRateSnapshot(ledgerId) {
  ensureLedgerId(ledgerId)
  const previousSnapshot = await getExchangeRateSnapshot(ledgerId)
  try {
    const payload = await fetchCbcRatesPayload()
    const snapshot = parseCbcRatesPayload(payload)
    await setSetting(ledgerId, EXCHANGE_RATE_SNAPSHOT_KEY, snapshot)
    return snapshot
  } catch (error) {
    if (hasUsableHistoricalRates(previousSnapshot)) {
      console.warn('[exchange-rate] sync failed, fallback to previous snapshot', error)
      return {
        ...previousSnapshot,
        syncFallback: true,
      }
    }
    throw error
  }
}

export function resolveCrossExchangeRate(rates, fromCurrency, toCurrency) {
  const from = normalizeCurrencyCode(fromCurrency, 'TWD')
  const to = normalizeCurrencyCode(toCurrency, 'TWD')
  if (from === to) return 1

  const fromPerUsd = Number(rates?.[from])
  const toPerUsd = Number(rates?.[to])
  if (!Number.isFinite(fromPerUsd) || fromPerUsd <= 0) return null
  if (!Number.isFinite(toPerUsd) || toPerUsd <= 0) return null
  return toPerUsd / fromPerUsd
}

export function convertAmountMinorByRate(amountMinor, rate) {
  const amount = Math.abs(Math.round(Number(amountMinor) || 0))
  const numericRate = Number(rate)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (!Number.isFinite(numericRate) || numericRate <= 0) return 0
  return Math.round(amount * numericRate)
}

export function isExchangeRateSyncDue(snapshot, settings, nowMs = Date.now()) {
  const normalizedSettings = normalizeExchangeRateSettings(settings)
  if (!normalizedSettings.autoSyncEnabled) return false

  const normalizedSnapshot = normalizeExchangeRateSnapshot(snapshot)
  if (!normalizedSnapshot.syncedAt) return true

  const lastSyncMs = Date.parse(normalizedSnapshot.syncedAt)
  if (!Number.isFinite(lastSyncMs)) return true

  const intervalMs = normalizedSettings.syncIntervalHours * 60 * 60 * 1000
  return nowMs - lastSyncMs >= intervalMs
}

export async function runExchangeRateAutoSyncIfDue(ledgerId) {
  ensureLedgerId(ledgerId)
  const [settings, snapshot] = await Promise.all([
    getExchangeRateSettings(ledgerId),
    getExchangeRateSnapshot(ledgerId),
  ])

  if (!isExchangeRateSyncDue(snapshot, settings)) return false

  try {
    await syncCbcExchangeRateSnapshot(ledgerId)
    return true
  } catch (error) {
    console.warn('[exchange-rate] auto sync failed', error)
    return false
  }
}
