import { Capacitor } from '@capacitor/core'
import { exportAllLedgersJson } from '@/core/services/export.service'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { translateMessage } from '@/ui/services/i18n.service'
import {
  downloadAppDataBackupText,
  listAppDataBackups,
  uploadBackupJsonToAppDataFolder,
} from '@/services/google/drive-appdata-backup'
import { getAccessToken, getCachedGoogleProfile, googleSignIn, googleSignOut, reauth } from '@/services/google/auth'

const GOOGLE_BACKUP_KEY = 'backup.google_drive'
const GOOGLE_BACKUP_FILENAME = 'StrawMoneyBook_all_ledgers.json'
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function buildDefaultState() {
  return {
    connected: false,
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
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
  return {
    ...base,
    ...raw,
    connected: Boolean(raw.connected),
    accountEmail: String(raw.accountEmail ?? '').trim(),
    accountName: String(raw.accountName ?? '').trim(),
    accountImageUrl: String(raw.accountImageUrl ?? '').trim(),
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
  if (!ledgerId) throw new Error(t('settings_auto_backup.error.missing_ledger_id'))
}

function ensureNativePlatform() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(t('settings_auto_backup.error.google.native_only'))
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

function pickPreferredBackupFile(files) {
  if (!Array.isArray(files) || !files.length) return null
  const exact = files.find((item) => String(item?.name ?? '') === GOOGLE_BACKUP_FILENAME)
  return exact ?? files[0]
}

function hasProfileIdentity(profile) {
  if (!profile || typeof profile !== 'object') return false
  return Boolean(profile.email || profile.name || profile.imageUrl)
}

function normalizeProfile(raw) {
  return {
    email: String(raw?.email ?? '').trim(),
    name: String(raw?.name ?? '').trim(),
    imageUrl: String(raw?.imageUrl ?? '').trim(),
  }
}

function profilePatchFromState(state, profile) {
  const patch = {}
  if (profile.email && profile.email !== state.accountEmail) {
    patch.accountEmail = profile.email
  }
  if (profile.name && profile.name !== state.accountName) {
    patch.accountName = profile.name
  }
  if (profile.imageUrl && profile.imageUrl !== state.accountImageUrl) {
    patch.accountImageUrl = profile.imageUrl
  }
  return patch
}

async function hydrateStateProfileFromCache(ledgerId, state) {
  if (!state.connected) return state
  const profile = normalizeProfile(getCachedGoogleProfile())
  const patch = profilePatchFromState(state, profile)
  if (!Object.keys(patch).length) return state
  const next = normalizeState({ ...state, ...patch })
  await setSetting(ledgerId, GOOGLE_BACKUP_KEY, next)
  return next
}

async function resolveGoogleProfileForConnect() {
  let reusedSession = false
  try {
    await getAccessToken({ interactive: false })
    reusedSession = true
  } catch {
    reusedSession = false
  }

  let profile = normalizeProfile(getCachedGoogleProfile())
  if (!profile.email && !profile.name && !profile.imageUrl && !reusedSession) {
    const login = await googleSignIn()
    profile = normalizeProfile(login?.profile ?? getCachedGoogleProfile())
  }

  return profile
}

function shouldAttemptSilentAutoConnect(state) {
  if (!state || typeof state !== 'object') return false
  if (state.connected) return true
  return Boolean(
    state.autoEnabled
      || state.dataChangeAutoEnabled
      || state.accountEmail
      || state.accountName
      || state.accountImageUrl,
  )
}

async function ensureConnectedBySilentAuth(ledgerId, state) {
  if (!Capacitor.isNativePlatform()) return state
  if (!shouldAttemptSilentAutoConnect(state)) return state

  let silentToken = ''
  try {
    silentToken = String(await getAccessToken({ interactive: false }) ?? '').trim()
  } catch {
    return state
  }
  if (!silentToken) return state

  const profile = normalizeProfile(getCachedGoogleProfile())
  const profilePatch = profilePatchFromState(state, profile)
  const patch = {
    connected: true,
    lastError: '',
    ...profilePatch,
  }

  if (state.connected && !Object.keys(profilePatch).length && !state.lastError) {
    return state
  }
  if (!state.connected || hasProfileIdentity(profile)) {
    return saveState(ledgerId, patch)
  }
  return saveState(ledgerId, { connected: true, lastError: '' })
}

async function saveState(ledgerId, patch) {
  const current = await getGoogleBackupState(ledgerId)
  const next = normalizeState({ ...current, ...patch })
  await setSetting(ledgerId, GOOGLE_BACKUP_KEY, next)
  return next
}

export async function getGoogleBackupState(ledgerId) {
  assertLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, GOOGLE_BACKUP_KEY)
  const state = normalizeState(stored)
  return hydrateStateProfileFromCache(ledgerId, state)
}

export async function autoConnectGoogleBackup(ledgerId) {
  assertLedgerId(ledgerId)
  const state = await getGoogleBackupState(ledgerId)
  return ensureConnectedBySilentAuth(ledgerId, state)
}

export async function updateGoogleBackupState(ledgerId, patch = {}) {
  assertLedgerId(ledgerId)
  return saveState(ledgerId, patch)
}

export async function connectGoogleBackup(ledgerId) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()

  const profile = await resolveGoogleProfileForConnect()
  return saveState(ledgerId, {
    connected: true,
    accountEmail: profile.email,
    accountName: profile.name,
    accountImageUrl: profile.imageUrl,
    lastError: '',
  })
}

export async function disconnectGoogleBackup(ledgerId) {
  assertLedgerId(ledgerId)
  try {
    await googleSignOut()
  } catch (error) {
    console.warn('[google-backup] sign out failed', error)
  }
  return saveState(ledgerId, {
    connected: false,
    autoEnabled: false,
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
    lastError: '',
  })
}

export async function performGoogleBackup(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()
  const interactiveAuth = options?.interactiveAuth !== false
  const reauthHandler = () => reauth({ interactive: interactiveAuth })

  const state = await getGoogleBackupState(ledgerId)
  if (!state.connected) {
    throw new Error(t('settings_auto_backup.error.google.connect_required'))
  }

  const accessToken = await getAccessToken({ interactive: interactiveAuth })
  const payload = await exportAllLedgersJson()
  const payloadText = JSON.stringify(payload, null, 2)
  const now = new Date().toISOString()
  const uploaded = await uploadBackupJsonToAppDataFolder({
    accessToken,
    reauth: reauthHandler,
    filename: GOOGLE_BACKUP_FILENAME,
    jsonText: payloadText,
  })

  const next = await saveState(ledgerId, {
    lastBackupFilename: uploaded.filename || GOOGLE_BACKUP_FILENAME,
    lastBackupAt: uploaded.modifiedTime || now,
    lastBackupStatus: 'ok',
    lastError: '',
  })

  return {
    filename: next.lastBackupFilename || GOOGLE_BACKUP_FILENAME,
    lastBackupAt: next.lastBackupAt || now,
  }
}

export async function restoreGoogleBackupJson(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()
  const interactiveAuth = options?.interactiveAuth !== false
  const reauthHandler = () => reauth({ interactive: interactiveAuth })

  const state = await getGoogleBackupState(ledgerId)
  if (!state.connected) {
    throw new Error(t('settings_auto_backup.error.google.connect_required'))
  }

  const accessToken = await getAccessToken({ interactive: interactiveAuth })
  const files = await listAppDataBackups({ accessToken, reauth: reauthHandler })
  const target = pickPreferredBackupFile(files)
  if (!target?.id) {
    throw new Error(t('settings_auto_backup.error.google.restore_file_missing'))
  }

  const jsonText = await downloadAppDataBackupText({
    accessToken,
    reauth: reauthHandler,
    fileId: target.id,
  })

  return {
    filename: String(target.name ?? ''),
    modifiedTime: String(target.modifiedTime ?? ''),
    jsonText,
  }
}

export async function runGoogleAutoBackupIfDue(ledgerId) {
  assertLedgerId(ledgerId)
  if (!Capacitor.isNativePlatform()) return false
  const state = await autoConnectGoogleBackup(ledgerId)
  if (!isBackupDue(state)) return false

  try {
    const profile = getCachedGoogleProfile()
    if (profile?.email && !state.accountEmail) {
      await saveState(ledgerId, {
        accountEmail: profile.email,
        accountName: profile.name || '',
        accountImageUrl: profile.imageUrl || '',
      })
    }
    await performGoogleBackup(ledgerId, { interactiveAuth: false })
    return true
  } catch (error) {
    const isReauth = String(error?.code ?? '') === 'GOOGLE_REAUTH_REQUIRED'
    const detail = String(error?.message ?? error ?? '').trim()
    const detailSuffix = detail ? t('settings_auto_backup.error.detail_suffix', { detail }) : ''
    await saveState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: isReauth
        ? t('settings_auto_backup.error.google.auto_backup_reauth_required', { detailSuffix })
        : detail || t('settings_auto_backup.error.google.auto_backup_failed'),
    })
    return false
  }
}

export async function runGoogleAutoBackupOnDataChange(ledgerId) {
  assertLedgerId(ledgerId)
  if (!Capacitor.isNativePlatform()) return false
  const state = await autoConnectGoogleBackup(ledgerId)
  if (!state.connected || !state.autoEnabled || !state.dataChangeAutoEnabled) return false

  try {
    const profile = getCachedGoogleProfile()
    if (profile?.email && !state.accountEmail) {
      await saveState(ledgerId, {
        accountEmail: profile.email,
        accountName: profile.name || '',
        accountImageUrl: profile.imageUrl || '',
      })
    }
    await performGoogleBackup(ledgerId, { interactiveAuth: false })
    return true
  } catch (error) {
    const isReauth = String(error?.code ?? '') === 'GOOGLE_REAUTH_REQUIRED'
    const detail = String(error?.message ?? error ?? '').trim()
    const detailSuffix = detail ? t('settings_auto_backup.error.detail_suffix', { detail }) : ''
    await saveState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: isReauth
        ? t('settings_auto_backup.error.google.data_change_backup_reauth_required', {
            detailSuffix,
          })
        : detail || t('settings_auto_backup.error.google.data_change_backup_failed'),
    })
    return false
  }
}
