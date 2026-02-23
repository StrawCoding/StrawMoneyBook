import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { normalizeCurrencyCode } from '@/ui/constants/currency-options'

const EXCHANGE_RATE_SETTINGS_KEY = 'exchange_rate.settings'
const EXCHANGE_RATE_SNAPSHOT_KEY = 'exchange_rate.snapshot'
const CBC_FILE_CODE_DAILY = 'BP01D01'
const CBC_API_URL = `https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=${CBC_FILE_CODE_DAILY}`
const DEFAULT_SYNC_INTERVAL_HOURS = 24
const FETCH_TIMEOUT_MS = 12000

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

async function fetchCbcRatesPayload() {
  const response = await withTimeout(
    fetch(CBC_API_URL, {
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
    throw new Error(`央行匯率 API 錯誤：HTTP ${response.status}`)
  }

  return response.json()
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
  const payload = await fetchCbcRatesPayload()
  const snapshot = parseCbcRatesPayload(payload)
  await setSetting(ledgerId, EXCHANGE_RATE_SNAPSHOT_KEY, snapshot)
  return snapshot
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
