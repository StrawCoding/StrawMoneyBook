import { getLedger, purgeLedger } from '@/core/repositories/ledger.repo'
import { getSetting, removeSetting, setSetting } from '@/core/repositories/settings.repo'
import { exportLedgerJson } from '@/core/services/export.service'
import { importLedgerJsonAsNewLedger } from '@/core/services/import.service'
import { nowIso } from '@/core/utils/id'
import { formatSyncForeignKeyError, rethrowAsForeignKeyError } from '@/core/utils/sqlite-fk'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { isLocalOnlyAppSettingKey } from '@/ui/services/local-only-app-settings'
import {
  areSharedLedgerSnapshotsEquivalent,
  buildMergeLog,
  mergeSharedLedgerSnapshots,
  normalizeSharedLedgerSnapshot,
  threeWayMergeSnapshots,
} from '@/ui/services/shared-ledger/snapshot-merge'
import {
  acceptSharedLedgerInvitation,
  createSharedLedger,
  deleteSharedLedger,
  ensureSharedLedgerSessionReady,
  getSharedLedgerDetail,
  getSharedLedgerSession,
  getSharedLedgerSnapshot,
  hasSharedLedgerMembershipAccess,
  inviteSharedLedgerByEmail,
  joinSharedLedger,
  listPendingSharedLedgerInvitations,
  listSharedLedgerOutgoingInvitations,
  listSharedLedgers,
  pushSharedLedgerSnapshot,
  resendSharedLedgerInvitation,
  needsSharedLedgerReauth,
  transferSharedLedgerOwnership,
  updateSharedLedgerMemberRole,
} from '@/services/shared-ledger/backend'

// Mirror of the backend permission matrix in store-shared-ledgers.js so the
// client can skip pushes that the server would reject (viewer = read-only).
export function sharedLedgerRoleCanPush(role) {
  const normalized = String(role ?? '').trim().toLowerCase()
  return normalized === 'owner' || normalized === 'admin' || normalized === 'member'
}

const SHARED_LEDGER_META_KEY = 'shared_ledger_meta'
const DIRTY_QUEUE_STORAGE_KEY = 'straw.shared_ledger_dirty_queue'
const BASE_SNAPSHOT_STORAGE_KEY = 'straw.shared_ledger_base_snapshot'
const AUTO_PUSH_DEBOUNCE_MS = 800
const IMPORT_SYNC_MUTE_MS = 15000

let autoSyncTimer = null
let backgroundSyncPromise = null
let backgroundSyncReady = false
const mutedLedgerSyncUntil = new Map()
const syncingLedgerIds = new Set()

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

async function markActiveLedgerSyncGate(pinia, status, errorMessage) {
  try {
    const ledgerStore = useLedgerStore(pinia)
    const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
    if (!activeLedgerId) return
    const meta = await getSharedLedgerMeta(activeLedgerId)
    if (!meta?.shared_ledger_id) return
    const previousStatus = String(meta.last_sync_status ?? '').trim().toLowerCase()
    const previousError = String(meta.last_sync_error ?? '').trim()
    const nextError = String(errorMessage ?? '').trim().slice(0, 240)
    if (previousStatus === status && previousError === nextError) return
    await setSharedLedgerMeta(activeLedgerId, meta, {
      last_sync_status: status,
      last_sync_error: nextError,
    })
  } catch {
    // Ignore meta write failures during gate checks.
  }
}

async function assertSharedLedgerSyncAllowed(pinia) {
  if (!isOnline()) {
    await markActiveLedgerSyncGate(
      pinia,
      'paused_offline',
      '目前離線，連上網路後將自動重試',
    )
    return false
  }
  const auth = await ensureSharedLedgerSessionReady()
  if (!auth.canUseApi) {
    if (auth.needsReauth) {
      await markActiveLedgerSyncGate(
        pinia,
        'paused_reauth',
        '需重新登入後才能同步共同帳本',
      )
    } else if (auth.restoring || auth.hasProfile || auth.hasRestoreCandidate) {
      await markActiveLedgerSyncGate(
        pinia,
        'paused_session',
        '登入狀態恢復中，稍後自動重試同步',
      )
    }
    return false
  }
  if (!hasSharedLedgerMembershipAccess()) {
    await markActiveLedgerSyncGate(
      pinia,
      'paused_membership',
      '需有效會員才能同步共同帳本',
    )
    return false
  }
  return true
}

function readDirtyLedgerQueue() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRTY_QUEUE_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([ledgerId, markedAt]) => [String(ledgerId ?? '').trim(), String(markedAt ?? '').trim()])
        .filter(([ledgerId]) => Boolean(ledgerId)),
    )
  } catch {
    return {}
  }
}

function writeDirtyLedgerQueue(queue) {
  if (typeof localStorage === 'undefined') return
  const nextQueue = {}
  for (const [ledgerId, markedAt] of Object.entries(queue ?? {})) {
    const normalizedLedgerId = String(ledgerId ?? '').trim()
    if (!normalizedLedgerId) continue
    nextQueue[normalizedLedgerId] = String(markedAt ?? '').trim() || nowIso()
  }
  if (!Object.keys(nextQueue).length) {
    localStorage.removeItem(DIRTY_QUEUE_STORAGE_KEY)
    return
  }
  localStorage.setItem(DIRTY_QUEUE_STORAGE_KEY, JSON.stringify(nextQueue))
}

function markLedgerDirty(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  const queue = readDirtyLedgerQueue()
  queue[normalizedLedgerId] = nowIso()
  writeDirtyLedgerQueue(queue)
}

function clearLedgerDirty(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  const queue = readDirtyLedgerQueue()
  delete queue[normalizedLedgerId]
  writeDirtyLedgerQueue(queue)
}

function hasDirtyLedger(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return false
  return Object.prototype.hasOwnProperty.call(readDirtyLedgerQueue(), normalizedLedgerId)
}

function listDirtyLedgerIds() {
  return Object.keys(readDirtyLedgerQueue())
}

function readBaseSnapshotMap() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(BASE_SNAPSHOT_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeBaseSnapshotMap(map) {
  if (typeof localStorage === 'undefined') return
  const entries = Object.entries(map ?? {})
    .map(([ledgerId, snapshot]) => [String(ledgerId ?? '').trim(), snapshot])
    .filter(([ledgerId, snapshot]) => Boolean(ledgerId) && snapshot && typeof snapshot === 'object')
  try {
    if (!entries.length) {
      localStorage.removeItem(BASE_SNAPSHOT_STORAGE_KEY)
      return
    }
    localStorage.setItem(BASE_SNAPSHOT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch (error) {
    // Quota / private mode: keep sync working but fall back to two-way merge later.
    console.warn('[shared-ledger] failed to persist base snapshot map', error)
  }
}

function getBaseSnapshot(ledgerId) {
  return readBaseSnapshotMap()[String(ledgerId ?? '').trim()] ?? null
}

function setBaseSnapshot(ledgerId, snapshot) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  const map = readBaseSnapshotMap()
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

function sanitizeSnapshotForSharedSync(snapshot) {
  const normalized = cloneJson(snapshot)
  if (!normalized || typeof normalized !== 'object') {
    throw new Error('帳本快照格式錯誤')
  }
  const appSettings = Array.isArray(normalized?.tables?.app_settings) ? normalized.tables.app_settings : []
  normalized.tables.app_settings = appSettings.filter((row) => !isLocalOnlyAppSettingKey(row?.key))
  normalized.exported_at = new Date().toISOString()
  return normalizeSharedLedgerSnapshot(normalized)
}

function resolveSharedLedgerPullSnapshot({
  baseSnapshot,
  localSnapshot,
  remoteSnapshot,
  dirtyMarkedAt,
}) {
  if (baseSnapshot) {
    const threeWay = threeWayMergeSnapshots(baseSnapshot, localSnapshot, remoteSnapshot, {
      prefer: 'remote',
    })
    return {
      snapshot: threeWay.mergedSnapshot,
      hasConflicts: threeWay.hasConflicts,
      conflictCount: threeWay.conflicts.length,
      conflicts: threeWay.conflicts,
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
      conflicts: twoWay.conflicts,
      mergeMode: 'two_way',
    }
  }

  return {
    snapshot: remoteSnapshot,
    hasConflicts: false,
    conflictCount: 0,
    conflicts: [],
    mergeMode: 'remote_only',
  }
}

function buildSyncStatusPatch(mergeMeta = null) {
  if (!mergeMeta?.hasConflicts) {
    return {
      last_sync_status: 'ok',
      last_sync_error: '',
      last_conflict_count: 0,
      last_merge_log: null,
    }
  }

  const conflictCount = Number(mergeMeta.conflictCount ?? mergeMeta.conflicts?.length ?? 0) || 0
  const mergeLog = mergeMeta.mergeLog || buildMergeLog(mergeMeta.conflicts ?? [], {
    prefer: 'remote',
    mergeMode: mergeMeta.mergeMode || 'unknown',
  })
  return {
    last_sync_status: 'conflict_resolved',
    last_sync_error: `已安全合併 ${conflictCount} 處衝突（可於同步狀態查看）`,
    last_conflict_count: conflictCount,
    last_merge_log: mergeLog,
  }
}

function buildSharedMeta(item, existingMeta = {}, patch = {}) {
  return {
    shared_ledger_id: String(item?.id ?? existingMeta?.shared_ledger_id ?? ''),
    ledger_id: String(item?.ledger_id ?? existingMeta?.ledger_id ?? ''),
    remote_name: String(item?.name ?? existingMeta?.remote_name ?? ''),
    invite_code: String(patch.invite_code ?? item?.invite_code ?? existingMeta?.invite_code ?? ''),
    role: String(item?.role ?? existingMeta?.role ?? ''),
    version: Number(item?.version ?? existingMeta?.version ?? 0),
    auto_sync_enabled: patch.auto_sync_enabled ?? existingMeta?.auto_sync_enabled ?? true,
    updated_at: String(item?.updated_at ?? patch.updated_at ?? existingMeta?.updated_at ?? ''),
    last_synced_at: patch.last_synced_at ?? existingMeta?.last_synced_at ?? null,
    last_pulled_at: patch.last_pulled_at ?? existingMeta?.last_pulled_at ?? null,
    last_pushed_at: patch.last_pushed_at ?? existingMeta?.last_pushed_at ?? null,
    last_sync_status: patch.last_sync_status ?? existingMeta?.last_sync_status ?? 'idle',
    last_sync_error: patch.last_sync_error === undefined
      ? (existingMeta?.last_sync_error ?? '')
      : String(patch.last_sync_error ?? ''),
    last_conflict_count: patch.last_conflict_count === undefined
      ? Number(existingMeta?.last_conflict_count ?? 0) || 0
      : Number(patch.last_conflict_count ?? 0) || 0,
    last_merge_log: patch.last_merge_log === undefined
      ? (existingMeta?.last_merge_log ?? null)
      : patch.last_merge_log,
  }
}

function muteAutoSync(ledgerId, durationMs = IMPORT_SYNC_MUTE_MS) {
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

export async function getSharedLedgerMeta(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return null
  const meta = await getSetting(normalizedLedgerId, SHARED_LEDGER_META_KEY)
  if (!meta || typeof meta !== 'object') return null
  return meta
}

export async function setSharedLedgerMeta(ledgerId, item, patch = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')
  const existingMeta = await getSharedLedgerMeta(normalizedLedgerId)
  const nextMeta = buildSharedMeta(item, existingMeta, patch)
  await setSetting(normalizedLedgerId, SHARED_LEDGER_META_KEY, nextMeta)
  return nextMeta
}

export async function clearSharedLedgerMeta(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return
  await removeSetting(normalizedLedgerId, SHARED_LEDGER_META_KEY)
  clearLedgerDirty(normalizedLedgerId)
  clearBaseSnapshot(normalizedLedgerId)
}

export async function setSharedLedgerAutoSyncEnabled(ledgerId, enabled) {
  const meta = await getSharedLedgerMeta(ledgerId)
  if (!meta?.shared_ledger_id) {
    throw new Error('此帳本尚未綁定共同帳本')
  }
  await setSharedLedgerMeta(ledgerId, meta, {
    auto_sync_enabled: Boolean(enabled),
  })
}

export async function listLocalSharedLedgerBindings(ledgers = []) {
  const results = await Promise.all(
    ledgers.map(async (ledger) => {
      const meta = await getSharedLedgerMeta(ledger.id)
      return meta?.shared_ledger_id
        ? {
            ledgerId: ledger.id,
            ledgerName: ledger.name,
            meta,
          }
        : null
    }),
  )
  return results.filter(Boolean)
}

async function replaceLocalLedgerWithSnapshot(snapshot, item, existingMeta = null, metaPatch = {}) {
  const normalizedSnapshot = sanitizeSnapshotForSharedSync(snapshot)
  const ledgerId = String(normalizedSnapshot?.ledger_id ?? '').trim()
  if (!ledgerId) {
    throw new Error('共同帳本快照缺少 ledger_id')
  }

  muteAutoSync(ledgerId)
  clearLedgerDirty(ledgerId)

  const existingLedger = await getLedger(ledgerId)
  const existingSnapshot = existingLedger ? await exportLedgerJson(ledgerId) : null
  let purgedExistingLedger = false
  let imported = null

  try {
    if (existingLedger) {
      await purgeLedger(ledgerId)
      purgedExistingLedger = true
    }

    // smb297: never auto-run repairLedgerData on sync replace — FK preserve + insert only.
    imported = await importLedgerJsonAsNewLedger(JSON.stringify(normalizedSnapshot), {
      keepLedgerId: true,
      ledgerName: String(item?.name ?? ''),
      runIntegrityRepair: false,
    })
  } catch (error) {
    if (purgedExistingLedger && existingSnapshot) {
      try {
        await purgeLedger(ledgerId)
        await importLedgerJsonAsNewLedger(JSON.stringify(existingSnapshot), {
          keepLedgerId: true,
          ledgerName: existingLedger.name,
          runIntegrityRepair: false,
        })
      } catch (restoreError) {
        console.error('[shared-ledger] failed to restore local ledger after snapshot import failure', restoreError)
      }
    }
    rethrowAsForeignKeyError(error)
  }

  const now = nowIso()
  setBaseSnapshot(ledgerId, normalizedSnapshot)
  const nextMeta = await setSharedLedgerMeta(imported.ledgerId, item, {
    auto_sync_enabled: existingMeta?.auto_sync_enabled ?? true,
    last_synced_at: now,
    last_pulled_at: metaPatch.last_pulled_at ?? now,
    last_pushed_at: metaPatch.last_pushed_at ?? existingMeta?.last_pushed_at ?? null,
    last_sync_status: metaPatch.last_sync_status ?? 'ok',
    last_sync_error: metaPatch.last_sync_error === undefined ? '' : metaPatch.last_sync_error,
    last_conflict_count: metaPatch.last_conflict_count === undefined
      ? 0
      : metaPatch.last_conflict_count,
    last_merge_log: metaPatch.last_merge_log === undefined ? null : metaPatch.last_merge_log,
  })

  return {
    ledgerId: imported.ledgerId,
    meta: nextMeta,
    imported,
  }
}

export async function publishLedgerAsShared(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')

  const snapshot = sanitizeSnapshotForSharedSync(await exportLedgerJson(normalizedLedgerId))
  const result = await createSharedLedger({
    name: String(options?.name ?? '').trim(),
    snapshot,
  })

  const now = nowIso()
  const meta = await setSharedLedgerMeta(normalizedLedgerId, result.item, {
    last_synced_at: now,
    last_pulled_at: now,
    last_pushed_at: now,
    auto_sync_enabled: true,
  })
  clearLedgerDirty(normalizedLedgerId)
  setBaseSnapshot(normalizedLedgerId, snapshot)

  return {
    item: result.item,
    meta,
  }
}

export async function pushLocalLedgerToShared(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')

  const meta = await getSharedLedgerMeta(normalizedLedgerId)
  if (!meta?.shared_ledger_id) {
    throw new Error('此帳本尚未綁定共同帳本')
  }

  if (!sharedLedgerRoleCanPush(meta.role)) {
    const error = new Error('唯讀成員無法上傳共同帳本變更')
    error.code = 'shared_ledger_forbidden'
    throw error
  }

  const ledger = await getLedger(normalizedLedgerId)
  const snapshot = sanitizeSnapshotForSharedSync(await exportLedgerJson(normalizedLedgerId))
  let result = null
  let resolvedSnapshot = null
  let mergeMeta = null

  try {
    result = await pushSharedLedgerSnapshot(meta.shared_ledger_id, {
      baseVersion: Number(meta.version ?? 0),
      force: Boolean(options.force),
      name: String(ledger?.name ?? ''),
      snapshot,
    })
  } catch (error) {
    const shouldMergeOnConflict = Boolean(options.mergeOnConflict || options.forceOnConflict)
    if (!shouldMergeOnConflict || String(error?.code ?? '') !== 'version_conflict') {
      throw error
    }

    const remote = await getSharedLedgerSnapshot(meta.shared_ledger_id)
    const remoteSnapshot = sanitizeSnapshotForSharedSync(remote.snapshot)
    const baseSnapshot = getBaseSnapshot(normalizedLedgerId)

    let mergedSnapshot = null
    let conflicts = []
    let hasConflicts = false
    let mergeMode = 'two_way'

    if (baseSnapshot) {
      const threeWay = threeWayMergeSnapshots(baseSnapshot, snapshot, remoteSnapshot, { prefer: 'remote' })
      mergedSnapshot = threeWay.mergedSnapshot
      conflicts = threeWay.conflicts
      hasConflicts = threeWay.hasConflicts
      mergeMode = 'three_way'
    } else {
      const twoWay = mergeSharedLedgerSnapshots(snapshot, remoteSnapshot, {
        prefer: 'remote',
        detectConflicts: true,
      })
      mergedSnapshot = twoWay.mergedSnapshot
      conflicts = twoWay.conflicts
      hasConflicts = twoWay.hasConflicts
      mergeMode = 'two_way'
    }

    mergeMeta = {
      hasConflicts,
      conflictCount: conflicts.length,
      conflicts,
      mergeMode,
      mergeLog: buildMergeLog(conflicts, { prefer: 'remote', mergeMode }),
    }

    if (areSharedLedgerSnapshotsEquivalent(mergedSnapshot, remoteSnapshot)) {
      const statusPatch = buildSyncStatusPatch(mergeMeta)
      const synced = await replaceLocalLedgerWithSnapshot(remoteSnapshot, remote.item, meta, {
        last_pushed_at: meta.last_pushed_at ?? null,
        ...statusPatch,
      })
      return {
        item: remote.item,
        meta: synced.meta,
        merged: true,
        pulled: true,
        ...mergeMeta,
      }
    }

    resolvedSnapshot = mergedSnapshot
    result = await pushSharedLedgerSnapshot(meta.shared_ledger_id, {
      baseVersion: Number(remote?.item?.version ?? error?.currentVersion ?? meta.version ?? 0),
      force: true,
      name: String(ledger?.name ?? remote?.item?.name ?? ''),
      snapshot: mergedSnapshot,
    })
  }

  const now = nowIso()
  const statusPatch = buildSyncStatusPatch(mergeMeta)
  if (resolvedSnapshot) {
    await replaceLocalLedgerWithSnapshot(resolvedSnapshot, result.item, meta, {
      last_pulled_at: now,
      last_pushed_at: now,
      ...statusPatch,
    })
  }
  const nextMeta = await setSharedLedgerMeta(normalizedLedgerId, result.item, {
    auto_sync_enabled: meta.auto_sync_enabled ?? true,
    last_synced_at: now,
    last_pushed_at: now,
    last_pulled_at: resolvedSnapshot ? now : (meta.last_pulled_at ?? null),
    ...statusPatch,
  })
  clearLedgerDirty(normalizedLedgerId)
  setBaseSnapshot(normalizedLedgerId, resolvedSnapshot ?? snapshot)

  return {
    item: result.item,
    meta: nextMeta,
    merged: Boolean(resolvedSnapshot),
    ...mergeMeta,
  }
}

export async function pullSharedLedgerToLocal(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')

  const meta = await getSharedLedgerMeta(normalizedLedgerId)
  if (!meta?.shared_ledger_id) {
    throw new Error('此帳本尚未綁定共同帳本')
  }

  const result = await getSharedLedgerSnapshot(meta.shared_ledger_id)
  const remoteSnapshot = sanitizeSnapshotForSharedSync(result.snapshot)
  const existingLedger = await getLedger(normalizedLedgerId)
  const dirtyMarkedAt = readDirtyLedgerQueue()[normalizedLedgerId] || null
  const baseSnapshot = getBaseSnapshot(normalizedLedgerId)

  let mergeMeta = {
    snapshot: remoteSnapshot,
    hasConflicts: false,
    conflictCount: 0,
    conflicts: [],
    mergeMode: 'remote_only',
  }

  // Never hard-replace over local changes: merge using base/dirty when present.
  if (existingLedger && (dirtyMarkedAt || baseSnapshot || options.forceMerge)) {
    const localSnapshot = sanitizeSnapshotForSharedSync(await exportLedgerJson(normalizedLedgerId))
    mergeMeta = resolveSharedLedgerPullSnapshot({
      baseSnapshot,
      localSnapshot,
      remoteSnapshot,
      dirtyMarkedAt,
    })
  }

  const statusPatch = buildSyncStatusPatch(mergeMeta)
  const synced = await replaceLocalLedgerWithSnapshot(mergeMeta.snapshot, result.item, meta, statusPatch)
  setBaseSnapshot(normalizedLedgerId, mergeMeta.snapshot)

  // If merge kept local-only edits that remote lacks, editors must push them.
  if (
    sharedLedgerRoleCanPush(meta.role)
    && !areSharedLedgerSnapshotsEquivalent(mergeMeta.snapshot, remoteSnapshot)
  ) {
    markLedgerDirty(normalizedLedgerId)
  }

  return {
    ...synced,
    merged: mergeMeta.mergeMode !== 'remote_only',
    hasConflicts: mergeMeta.hasConflicts,
    conflictCount: mergeMeta.conflictCount,
    mergeMode: mergeMeta.mergeMode,
    mergeLog: mergeMeta.hasConflicts
      ? buildMergeLog(mergeMeta.conflicts, { prefer: 'remote', mergeMode: mergeMeta.mergeMode })
      : null,
  }
}

export async function importRemoteSharedLedgerToLocal(sharedLedgerId) {
  const result = await getSharedLedgerSnapshot(sharedLedgerId)
  const ledgerId = String(result?.item?.ledger_id ?? '').trim()
  const existingMeta = await getSharedLedgerMeta(ledgerId)
  const existingLedger = ledgerId ? await getLedger(ledgerId) : null

  // Already bound locally: pull with merge instead of silent overwrite.
  if (existingLedger && existingMeta?.shared_ledger_id === String(sharedLedgerId)) {
    return pullSharedLedgerToLocal(ledgerId)
  }

  const synced = await replaceLocalLedgerWithSnapshot(result.snapshot, result.item, existingMeta)
  setBaseSnapshot(synced.ledgerId, result.snapshot)
  return synced
}

export async function acceptSharedLedgerInvitationToLocal(invitationId) {
  const result = await acceptSharedLedgerInvitation(invitationId)
  const existingMeta = await getSharedLedgerMeta(String(result?.item?.ledger_id ?? ''))
  const imported = await replaceLocalLedgerWithSnapshot(result.snapshot, result.item, existingMeta)
  setBaseSnapshot(imported.ledgerId, result.snapshot)
  return {
    ...result,
    ...imported,
  }
}

export async function joinSharedLedgerByLinkToLocal(inviteCodeOrLink) {
  const result = await joinSharedLedger(inviteCodeOrLink)
  const existingMeta = await getSharedLedgerMeta(String(result?.item?.ledger_id ?? ''))
  const imported = await replaceLocalLedgerWithSnapshot(result.snapshot, result.item, existingMeta)
  setBaseSnapshot(imported.ledgerId, result.snapshot)
  return {
    ...result,
    ...imported,
  }
}

export async function listRemoteSharedLedgers() {
  const data = await listSharedLedgers()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    pendingInvitations: Array.isArray(data?.pending_invitations) ? data.pending_invitations : [],
  }
}

export async function listRemotePendingSharedLedgerInvitations() {
  const data = await listPendingSharedLedgersSafe()
  return data.items
}

export async function listOutgoingSharedLedgerInvitations(sharedLedgerId) {
  const data = await listSharedLedgerOutgoingInvitations(sharedLedgerId)
  return Array.isArray(data?.items) ? data.items : []
}

export async function inviteRemoteSharedLedgerByEmail(sharedLedgerId, email) {
  return inviteSharedLedgerByEmail(sharedLedgerId, email)
}

export async function resendRemoteSharedLedgerInvitation(sharedLedgerId, invitationId) {
  return resendSharedLedgerInvitation(sharedLedgerId, invitationId)
}

export async function listSharedLedgerMembers(sharedLedgerId) {
  const data = await getSharedLedgerDetail(sharedLedgerId)
  return {
    item: data?.item ?? null,
    members: Array.isArray(data?.members) ? data.members : [],
  }
}

export async function updateRemoteSharedLedgerMemberRole(sharedLedgerId, memberUserId, role) {
  return updateSharedLedgerMemberRole(sharedLedgerId, memberUserId, role)
}

export async function transferRemoteSharedLedgerOwnership(sharedLedgerId, targetUserId) {
  return transferSharedLedgerOwnership(sharedLedgerId, targetUserId)
}

async function listPendingSharedLedgersSafe() {
  const data = await listPendingSharedLedgerInvitations()
  return {
    items: Array.isArray(data?.items) ? data.items : [],
  }
}

function createStopSharingError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

async function assertStopSharingSessionReady() {
  if (needsSharedLedgerReauth()) {
    throw createStopSharingError(
      '登入狀態已過期，請重新登入後再取消共享或離開共同帳本',
      'shared_ledger_needs_reauth',
    )
  }
  const status = await ensureSharedLedgerSessionReady()
  if (status?.needsReauth) {
    throw createStopSharingError(
      '登入狀態已過期，請重新登入後再取消共享或離開共同帳本',
      'shared_ledger_needs_reauth',
    )
  }
  if (!status?.canUseApi) {
    throw createStopSharingError(
      '目前無法連線共同帳本服務，請確認登入狀態後再試',
      'shared_ledger_session_not_ready',
    )
  }
}

function isSharedLedgerAlreadyGoneError(error) {
  const code = String(error?.code ?? '').trim().toLowerCase()
  const status = Number(error?.status ?? 0)
  const message = String(error?.message ?? '')
  return status === 404
    || code === 'shared_ledger_not_found'
    || code === 'not_found'
    || /找不到共同帳本|not found/i.test(message)
}

async function deleteSharedLedgerAllowingGone(sharedLedgerId) {
  try {
    return await deleteSharedLedger(sharedLedgerId)
  } catch (error) {
    if (isSharedLedgerAlreadyGoneError(error)) {
      return {
        removed: true,
        mode: 'already_gone',
        shared_ledger_id: String(sharedLedgerId),
      }
    }
    throw error
  }
}

export async function stopSharingLocalLedger(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')

  const meta = await getSharedLedgerMeta(normalizedLedgerId)
  if (!meta?.shared_ledger_id) {
    throw new Error('此帳本尚未綁定共同帳本')
  }

  await assertStopSharingSessionReady()
  const result = await deleteSharedLedgerAllowingGone(meta.shared_ledger_id)
  await clearSharedLedgerMeta(normalizedLedgerId)
  return result
}

export async function stopSharingRemoteSharedLedger(sharedLedgerId, options = {}) {
  const normalizedSharedLedgerId = String(sharedLedgerId ?? '').trim()
  if (!normalizedSharedLedgerId) throw new Error('缺少共同帳本 ID')

  await assertStopSharingSessionReady()
  const result = await deleteSharedLedgerAllowingGone(normalizedSharedLedgerId)
  const localLedgerIds = Array.isArray(options?.localLedgerIds) ? options.localLedgerIds : []
  for (const ledgerId of localLedgerIds) {
    await clearSharedLedgerMeta(ledgerId)
  }
  return result
}

export function getSharedLedgerSessionUser() {
  return getSharedLedgerSession()?.user ?? null
}

async function syncSingleDirtyLedger(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId || isAutoSyncMuted(normalizedLedgerId)) {
    return false
  }

  const alreadyLocked = syncingLedgerIds.has(normalizedLedgerId)
  if (alreadyLocked && !options.allowLocked) {
    return false
  }

  const meta = await getSharedLedgerMeta(normalizedLedgerId)
  if (!meta?.shared_ledger_id || meta.auto_sync_enabled === false || !sharedLedgerRoleCanPush(meta.role)) {
    clearLedgerDirty(normalizedLedgerId)
    return false
  }

  if (!alreadyLocked) syncingLedgerIds.add(normalizedLedgerId)
  try {
    await setSharedLedgerMeta(normalizedLedgerId, meta, {
      last_sync_status: 'syncing',
      last_sync_error: '',
    })
    const result = await pushLocalLedgerToShared(normalizedLedgerId, { mergeOnConflict: true })
    const statusPatch = buildSyncStatusPatch(result?.hasConflicts
      ? {
          hasConflicts: true,
          conflictCount: result.conflictCount,
          conflicts: result.conflicts,
          mergeMode: result.mergeMode,
          mergeLog: result.mergeLog,
        }
      : null)
    await setSharedLedgerMeta(normalizedLedgerId, result?.item ?? meta, {
      ...statusPatch,
    })
    return true
  } catch (error) {
    await setSharedLedgerMeta(normalizedLedgerId, meta, {
      last_sync_status: 'error',
      last_sync_error: formatSyncForeignKeyError(error),
    }).catch(() => null)
    throw error
  } finally {
    if (!alreadyLocked) syncingLedgerIds.delete(normalizedLedgerId)
  }
}

async function flushDirtyLedgers(pinia) {
  if (!(await assertSharedLedgerSyncAllowed(pinia))) return
  const ledgerStore = useLedgerStore(pinia)
  const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  const dirtyLedgerIds = listDirtyLedgerIds()
    .sort((left, right) => {
      if (left === activeLedgerId) return -1
      if (right === activeLedgerId) return 1
      return 0
    })

  for (const ledgerId of dirtyLedgerIds) {
    if (!hasDirtyLedger(ledgerId)) continue
    try {
      await syncSingleDirtyLedger(ledgerId)
    } catch (error) {
      if (String(error?.code ?? '') === 'shared_ledger_forbidden') {
        // Role was downgraded to viewer remotely; stop retrying this ledger.
        clearLedgerDirty(ledgerId)
      }
      console.warn('[shared-ledger] dirty sync failed', ledgerId, error)
    }
  }
}

async function syncActiveLedgerLatest(pinia) {
  if (!(await assertSharedLedgerSyncAllowed(pinia))) return

  const ledgerStore = useLedgerStore(pinia)
  const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
  if (!activeLedgerId || hasDirtyLedger(activeLedgerId) || syncingLedgerIds.has(activeLedgerId) || isAutoSyncMuted(activeLedgerId)) {
    return
  }

  const meta = await getSharedLedgerMeta(activeLedgerId)
  if (!meta?.shared_ledger_id || meta.auto_sync_enabled === false) return

  syncingLedgerIds.add(activeLedgerId)
  try {
    await setSharedLedgerMeta(activeLedgerId, meta, {
      last_sync_status: 'syncing',
      last_sync_error: '',
    })
    const detail = await getSharedLedgerDetail(meta.shared_ledger_id)
    // Race: local edits may have landed while the detail request was in flight.
    // Prefer push/merge over hard pull so unpushed changes are never wiped.
    if (hasDirtyLedger(activeLedgerId)) {
      await syncSingleDirtyLedger(activeLedgerId, { allowLocked: true })
      return
    }
    const remoteVersion = Number(detail?.item?.version ?? 0)
    const localVersion = Number(meta.version ?? 0)
    if (remoteVersion <= localVersion) {
      await setSharedLedgerMeta(activeLedgerId, meta, {
        last_sync_status: String(meta.last_sync_status ?? '').trim().toLowerCase() === 'conflict_resolved'
          ? 'conflict_resolved'
          : 'ok',
        last_sync_error: meta.last_sync_error ?? '',
      })
      return
    }
    const pulled = await pullSharedLedgerToLocal(activeLedgerId)
    if (hasDirtyLedger(activeLedgerId) && sharedLedgerRoleCanPush(meta.role)) {
      await syncSingleDirtyLedger(activeLedgerId, { allowLocked: true })
    } else {
      await setSharedLedgerMeta(activeLedgerId, pulled?.meta ?? meta, {
        last_sync_status: pulled?.hasConflicts ? 'conflict_resolved' : 'ok',
        last_sync_error: pulled?.hasConflicts
          ? `已安全合併 ${pulled.conflictCount ?? 0} 處衝突（可於同步狀態查看）`
          : '',
      })
    }
    await ledgerStore.reloadActiveLedger()
  } catch (error) {
    await setSharedLedgerMeta(activeLedgerId, meta, {
      last_sync_status: 'error',
      last_sync_error: formatSyncForeignKeyError(error),
    }).catch(() => null)
    console.warn('[shared-ledger] remote poll failed', activeLedgerId, error)
  } finally {
    syncingLedgerIds.delete(activeLedgerId)
  }
}

export function runSharedLedgerBackgroundSyncNow(pinia) {
  backgroundSyncPromise = Promise.resolve(backgroundSyncPromise)
    .catch(() => null)
    .then(async () => {
      await flushDirtyLedgers(pinia)
      await syncActiveLedgerLatest(pinia)
    })
  return backgroundSyncPromise
}

export function scheduleActiveSharedLedgerAutoSync(pinia, delayMs = AUTO_PUSH_DEBOUNCE_MS) {
  if (typeof window === 'undefined') return
  if (autoSyncTimer != null) {
    window.clearTimeout(autoSyncTimer)
  }
  autoSyncTimer = window.setTimeout(async () => {
    autoSyncTimer = null
    if (!isOnline()) {
      await markActiveLedgerSyncGate(pinia, 'paused_offline', '目前離線，連上網路後將自動重試')
      return
    }
    const auth = await ensureSharedLedgerSessionReady()
    if (!auth.canUseApi || !hasSharedLedgerMembershipAccess()) {
      if (auth.needsReauth) {
        await markActiveLedgerSyncGate(pinia, 'paused_reauth', '需重新登入後才能同步共同帳本')
      } else if (!hasSharedLedgerMembershipAccess() && auth.canUseApi) {
        await markActiveLedgerSyncGate(pinia, 'paused_membership', '需有效會員才能同步共同帳本')
      } else if (auth.restoring || auth.hasProfile || auth.hasRestoreCandidate) {
        await markActiveLedgerSyncGate(pinia, 'paused_session', '登入狀態恢復中，稍後自動重試同步')
      }
      return
    }

    const ledgerStore = useLedgerStore(pinia)
    const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
    if (!activeLedgerId || isAutoSyncMuted(activeLedgerId)) return

    const meta = await getSharedLedgerMeta(activeLedgerId)
    if (!meta?.shared_ledger_id || meta.auto_sync_enabled === false || !sharedLedgerRoleCanPush(meta.role)) return

    markLedgerDirty(activeLedgerId)
    void runSharedLedgerBackgroundSyncNow(pinia)
  }, Math.max(200, Number(delayMs) || 0))
}

export function initSharedLedgerBackgroundSync(pinia) {
  if (typeof window === 'undefined' || backgroundSyncReady) return
  backgroundSyncReady = true

  void runSharedLedgerBackgroundSyncNow(pinia)

  return () => {
    backgroundSyncReady = false
  }
}
