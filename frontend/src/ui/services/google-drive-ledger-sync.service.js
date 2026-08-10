import { getLedger, purgeLedger } from '@/core/repositories/ledger.repo'
import { exportLedgerJson } from '@/core/services/export.service'
import { importLedgerJsonAsNewLedger } from '@/core/services/import.service'
import {
  countSnapshotActiveTransactions,
  createEmptyRemoteReplaceBlockedError,
  EMPTY_REMOTE_REPLACE_BLOCKED_CODE,
} from '@/core/services/data-wipe-guard.service'
import { getMembershipTierSnapshot } from '@/core/services/membership.service'
import { query, run } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { translateMessage } from '@/ui/services/i18n.service'
import {
  downloadAppDataBackupText,
  listAppDataBackups,
  uploadBackupJsonToAppDataFolder,
} from '@/services/google/drive-appdata-backup'
import {
  getAccessToken,
  getCachedGoogleProfile,
  googleSignIn,
  hasCachedGoogleAuthSession,
  reauth,
} from '@/services/einvoice/auth'
import { isLocalOnlyAppSettingKey } from '@/ui/services/local-only-app-settings'
import {
  mergeSharedLedgerSnapshots,
  normalizeSharedLedgerSnapshot,
  threeWayMergeSnapshots,
} from '@/ui/services/shared-ledger/snapshot-merge.js'

const GOOGLE_LEDGER_SYNC_STORAGE_KEY = 'straw.google_drive_ledger_sync_state'
const GOOGLE_LEDGER_SYNC_DIRTY_KEY = 'straw.google_drive_ledger_sync_dirty_queue'
const GOOGLE_LEDGER_SYNC_BASE_SNAPSHOT_KEY = 'straw.google_drive_ledger_sync_base_snapshot'
export const GOOGLE_LEDGER_SYNC_ACCOUNT_SWITCH_EVENT = 'google-ledger-sync:account-switched'
const GOOGLE_LEDGER_SYNC_MUTE_MS = 15000
const AUTO_PUSH_DEBOUNCE_MS = 1000
const MEMBERSHIP_TIER_MEMBER = 'member'

let autoSyncTimer = null
let backgroundSyncPromise = null
let backgroundSyncReady = false
const mutedLedgerSyncUntil = new Map()
const syncingLedgerIds = new Set()
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeProfile(raw) {
  return {
    email: String(raw?.email ?? '').trim(),
    name: String(raw?.name ?? '').trim(),
    imageUrl: String(raw?.imageUrl ?? '').trim(),
  }
}

function hasProfileIdentity(profile) {
  return Boolean(profile?.email || profile?.name || profile?.imageUrl)
}

function hasGoogleDriveLedgerSyncMembershipAccess() {
  return getMembershipTierSnapshot() === MEMBERSHIP_TIER_MEMBER
}

function assertGoogleDriveLedgerSyncMembershipAccess() {
  if (hasGoogleDriveLedgerSyncMembershipAccess()) return
  throw new Error(t('settings_google_sync.error.member_only', null, '帳本同步僅限會員使用'))
}

function readLocalStorageObject(key) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalStorageObject(key, value) {
  if (typeof localStorage === 'undefined') return
  const entries = Object.entries(value ?? {})
    .map(([ledgerId, state]) => [String(ledgerId ?? '').trim(), state])
    .filter(([ledgerId, state]) => Boolean(ledgerId) && state && typeof state === 'object')
  if (!entries.length) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)))
}

function readBaseSnapshotMap() {
  return readLocalStorageObject(GOOGLE_LEDGER_SYNC_BASE_SNAPSHOT_KEY)
}

function writeBaseSnapshotMap(map) {
  writeLocalStorageObject(GOOGLE_LEDGER_SYNC_BASE_SNAPSHOT_KEY, map)
}

function getBaseSnapshot(ledgerId) {
  return readBaseSnapshotMap()[String(ledgerId ?? '').trim()] ?? null
}

function setBaseSnapshot(ledgerId, snapshot) {
  const map = readBaseSnapshotMap()
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  if (snapshot) {
    map[normalizedLedgerId] = cloneJson(snapshot)
  } else {
    delete map[normalizedLedgerId]
  }
  writeBaseSnapshotMap(map)
}

function clearBaseSnapshot(ledgerId) {
  setBaseSnapshot(ledgerId, null)
}

function buildDefaultState() {
  return {
    enabled: false,
    fileId: '',
    filename: '',
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
    pendingAccountSwitch: null,
    lastSyncedAt: '',
    lastPushedAt: '',
    lastPulledAt: '',
    lastRemoteModifiedAt: '',
    lastSyncStatus: 'idle',
    lastError: '',
    lastConflictCount: 0,
  }
}

function normalizePendingAccountSwitch(raw) {
  if (!raw || typeof raw !== 'object') return null
  const boundEmail = String(raw.boundEmail ?? '').trim()
  const currentEmail = String(raw.currentEmail ?? '').trim()
  const detectedAt = String(raw.detectedAt ?? '').trim()
  if (!boundEmail && !currentEmail) return null
  return {
    boundEmail,
    currentEmail,
    detectedAt,
  }
}

function normalizeState(raw) {
  const base = buildDefaultState()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    enabled: Boolean(raw.enabled),
    fileId: String(raw.fileId ?? '').trim(),
    filename: String(raw.filename ?? '').trim(),
    accountEmail: String(raw.accountEmail ?? '').trim(),
    accountName: String(raw.accountName ?? '').trim(),
    accountImageUrl: String(raw.accountImageUrl ?? '').trim(),
    pendingAccountSwitch: normalizePendingAccountSwitch(raw.pendingAccountSwitch),
    lastSyncedAt: String(raw.lastSyncedAt ?? '').trim(),
    lastPushedAt: String(raw.lastPushedAt ?? '').trim(),
    lastPulledAt: String(raw.lastPulledAt ?? '').trim(),
    lastRemoteModifiedAt: String(raw.lastRemoteModifiedAt ?? '').trim(),
    lastSyncStatus: String(raw.lastSyncStatus ?? 'idle').trim() || 'idle',
    lastError: String(raw.lastError ?? '').trim(),
    lastConflictCount: Math.max(0, Number(raw.lastConflictCount ?? 0) || 0),
  }
}

function readStateMap() {
  return Object.fromEntries(
    Object.entries(readLocalStorageObject(GOOGLE_LEDGER_SYNC_STORAGE_KEY))
      .map(([ledgerId, raw]) => [ledgerId, normalizeState(raw)])
      .filter(([ledgerId]) => Boolean(ledgerId)),
  )
}

function writeStateMap(map) {
  writeLocalStorageObject(GOOGLE_LEDGER_SYNC_STORAGE_KEY, map)
}

function buildRemoteFilename(ledgerId) {
  return `StrawMoneyBook_sync_${String(ledgerId ?? '').trim()}.json`
}

function readDirtyQueue() {
  return Object.fromEntries(
    Object.entries(readLocalStorageObject(GOOGLE_LEDGER_SYNC_DIRTY_KEY))
      .map(([ledgerId, markedAt]) => [String(ledgerId ?? '').trim(), String(markedAt ?? '').trim()])
      .filter(([ledgerId]) => Boolean(ledgerId)),
  )
}

function writeDirtyQueue(queue) {
  writeLocalStorageObject(GOOGLE_LEDGER_SYNC_DIRTY_KEY, queue)
}

function markLedgerDirty(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  const queue = readDirtyQueue()
  queue[normalizedLedgerId] = nowIso()
  writeDirtyQueue(queue)
}

function clearLedgerDirty(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  const queue = readDirtyQueue()
  delete queue[normalizedLedgerId]
  writeDirtyQueue(queue)
}

function getLedgerDirtyMarkedAt(ledgerId) {
  return String(readDirtyQueue()[String(ledgerId ?? '').trim()] ?? '').trim()
}

function hasDirtyLedger(ledgerId) {
  return Boolean(getLedgerDirtyMarkedAt(ledgerId))
}

function listDirtyLedgerIds() {
  return Object.keys(readDirtyQueue())
}

function muteAutoSync(ledgerId, durationMs = GOOGLE_LEDGER_SYNC_MUTE_MS) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  mutedLedgerSyncUntil.set(normalizedLedgerId, Date.now() + Math.max(1000, Number(durationMs) || 0))
}

function isAutoSyncMuted(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return false
  const mutedUntil = Number(mutedLedgerSyncUntil.get(normalizedLedgerId) ?? 0)
  if (!Number.isFinite(mutedUntil) || mutedUntil <= Date.now()) {
    mutedLedgerSyncUntil.delete(normalizedLedgerId)
    return false
  }
  return true
}

function sanitizeSnapshotForGoogleDriveSync(snapshot) {
  const normalized = cloneJson(snapshot)
  if (!normalized || typeof normalized !== 'object') {
    throw new Error(t('settings_google_sync.error.invalid_snapshot', null, '帳本快照格式錯誤'))
  }
  const appSettings = Array.isArray(normalized?.tables?.app_settings) ? normalized.tables.app_settings : []
  normalized.tables.app_settings = appSettings.filter((row) => !isLocalOnlyAppSettingKey(row?.key))
  normalized.exported_at = new Date().toISOString()
  // Same FK preserve path as shared-ledger (smb296／smb297): synthesize parents, keep children.
  return normalizeSharedLedgerSnapshot(normalized)
}

function resolveSnapshotLedgerId(snapshot) {
  const rootLedgerId = String(snapshot?.ledger_id ?? '').trim()
  const tableLedgerId = String(snapshot?.tables?.ledgers?.[0]?.id ?? '').trim()
  return rootLedgerId || tableLedgerId
}

async function restoreLocalLedgerFromBackup(ledgerId, localBackupText, existingLedger) {
  const requestedLedgerId = String(ledgerId ?? '').trim()
  if (!requestedLedgerId || !localBackupText) return null
  const stillExists = await getLedger(requestedLedgerId)
  if (stillExists) return null
  return importLedgerJsonAsNewLedger(localBackupText, {
    keepLedgerId: true,
    ledgerName: String(existingLedger?.name ?? '').trim(),
    runIntegrityRepair: false,
  })
}

async function listLocalOnlySettingRows(ledgerId) {
  const result = await query(
    `SELECT key, value_json, updated_at
     FROM app_settings
     WHERE ledger_id = ?;`,
    [ledgerId],
  )
  const rows = Array.isArray(result?.values) ? result.values : []
  return rows.filter((row) => isLocalOnlyAppSettingKey(row?.key))
}

async function restoreSettingRows(ledgerId, rows = []) {
  for (const row of rows) {
    await run(
      `INSERT INTO app_settings (ledger_id, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ledger_id, key)
       DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`,
      [
        ledgerId,
        String(row?.key ?? '').trim(),
        String(row?.value_json ?? 'null'),
        String(row?.updated_at ?? '').trim() || nowIso(),
      ],
    )
  }
}

function findRemoteFileByLedger(files, ledgerId) {
  const filename = buildRemoteFilename(ledgerId)
  return (Array.isArray(files) ? files : []).find((item) => String(item?.name ?? '') === filename) ?? null
}

async function loadRemoteLedgerFile(ledgerId, accessToken, reauthHandler) {
  const files = await listAppDataBackups({ accessToken, reauth: reauthHandler })
  return findRemoteFileByLedger(files, ledgerId)
}

async function ensureGoogleAccess({ interactive = false, preferredEmail = '', boundEmail = '' } = {}) {
  const normalizedPreferredEmail = normalizeEmail(preferredEmail)
  let accessToken = ''
  try {
    accessToken = String(await getAccessToken({
      interactive,
      preferredEmail: normalizedPreferredEmail || preferredEmail,
    }) ?? '').trim()
  } catch (error) {
    if (!interactive) throw error
    const login = await googleSignIn({ preferredEmail: normalizedPreferredEmail || preferredEmail })
    accessToken = String(await getAccessToken({
      interactive: false,
      preferredEmail: normalizedPreferredEmail || preferredEmail,
    }) ?? '').trim()
    if (!accessToken && login?.idToken) {
      throw error
    }
  }

  const profile = normalizeProfile(getCachedGoogleProfile())
  const normalizedBoundEmail = normalizeEmail(boundEmail)
  if (normalizedBoundEmail && normalizeEmail(profile.email) !== normalizedBoundEmail) {
    console.info('[google-ledger-sync] account switch detected', {
      boundEmail,
      currentEmail: profile.email || '',
    })
    const switchError = new Error(
      t(
        'settings_google_sync.error.account_switched',
        { bound: boundEmail, current: profile.email || '-' },
        `Google 帳號已切換（綁定：${boundEmail}，目前：${profile.email || '-' }）`,
      ),
    )
    switchError.code = 'GOOGLE_ACCOUNT_SWITCHED'
    switchError.boundEmail = boundEmail
    switchError.currentEmail = profile.email || ''
    throw switchError
  }

  return {
    accessToken,
    profile,
  }
}

function dateMs(value) {
  const ms = Date.parse(String(value ?? '').trim())
  return Number.isFinite(ms) ? ms : 0
}

function buildStatePatchFromProfile(profile) {
  return {
    accountEmail: String(profile?.email ?? '').trim(),
    accountName: String(profile?.name ?? '').trim(),
    accountImageUrl: String(profile?.imageUrl ?? '').trim(),
  }
}

function buildPendingAccountSwitch(boundEmail, currentEmail) {
  return {
    boundEmail: String(boundEmail ?? '').trim(),
    currentEmail: String(currentEmail ?? '').trim(),
    detectedAt: nowIso(),
  }
}

function emitAccountSwitchEvent(ledgerId, pendingAccountSwitch) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(GOOGLE_LEDGER_SYNC_ACCOUNT_SWITCH_EVENT, {
    detail: {
      ledgerId: String(ledgerId ?? '').trim(),
      ...pendingAccountSwitch,
    },
  }))
}

async function recordAccountSwitchMismatch(ledgerId, state, error) {
  if (error?.code !== 'GOOGLE_ACCOUNT_SWITCHED') return state
  const pendingAccountSwitch = buildPendingAccountSwitch(
    error.boundEmail ?? state?.accountEmail,
    error.currentEmail,
  )
  console.info('[google-ledger-sync] account switched', {
    ledgerId: String(ledgerId ?? '').trim(),
    boundEmail: pendingAccountSwitch.boundEmail,
    currentEmail: pendingAccountSwitch.currentEmail,
    detectedAt: pendingAccountSwitch.detectedAt,
  })
  const nextState = await setGoogleDriveLedgerSyncState(ledgerId, {
    ...state,
    pendingAccountSwitch,
    lastSyncStatus: 'account_mismatch',
    lastError: String(error?.message ?? error ?? '').trim()
      || t('settings_google_sync.error.account_switched', {
        bound: pendingAccountSwitch.boundEmail || '-',
        current: pendingAccountSwitch.currentEmail || '-',
      }, `Google 帳號已切換（綁定：${pendingAccountSwitch.boundEmail || '-'}，目前：${pendingAccountSwitch.currentEmail || '-' }）`),
  })
  emitAccountSwitchEvent(ledgerId, pendingAccountSwitch)
  return nextState
}

export async function clearPendingAccountSwitch(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return buildDefaultState()
  const current = await getGoogleDriveLedgerSyncState(normalizedLedgerId)
  return setGoogleDriveLedgerSyncState(normalizedLedgerId, {
    ...current,
    pendingAccountSwitch: null,
    lastSyncStatus: current.lastSyncStatus === 'account_mismatch' ? 'idle' : current.lastSyncStatus,
    lastError: current.lastSyncStatus === 'account_mismatch' ? '' : current.lastError,
  })
}

export async function getGoogleDriveLedgerSyncState(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return buildDefaultState()
  const map = readStateMap()
  return normalizeState({
    ...map[normalizedLedgerId],
    filename: buildRemoteFilename(normalizedLedgerId),
  })
}

export async function setGoogleDriveLedgerSyncState(ledgerId, patch = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error(t('settings_google_sync.error.missing_ledger_id', null, '缺少帳本 ID'))
  const map = readStateMap()
  const next = normalizeState({
    ...map[normalizedLedgerId],
    ...patch,
    filename: buildRemoteFilename(normalizedLedgerId),
  })
  map[normalizedLedgerId] = next
  writeStateMap(map)
  return next
}

export async function listGoogleDriveLedgerSyncBindings(ledgers = []) {
  return Promise.all(
    ledgers.map(async (ledger) => ({
      ledgerId: ledger.id,
      ledgerName: ledger.name,
      state: await getGoogleDriveLedgerSyncState(ledger.id),
    })),
  )
}

async function replaceLocalLedgerWithRemoteSnapshot(snapshot, ledgerId, state, remoteFile, options = {}) {
  const normalizedSnapshot = sanitizeSnapshotForGoogleDriveSync(snapshot)
  const requestedLedgerId = String(ledgerId ?? '').trim()
  if (!requestedLedgerId) {
    throw new Error(t('settings_google_sync.error.missing_ledger_id', null, '缺少帳本 ID'))
  }

  const snapshotLedgerId = resolveSnapshotLedgerId(normalizedSnapshot)
  if (snapshotLedgerId !== requestedLedgerId) {
    throw new Error(t(
      'settings_google_sync.error.ledger_mismatch',
      null,
      '遠端帳本快照與目前帳本不一致，已停止同步以避免覆蓋錯誤資料',
    ))
  }

  const preservedSettings = await listLocalOnlySettingRows(requestedLedgerId)
  const existingLedger = await getLedger(requestedLedgerId)
  const localBackupText = existingLedger
    ? JSON.stringify(sanitizeSnapshotForGoogleDriveSync(await exportLedgerJson(requestedLedgerId)), null, 2)
    : ''

  // smb297: never silently replace a non-empty local ledger with an empty remote snapshot.
  if (existingLedger && localBackupText && options.allowEmptyRemoteReplace !== true) {
    let localTxCount = 0
    try {
      localTxCount = countSnapshotActiveTransactions(JSON.parse(localBackupText))
    } catch {
      localTxCount = 0
    }
    const remoteTxCount = countSnapshotActiveTransactions(normalizedSnapshot)
    if (localTxCount > 0 && remoteTxCount === 0) {
      throw createEmptyRemoteReplaceBlockedError({
        localTransactionCount: localTxCount,
        remoteTransactionCount: remoteTxCount,
        message: t(
          'settings_google_sync.error.empty_remote_replace_blocked',
          { local: localTxCount, remote: remoteTxCount },
          '遠端快照沒有交易（{remote}），但本機仍有 {local} 筆；已阻止覆蓋以避免 silent wipe。請改用合併同步或從備份還原。',
        ),
      })
    }
  }

  muteAutoSync(requestedLedgerId)
  clearLedgerDirty(requestedLedgerId)

  let imported = null
  try {
    if (existingLedger) {
      await purgeLedger(requestedLedgerId)
    }

    // smb297: sync replace must not auto-repair ledger semantics without this-session consent.
    imported = await importLedgerJsonAsNewLedger(JSON.stringify(normalizedSnapshot), {
      keepLedgerId: true,
      ledgerName: String(normalizedSnapshot?.tables?.ledgers?.[0]?.name ?? existingLedger?.name ?? ''),
      runIntegrityRepair: false,
    })
  } catch (error) {
    if (localBackupText) {
      await restoreLocalLedgerFromBackup(requestedLedgerId, localBackupText, existingLedger)
      await restoreSettingRows(requestedLedgerId, preservedSettings)
    }
    throw error
  }

  await restoreSettingRows(imported.ledgerId, preservedSettings)

  const now = nowIso()
  const nextState = await setGoogleDriveLedgerSyncState(imported.ledgerId, {
    ...state,
    enabled: true,
    fileId: String(remoteFile?.id ?? state?.fileId ?? '').trim(),
    filename: buildRemoteFilename(imported.ledgerId),
    lastSyncedAt: now,
    lastPulledAt: now,
    lastRemoteModifiedAt: String(remoteFile?.modifiedTime ?? '').trim(),
    lastSyncStatus: 'ok',
    lastError: '',
  })

  return {
    ledgerId: imported.ledgerId,
    state: nextState,
    imported,
  }
}

async function pushLedgerToGoogleDrive(ledgerId, state, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const interactiveAuth = options?.interactiveAuth !== false
  const { accessToken, profile } = await ensureGoogleAccess({
    interactive: interactiveAuth,
    preferredEmail: state.accountEmail,
    boundEmail: state.accountEmail,
  })
  const reauthHandler = () => reauth({ interactive: interactiveAuth })
  const snapshot = sanitizeSnapshotForGoogleDriveSync(await exportLedgerJson(normalizedLedgerId))
  const uploaded = await uploadBackupJsonToAppDataFolder({
    accessToken,
    reauth: reauthHandler,
    filename: buildRemoteFilename(normalizedLedgerId),
    jsonText: JSON.stringify(snapshot, null, 2),
  })
  const now = nowIso()
  const nextState = await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
    ...state,
    ...buildStatePatchFromProfile(profile),
    enabled: true,
    fileId: String(uploaded?.fileId ?? state.fileId ?? '').trim(),
    filename: buildRemoteFilename(normalizedLedgerId),
    pendingAccountSwitch: null,
    lastSyncedAt: now,
    lastPushedAt: now,
    lastRemoteModifiedAt: String(uploaded?.modifiedTime ?? now).trim(),
    lastSyncStatus: 'ok',
    lastError: '',
  })
  clearLedgerDirty(normalizedLedgerId)
  setBaseSnapshot(normalizedLedgerId, snapshot)
  return {
    action: 'push',
    state: nextState,
    remoteModifiedAt: nextState.lastRemoteModifiedAt,
  }
}

function resolvePullSnapshot({
  baseSnapshot,
  localSnapshot,
  remoteSnapshot,
  dirtyMarkedAt,
}) {
  if (baseSnapshot) {
    const { mergedSnapshot, hasConflicts, conflicts } = threeWayMergeSnapshots(
      baseSnapshot,
      localSnapshot,
      remoteSnapshot,
      { prefer: 'remote' },
    )
    return {
      snapshot: mergedSnapshot,
      hasConflicts,
      conflictCount: conflicts.length,
      mergeMode: 'three_way',
    }
  }

  if (dirtyMarkedAt) {
    const twoWay = mergeSharedLedgerSnapshots(localSnapshot, remoteSnapshot, {
      prefer: 'remote',
      detectConflicts: true,
    })
    return {
      snapshot: twoWay.mergedSnapshot,
      hasConflicts: twoWay.hasConflicts,
      conflictCount: twoWay.conflicts.length,
      mergeMode: 'two_way',
    }
  }

  return {
    snapshot: remoteSnapshot,
    hasConflicts: false,
    conflictCount: 0,
    mergeMode: 'remote_only',
  }
}

async function finalizePullResult(ledgerId, replaced, mergeMeta) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  setBaseSnapshot(normalizedLedgerId, mergeMeta.snapshot)
  const nextState = await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
    ...replaced.state,
    pendingAccountSwitch: null,
    lastConflictCount: mergeMeta.conflictCount,
    lastSyncStatus: mergeMeta.hasConflicts ? 'conflict_resolved' : 'ok',
    lastError: '',
  })
  return {
    action: 'pull',
    state: nextState,
    ledgerId: replaced.ledgerId,
    imported: replaced.imported,
    hasConflicts: mergeMeta.hasConflicts,
    conflictCount: mergeMeta.conflictCount,
    mergeMode: mergeMeta.mergeMode,
  }
}

async function pullLedgerFromGoogleDrive(ledgerId, state, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const interactiveAuth = options?.interactiveAuth !== false
  const { accessToken, profile } = await ensureGoogleAccess({
    interactive: interactiveAuth,
    preferredEmail: state.accountEmail,
    boundEmail: state.accountEmail,
  })
  const reauthHandler = () => reauth({ interactive: interactiveAuth })
  const remoteFile = await loadRemoteLedgerFile(normalizedLedgerId, accessToken, reauthHandler)
  if (!remoteFile?.id) {
    return pushLedgerToGoogleDrive(normalizedLedgerId, state, options)
  }

  const jsonText = await downloadAppDataBackupText({
    accessToken,
    reauth: reauthHandler,
    fileId: remoteFile.id,
  })
  const remoteSnapshot = JSON.parse(jsonText)
  const baseSnapshot = getBaseSnapshot(normalizedLedgerId)
  const localSnapshot = sanitizeSnapshotForGoogleDriveSync(await exportLedgerJson(normalizedLedgerId))
  const dirtyMarkedAt = getLedgerDirtyMarkedAt(normalizedLedgerId)
  const mergeMeta = resolvePullSnapshot({
    baseSnapshot,
    localSnapshot,
    remoteSnapshot,
    dirtyMarkedAt,
  })
  const replaced = await replaceLocalLedgerWithRemoteSnapshot(mergeMeta.snapshot, normalizedLedgerId, {
    ...state,
    ...buildStatePatchFromProfile(profile),
  }, remoteFile)

  return finalizePullResult(normalizedLedgerId, replaced, mergeMeta)
}

function shouldPullRemote(state, remoteFile, dirtyMarkedAt) {
  const remoteModifiedMs = dateMs(remoteFile?.modifiedTime)
  if (!remoteModifiedMs) return false
  const lastRemoteModifiedMs = dateMs(state.lastRemoteModifiedAt)
  if (!dirtyMarkedAt) {
    return !lastRemoteModifiedMs || remoteModifiedMs > lastRemoteModifiedMs
  }
  return remoteModifiedMs > lastRemoteModifiedMs && remoteModifiedMs > dateMs(dirtyMarkedAt)
}

async function resolveSyncAction(ledgerId, state, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const interactiveAuth = options?.interactiveAuth !== false
  const { accessToken } = await ensureGoogleAccess({
    interactive: interactiveAuth,
    preferredEmail: state.accountEmail,
    boundEmail: state.accountEmail,
  })
  const reauthHandler = () => reauth({ interactive: interactiveAuth })
  const remoteFile = await loadRemoteLedgerFile(normalizedLedgerId, accessToken, reauthHandler)
  const dirtyMarkedAt = getLedgerDirtyMarkedAt(normalizedLedgerId)

  if (!remoteFile?.id) {
    return pushLedgerToGoogleDrive(normalizedLedgerId, state, options)
  }

  if (shouldPullRemote(state, remoteFile, dirtyMarkedAt)) {
    return pullLedgerFromGoogleDrive(normalizedLedgerId, state, options)
  }

  if (dirtyMarkedAt || !state.lastSyncedAt) {
    return pushLedgerToGoogleDrive(normalizedLedgerId, state, options)
  }

  return {
    action: 'noop',
    state: await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
      ...state,
      fileId: String(remoteFile.id ?? state.fileId ?? '').trim(),
      filename: buildRemoteFilename(normalizedLedgerId),
      lastRemoteModifiedAt: String(remoteFile.modifiedTime ?? state.lastRemoteModifiedAt ?? '').trim(),
      lastSyncStatus: state.lastSyncStatus || 'idle',
    }),
  }
}

export async function setGoogleDriveLedgerSyncEnabled(ledgerId, enabled, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error(t('settings_google_sync.error.missing_ledger_id', null, '缺少帳本 ID'))
  const current = await getGoogleDriveLedgerSyncState(normalizedLedgerId)
  if (!enabled) {
    clearLedgerDirty(normalizedLedgerId)
    clearBaseSnapshot(normalizedLedgerId)
    return setGoogleDriveLedgerSyncState(normalizedLedgerId, {
      ...current,
      enabled: false,
      lastSyncStatus: 'idle',
      lastError: '',
    })
  }

  assertGoogleDriveLedgerSyncMembershipAccess()

  const { profile } = await ensureGoogleAccess({
    interactive: options?.interactiveAuth !== false,
    preferredEmail: current.accountEmail,
    boundEmail: current.accountEmail,
  })

  const next = await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
    ...current,
    ...buildStatePatchFromProfile(profile),
    enabled: true,
    filename: buildRemoteFilename(normalizedLedgerId),
    lastError: '',
  })

  return resolveSyncAction(normalizedLedgerId, next, options)
    .then((result) => result.state)
    .catch(async (error) => {
      await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
        ...next,
        lastSyncStatus: 'error',
        lastError: String(error?.message ?? error ?? '').trim()
          || t('settings_google_sync.error.sync_failed', null, '帳本同步失敗'),
      })
      throw error
    })
}

export async function syncGoogleDriveLedgerNow(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error(t('settings_google_sync.error.missing_ledger_id', null, '缺少帳本 ID'))
  assertGoogleDriveLedgerSyncMembershipAccess()
  if (syncingLedgerIds.has(normalizedLedgerId)) {
    return {
      action: 'noop',
      state: await getGoogleDriveLedgerSyncState(normalizedLedgerId),
    }
  }

  const state = await getGoogleDriveLedgerSyncState(normalizedLedgerId)
  if (!state.enabled) {
    throw new Error(t('settings_google_sync.error.sync_not_enabled', null, '此帳本尚未啟用帳本同步'))
  }

  syncingLedgerIds.add(normalizedLedgerId)
  try {
    return await resolveSyncAction(normalizedLedgerId, state, options)
  } catch (error) {
    if (error?.code === 'GOOGLE_ACCOUNT_SWITCHED') {
      await recordAccountSwitchMismatch(normalizedLedgerId, state, error)
    } else {
      await setGoogleDriveLedgerSyncState(normalizedLedgerId, {
        ...state,
        lastSyncStatus: error?.code === EMPTY_REMOTE_REPLACE_BLOCKED_CODE ? 'empty_remote_blocked' : 'error',
        lastError: String(error?.message ?? error ?? '').trim()
          || t('settings_google_sync.error.sync_failed', null, '帳本同步失敗'),
      })
    }
    throw error
  } finally {
    syncingLedgerIds.delete(normalizedLedgerId)
  }
}

async function syncSingleDirtyLedger(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId || syncingLedgerIds.has(normalizedLedgerId) || isAutoSyncMuted(normalizedLedgerId)) {
    return { changed: false }
  }
  const state = await getGoogleDriveLedgerSyncState(normalizedLedgerId)
  if (!state.enabled) {
    clearLedgerDirty(normalizedLedgerId)
    return { changed: false }
  }

  try {
    const result = await syncGoogleDriveLedgerNow(normalizedLedgerId, { interactiveAuth: false })
    return { changed: result.action === 'pull', pulledLedgerId: result.ledgerId ?? normalizedLedgerId }
  } catch (error) {
    if (error?.code === 'GOOGLE_ACCOUNT_SWITCHED') {
      await recordAccountSwitchMismatch(normalizedLedgerId, state, error)
    } else {
      console.warn('[google-ledger-sync] dirty sync failed', normalizedLedgerId, error)
    }
    return { changed: false }
  }
}

async function flushDirtyLedgers(pinia) {
  if (!hasGoogleDriveLedgerSyncMembershipAccess()) return { pulledLedgerIds: [] }
  if (!isOnline() || !hasCachedGoogleAuthSession()) return { pulledLedgerIds: [] }
  const ledgerStore = useLedgerStore(pinia)
  const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  const dirtyLedgerIds = listDirtyLedgerIds()
    .sort((left, right) => {
      if (left === activeLedgerId) return -1
      if (right === activeLedgerId) return 1
      return 0
    })

  const pulledLedgerIds = []
  for (const ledgerId of dirtyLedgerIds) {
    if (!hasDirtyLedger(ledgerId)) continue
    const result = await syncSingleDirtyLedger(ledgerId)
    if (result.pulledLedgerId) {
      pulledLedgerIds.push(result.pulledLedgerId)
    }
  }
  return { pulledLedgerIds }
}

async function syncEnabledLedgersLatest(pinia) {
  if (!hasGoogleDriveLedgerSyncMembershipAccess()) return { pulledLedgerIds: [] }
  if (!isOnline() || !hasCachedGoogleAuthSession()) return { pulledLedgerIds: [] }
  const ledgerStore = useLedgerStore(pinia)
  const bindings = await listGoogleDriveLedgerSyncBindings(ledgerStore.ledgers)
  const pulledLedgerIds = []

  for (const binding of bindings) {
    const ledgerId = String(binding?.ledgerId ?? '').trim()
    if (!ledgerId || !binding?.state?.enabled || syncingLedgerIds.has(ledgerId) || isAutoSyncMuted(ledgerId) || hasDirtyLedger(ledgerId)) {
      continue
    }
    try {
      const result = await syncGoogleDriveLedgerNow(ledgerId, { interactiveAuth: false })
      if (result.action === 'pull') {
        pulledLedgerIds.push(ledgerId)
      }
    } catch (error) {
      if (error?.code === 'GOOGLE_ACCOUNT_SWITCHED') {
        await recordAccountSwitchMismatch(ledgerId, binding.state, error)
      } else {
        console.warn('[google-ledger-sync] latest sync failed', ledgerId, error)
      }
    }
  }

  return { pulledLedgerIds }
}

async function reloadLedgersAfterRemotePull(pinia, pulledLedgerIds = []) {
  if (!pulledLedgerIds.length) return
  const ledgerStore = useLedgerStore(pinia)
  const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (pulledLedgerIds.includes(activeLedgerId)) {
    await ledgerStore.reloadActiveLedger()
    return
  }
  await ledgerStore.refresh()
}

export function runGoogleDriveLedgerBackgroundSyncNow(pinia) {
  if (!hasGoogleDriveLedgerSyncMembershipAccess()) {
    return Promise.resolve()
  }
  backgroundSyncPromise = Promise.resolve(backgroundSyncPromise)
    .catch(() => null)
    .then(async () => {
      const flushed = await flushDirtyLedgers(pinia)
      const latest = await syncEnabledLedgersLatest(pinia)
      const pulledLedgerIds = [...new Set([...(flushed.pulledLedgerIds ?? []), ...(latest.pulledLedgerIds ?? [])])]
      await reloadLedgersAfterRemotePull(pinia, pulledLedgerIds)
    })

  return backgroundSyncPromise
}

export function scheduleActiveGoogleDriveLedgerSync(pinia, delayMs = AUTO_PUSH_DEBOUNCE_MS) {
  if (typeof window === 'undefined') return
  if (autoSyncTimer != null) {
    window.clearTimeout(autoSyncTimer)
  }
  autoSyncTimer = window.setTimeout(async () => {
    autoSyncTimer = null
    if (!hasGoogleDriveLedgerSyncMembershipAccess()) return
    const ledgerStore = useLedgerStore(pinia)
    const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
    if (!activeLedgerId || isAutoSyncMuted(activeLedgerId)) return

    const state = await getGoogleDriveLedgerSyncState(activeLedgerId)
    if (!state.enabled) return

    markLedgerDirty(activeLedgerId)
    void runGoogleDriveLedgerBackgroundSyncNow(pinia)
  }, Math.max(200, Number(delayMs) || 0))
}

export function initGoogleDriveLedgerSync(pinia) {
  if (typeof window === 'undefined' || backgroundSyncReady) return
  backgroundSyncReady = true
  if (!hasGoogleDriveLedgerSyncMembershipAccess()) return () => {
    backgroundSyncReady = false
  }
  void runGoogleDriveLedgerBackgroundSyncNow(pinia)
  return () => {
    backgroundSyncReady = false
  }
}
