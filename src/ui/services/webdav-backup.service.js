import { exportAllLedgersJson } from '@/core/services/export.service'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const WEBDAV_BACKUP_KEY = 'backup.webdav'
const WEBDAV_REQUEST_TIMEOUT_MS = 15000

function buildDefaultState() {
  return {
    connected: false,
    endpoint: '',
    username: '',
    password: '',
    remoteDir: '',
    autoEnabled: false,
    dataChangeAutoEnabled: false,
    intervalHours: 24,
    lastBackupFilename: '',
    lastBackupAt: '',
    lastBackupStatus: 'idle',
    lastError: '',
  }
}

function normalizeState(raw) {
  const base = buildDefaultState()
  if (!raw || typeof raw !== 'object') return base
  const endpoint = normalizeEndpoint(raw.endpoint)
  const username = String(raw.username ?? '').trim()
  const password = String(raw.password ?? '')
  const hasAuth = Boolean(endpoint && username && password)
  return {
    ...base,
    ...raw,
    endpoint,
    username,
    password,
    remoteDir: normalizeRemoteDir(raw.remoteDir),
    connected: Boolean(raw.connected && hasAuth),
    autoEnabled: Boolean(raw.autoEnabled),
    dataChangeAutoEnabled: Boolean(raw.dataChangeAutoEnabled),
    intervalHours: Math.max(1, Number(raw.intervalHours ?? 24) || 24),
    lastBackupFilename: String(raw.lastBackupFilename ?? '').trim(),
    lastBackupAt: String(raw.lastBackupAt ?? ''),
    lastBackupStatus: String(raw.lastBackupStatus ?? 'idle'),
    lastError: String(raw.lastError ?? ''),
  }
}

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
}

function normalizeEndpoint(endpoint) {
  const text = String(endpoint ?? '').trim()
  if (!text) return ''
  return text.replace(/\/+$/, '')
}

function assertSecureEndpoint(endpoint) {
  const normalized = normalizeEndpoint(endpoint)
  if (!normalized) {
    throw new Error('請先輸入 WebDAV Endpoint')
  }
  if (!/^https:\/\//i.test(normalized)) {
    throw new Error('WebDAV Endpoint 必須使用 HTTPS')
  }
}

function normalizeRemoteDir(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.replace(/^\/+/, '').replace(/\/+$/, '')
}

function base64EncodeUtf8(value) {
  if (typeof btoa !== 'undefined' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }
  return ''
}

function buildAuthHeader(username, password) {
  const token = base64EncodeUtf8(`${username}:${password}`)
  return `Basic ${token}`
}

function buildBackupFilename() {
  return 'StrawMoneyBook_all_ledgers.json'
}

function buildLegacyBackupFilename(ledgerId) {
  const safeLedger = String(ledgerId ?? '').replace(/[^\w-]/g, '_')
  return `StrawMoneyBook_${safeLedger}.json`
}

function buildUploadUrl(state, filename) {
  const endpoint = normalizeEndpoint(state.endpoint)
  const remoteDir = normalizeRemoteDir(state.remoteDir)
  if (!endpoint) throw new Error('請先輸入 WebDAV Endpoint')
  const encodedRemoteDir = remoteDir
    .split('/')
    .filter(Boolean)
    .map((item) => encodeURIComponent(item))
    .join('/')
  const encodedFilename = String(filename ?? '')
    .split('/')
    .filter(Boolean)
    .map((item) => encodeURIComponent(item))
    .join('/')
  const path = encodedRemoteDir ? `${encodedRemoteDir}/${encodedFilename}` : encodedFilename
  return `${endpoint}/${path}`
}

function buildRemoteDirUrl(state) {
  const endpoint = normalizeEndpoint(state.endpoint)
  const remoteDir = normalizeRemoteDir(state.remoteDir)
  if (!endpoint) throw new Error('請先輸入 WebDAV Endpoint')
  if (!remoteDir) return `${endpoint}/`
  const encodedRemoteDir = remoteDir
    .split('/')
    .filter(Boolean)
    .map((item) => encodeURIComponent(item))
    .join('/')
  return `${endpoint}/${encodedRemoteDir}/`
}

function decodeXmlText(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function filenameFromHref(href) {
  const text = decodeXmlText(href).trim()
  if (!text) return ''
  const withoutQuery = text.split('?')[0]
  const normalized = withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery
  const name = normalized.split('/').filter(Boolean).pop() ?? ''
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

function isBackupDue(state) {
  if (!state.connected || !state.autoEnabled) return false
  if (!state.lastBackupAt) return true
  const lastMs = Date.parse(state.lastBackupAt)
  if (!Number.isFinite(lastMs)) return true
  const intervalMs = Math.max(1, Number(state.intervalHours || 24)) * 60 * 60 * 1000
  return Date.now() - lastMs >= intervalMs
}

async function uploadJsonToWebdav(state, filename, payloadText) {
  const url = buildUploadUrl(state, filename)
  const response = await requestWebdav(url, {
    method: 'PUT',
    headers: {
      Authorization: buildAuthHeader(state.username, state.password),
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: payloadText,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`WebDAV 上傳失敗：${text || response.status}`)
  }
  return { url }
}

async function requestWebdav(url, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? WEBDAV_REQUEST_TIMEOUT_MS) || WEBDAV_REQUEST_TIMEOUT_MS)
  if (Capacitor.isNativePlatform()) {
    let nativeTimeoutId = 0
    try {
      const method = String(options.method ?? 'GET').toUpperCase()
      const timeoutPromise = new Promise((_, reject) => {
        nativeTimeoutId = globalThis.setTimeout(() => {
          reject(new Error('request timeout'))
        }, timeoutMs)
      })
      const response = await Promise.race([
        CapacitorHttp.request({
          url,
          method,
          headers: options.headers ?? {},
          data: options.body ?? undefined,
        }),
        timeoutPromise,
      ])
      const status = Number(response?.status ?? 0)
      const dataText =
        typeof response?.data === 'string'
          ? response.data
          : response?.data != null
            ? JSON.stringify(response.data)
            : ''
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => dataText,
      }
    } catch (error) {
      const message = String(error?.message ?? '')
      if (/certificate|ssl|tls/i.test(message)) {
        throw new Error('WebDAV 連線失敗：憑證驗證失敗（請確認 HTTPS 憑證）')
      }
      if (/timeout/i.test(message)) {
        throw new Error(`WebDAV 連線逾時（${timeoutMs}ms），請稍後再試`)
      }
      throw new Error(`WebDAV 連線失敗：${message || '原生網路錯誤'}`)
    } finally {
      if (nativeTimeoutId) globalThis.clearTimeout(nativeTimeoutId)
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = globalThis.setTimeout(() => {
    controller?.abort()
  }, timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller?.signal,
    })
  } catch (error) {
    const message = String(error?.message ?? '')
    if (error?.name === 'AbortError' || /timeout/i.test(message)) {
      throw new Error(`WebDAV 連線逾時（${timeoutMs}ms），請稍後再試`)
    }
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      throw new Error('WebDAV 連線失敗，請檢查 Endpoint、網路或伺服器 CORS 設定')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function ensureRemoteDirExists(state) {
  const remoteDir = normalizeRemoteDir(state.remoteDir)
  if (!remoteDir) return

  const endpoint = normalizeEndpoint(state.endpoint)
  const authHeader = buildAuthHeader(state.username, state.password)
  const segments = remoteDir.split('/').filter(Boolean)
  let currentParts = []

  for (const segment of segments) {
    currentParts.push(encodeURIComponent(segment))
    const dirUrl = `${endpoint}/${currentParts.join('/')}/`
    const response = await requestWebdav(dirUrl, {
      method: 'MKCOL',
      headers: {
        Authorization: authHeader,
      },
    })
    if ([200, 201, 204, 301, 302, 405].includes(response.status)) {
      continue
    }
    if (response.status === 409) {
      throw new Error(`WebDAV 資料夾建立失敗（路徑層級不存在）：${remoteDir}`)
    }
    const text = await response.text()
    throw new Error(`WebDAV 資料夾建立失敗：${text || response.status}`)
  }
}

export async function getWebdavBackupState(ledgerId) {
  assertLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, WEBDAV_BACKUP_KEY)
  return normalizeState(stored)
}

export async function updateWebdavBackupState(ledgerId, patch = {}) {
  assertLedgerId(ledgerId)
  const current = await getWebdavBackupState(ledgerId)
  const next = normalizeState({ ...current, ...patch })
  await setSetting(ledgerId, WEBDAV_BACKUP_KEY, next)
  return next
}

export async function connectWebdavBackup(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const current = await getWebdavBackupState(ledgerId)
  const nextState = normalizeState({
    ...current,
    ...input,
    connected: true,
  })
  if (!nextState.endpoint || !nextState.username || !nextState.password) {
    throw new Error('請完整填寫 Endpoint、帳號、密碼')
  }
  assertSecureEndpoint(nextState.endpoint)

  await ensureRemoteDirExists(nextState)

  // 試寫一個輕量測試檔，確認連線與授權可用。
  const probeName = `strawmoneybook_probe_${Date.now()}.json`
  await uploadJsonToWebdav(nextState, probeName, JSON.stringify({ ok: true, ts: new Date().toISOString() }))

  return updateWebdavBackupState(ledgerId, {
    endpoint: nextState.endpoint,
    username: nextState.username,
    password: nextState.password,
    remoteDir: nextState.remoteDir,
    connected: true,
    lastError: '',
  })
}

export async function disconnectWebdavBackup(ledgerId) {
  assertLedgerId(ledgerId)
  return updateWebdavBackupState(ledgerId, {
    connected: false,
    username: '',
    password: '',
    autoEnabled: false,
    lastBackupFilename: '',
    lastError: '',
  })
}

export async function performWebdavBackup(ledgerId) {
  assertLedgerId(ledgerId)
  const state = await getWebdavBackupState(ledgerId)
  if (!state.connected || !state.endpoint || !state.username || !state.password) {
    throw new Error('請先連接 WebDAV')
  }
  assertSecureEndpoint(state.endpoint)

  const payload = await exportAllLedgersJson()
  const now = new Date().toISOString()
  const filename = buildBackupFilename()
  const payloadText = JSON.stringify(payload, null, 2)
  await ensureRemoteDirExists(state)
  const { url } = await uploadJsonToWebdav(state, filename, payloadText)

  const next = await updateWebdavBackupState(ledgerId, {
    lastBackupFilename: filename,
    lastBackupAt: now,
    lastBackupStatus: 'ok',
    lastError: '',
  })
  return {
    url,
    filename,
    lastBackupAt: next.lastBackupAt,
  }
}

async function downloadJsonFromWebdav(state, filename) {
  const url = buildUploadUrl(state, filename)
  const response = await requestWebdav(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader(state.username, state.password),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`WebDAV 下載失敗：${text || response.status}`)
  }
  return response.text()
}

async function listWebdavBackupFilenames(state) {
  const url = buildRemoteDirUrl(state)
  const response = await requestWebdav(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: buildAuthHeader(state.username, state.password),
      Depth: '1',
      'Content-Type': 'application/xml; charset=UTF-8',
    },
    body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getlastmodified />
  </d:prop>
</d:propfind>`,
  })

  if (![200, 207].includes(Number(response.status))) {
    const text = await response.text()
    throw new Error(`WebDAV 讀取備份清單失敗：${text || response.status}`)
  }

  const xmlText = await response.text()
  const blocks = [...xmlText.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)].map((match) => match[1])
  const results = []

  for (const block of blocks) {
    const href = block.match(/<[^>]*href[^>]*>([\s\S]*?)<\/[^>]*href>/i)?.[1] ?? ''
    const filename = filenameFromHref(href)
    if (!filename || !filename.endsWith('.json') || !filename.startsWith('StrawMoneyBook_')) continue
    const modifiedText = decodeXmlText(block.match(/<[^>]*getlastmodified[^>]*>([\s\S]*?)<\/[^>]*getlastmodified>/i)?.[1] ?? '')
    const modifiedAt = Date.parse(modifiedText)
    results.push({
      filename,
      modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
    })
  }

  results.sort((a, b) => b.modifiedAt - a.modifiedAt)
  const unique = []
  const seen = new Set()
  for (const item of results) {
    if (seen.has(item.filename)) continue
    seen.add(item.filename)
    unique.push(item.filename)
  }
  return unique
}

async function listWebdavBackupFilenamesByDirectoryGet(state) {
  const url = buildRemoteDirUrl(state)
  const response = await requestWebdav(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader(state.username, state.password),
    },
  })
  if (!response.ok) return []
  const text = await response.text()
  const matches = [...String(text).matchAll(/StrawMoneyBook_[^"'<>\\/\s]+\.json/gi)].map((match) => match[0])
  return [...new Set(matches)]
}

export async function restoreWebdavBackupJson(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const state = await getWebdavBackupState(ledgerId)
  if (!state.connected || !state.endpoint || !state.username || !state.password) {
    throw new Error('請先連接 WebDAV')
  }
  assertSecureEndpoint(state.endpoint)

  const requestedFilename = String(options.filename ?? state.lastBackupFilename ?? '').trim()
  const candidates = []
  if (requestedFilename) {
    candidates.push(requestedFilename)
  } else {
    let listed = []
    try {
      listed = await listWebdavBackupFilenames(state)
    } catch {
      try {
        listed = await listWebdavBackupFilenamesByDirectoryGet(state)
      } catch {
        listed = []
      }
    }

    const allLedgersFilename = buildBackupFilename()
    if (listed.includes(allLedgersFilename)) {
      candidates.push(allLedgersFilename)
    } else if (state.lastBackupFilename) {
      candidates.push(state.lastBackupFilename)
    } else if (listed.length) {
      candidates.push(listed[0])
    } else {
      candidates.push(allLedgersFilename)
      candidates.push(buildLegacyBackupFilename(ledgerId))
    }
  }

  const deduped = [...new Set(candidates.map((item) => String(item ?? '').trim()))].filter(Boolean)
  let jsonText = ''
  let restoredFilename = ''
  let lastError = null
  for (const candidate of deduped) {
    try {
      jsonText = await downloadJsonFromWebdav(state, candidate)
      restoredFilename = candidate
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!restoredFilename) {
    if (lastError) throw lastError
    throw new Error('找不到可還原的 WebDAV 備份檔案')
  }

  await updateWebdavBackupState(ledgerId, {
    lastBackupFilename: restoredFilename,
    lastError: '',
  })
  return {
    jsonText,
    filename: restoredFilename,
  }
}

export async function runWebdavAutoBackupIfDue(ledgerId) {
  assertLedgerId(ledgerId)
  const state = await getWebdavBackupState(ledgerId)
  if (!isBackupDue(state)) {
    return { skipped: true, reason: 'not_due' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { skipped: true, reason: 'offline' }
  }
  try {
    const result = await performWebdavBackup(ledgerId)
    return { skipped: false, ...result }
  } catch (error) {
    await updateWebdavBackupState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: String(error?.message ?? '自動備份失敗'),
    })
    return { skipped: true, reason: 'failed' }
  }
}

export async function runWebdavAutoBackupOnDataChange(ledgerId) {
  assertLedgerId(ledgerId)
  const state = await getWebdavBackupState(ledgerId)
  if (!state.connected || !state.autoEnabled || !state.dataChangeAutoEnabled) {
    return { skipped: true, reason: 'disabled' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { skipped: true, reason: 'offline' }
  }
  try {
    const result = await performWebdavBackup(ledgerId)
    return { skipped: false, ...result }
  } catch (error) {
    await updateWebdavBackupState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: String(error?.message ?? '資料更動自動備份失敗'),
    })
    return { skipped: true, reason: 'failed' }
  }
}
