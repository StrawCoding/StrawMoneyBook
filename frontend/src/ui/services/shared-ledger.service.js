import { getLedger, purgeLedger } from '@/core/repositories/ledger.repo'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { exportLedgerJson } from '@/core/services/export.service'
import { importLedgerJsonAsNewLedger } from '@/core/services/import.service'
import { nowIso } from '@/core/utils/id'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  createSharedLedger,
  getSharedLedgerSession,
  getSharedLedgerSnapshot,
  isSharedLedgerAuthenticated,
  joinSharedLedger,
  listSharedLedgers,
  pushSharedLedgerSnapshot,
} from '@/services/shared-ledger/backend'

const SHARED_LEDGER_META_KEY = 'shared_ledger_meta'
const AUTO_SYNC_DELAY_MS = 5000
const IMPORT_SYNC_MUTE_MS = 15000

let autoSyncTimer = null
let autoSyncRunning = false
const mutedLedgerSyncUntil = new Map()

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function sanitizeSnapshotForSharedSync(snapshot) {
  const normalized = cloneJson(snapshot)
  if (!normalized || typeof normalized !== 'object') {
    throw new Error('帳本快照格式錯誤')
  }
  const appSettings = Array.isArray(normalized?.tables?.app_settings) ? normalized.tables.app_settings : []
  normalized.tables.app_settings = appSettings.filter((row) => String(row?.key ?? '') !== SHARED_LEDGER_META_KEY)
  normalized.exported_at = new Date().toISOString()
  return normalized
}

function buildSharedMeta(item, existingMeta = {}, patch = {}) {
  return {
    shared_ledger_id: String(item?.id ?? existingMeta?.shared_ledger_id ?? ''),
    ledger_id: String(item?.ledger_id ?? existingMeta?.ledger_id ?? ''),
    remote_name: String(item?.name ?? existingMeta?.remote_name ?? ''),
    invite_code: String(item?.invite_code ?? existingMeta?.invite_code ?? ''),
    role: String(item?.role ?? existingMeta?.role ?? ''),
    version: Number(item?.version ?? existingMeta?.version ?? 0),
    auto_sync_enabled: patch.auto_sync_enabled ?? existingMeta?.auto_sync_enabled ?? true,
    updated_at: String(item?.updated_at ?? patch.updated_at ?? existingMeta?.updated_at ?? ''),
    last_synced_at: patch.last_synced_at ?? existingMeta?.last_synced_at ?? null,
    last_pulled_at: patch.last_pulled_at ?? existingMeta?.last_pulled_at ?? null,
    last_pushed_at: patch.last_pushed_at ?? existingMeta?.last_pushed_at ?? null,
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

async function replaceLocalLedgerWithSnapshot(snapshot, item, existingMeta = null) {
  const normalizedSnapshot = sanitizeSnapshotForSharedSync(snapshot)
  const ledgerId = String(normalizedSnapshot?.ledger_id ?? '').trim()
  if (!ledgerId) {
    throw new Error('共同帳本快照缺少 ledger_id')
  }

  muteAutoSync(ledgerId)
  const existingLedger = await getLedger(ledgerId)
  if (existingLedger) {
    await purgeLedger(ledgerId)
  }

  const imported = await importLedgerJsonAsNewLedger(JSON.stringify(normalizedSnapshot), {
    keepLedgerId: true,
    ledgerName: String(item?.name ?? ''),
    runIntegrityRepair: true,
  })

  const now = nowIso()
  const nextMeta = await setSharedLedgerMeta(imported.ledgerId, item, {
    auto_sync_enabled: existingMeta?.auto_sync_enabled ?? true,
    last_synced_at: now,
    last_pulled_at: now,
    last_pushed_at: existingMeta?.last_pushed_at ?? null,
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

  const ledger = await getLedger(normalizedLedgerId)
  const snapshot = sanitizeSnapshotForSharedSync(await exportLedgerJson(normalizedLedgerId))
  const result = await pushSharedLedgerSnapshot(meta.shared_ledger_id, {
    baseVersion: Number(meta.version ?? 0),
    force: Boolean(options.force),
    name: String(ledger?.name ?? ''),
    snapshot,
  })

  const now = nowIso()
  const nextMeta = await setSharedLedgerMeta(normalizedLedgerId, result.item, {
    auto_sync_enabled: meta.auto_sync_enabled ?? true,
    last_synced_at: now,
    last_pushed_at: now,
    last_pulled_at: meta.last_pulled_at ?? null,
  })

  return {
    item: result.item,
    meta: nextMeta,
  }
}

export async function pullSharedLedgerToLocal(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) throw new Error('缺少帳本 ID')

  const meta = await getSharedLedgerMeta(normalizedLedgerId)
  if (!meta?.shared_ledger_id) {
    throw new Error('此帳本尚未綁定共同帳本')
  }

  const result = await getSharedLedgerSnapshot(meta.shared_ledger_id)
  return replaceLocalLedgerWithSnapshot(result.snapshot, result.item, meta)
}

export async function importRemoteSharedLedgerToLocal(sharedLedgerId) {
  const result = await getSharedLedgerSnapshot(sharedLedgerId)
  const existingMeta = await getSharedLedgerMeta(String(result?.item?.ledger_id ?? ''))
  return replaceLocalLedgerWithSnapshot(result.snapshot, result.item, existingMeta)
}

export async function joinSharedLedgerByInviteCode(inviteCode) {
  const result = await joinSharedLedger(inviteCode)
  const existingMeta = await getSharedLedgerMeta(String(result?.item?.ledger_id ?? ''))
  const imported = await replaceLocalLedgerWithSnapshot(result.snapshot, result.item, existingMeta)
  return {
    ...result,
    ...imported,
  }
}

export async function listRemoteSharedLedgers() {
  return listSharedLedgers()
}

export function getSharedLedgerSessionUser() {
  return getSharedLedgerSession()?.user ?? null
}

export function scheduleActiveSharedLedgerAutoSync(pinia, delayMs = AUTO_SYNC_DELAY_MS) {
  if (typeof window === 'undefined') return
  if (autoSyncTimer != null) {
    window.clearTimeout(autoSyncTimer)
  }
  autoSyncTimer = window.setTimeout(async () => {
    autoSyncTimer = null
    if (autoSyncRunning || !isSharedLedgerAuthenticated()) return

    const ledgerStore = useLedgerStore(pinia)
    const activeLedgerId = String(ledgerStore.activeLedgerId ?? '').trim()
    if (!activeLedgerId || isAutoSyncMuted(activeLedgerId)) return

    const meta = await getSharedLedgerMeta(activeLedgerId)
    if (!meta?.shared_ledger_id || meta.auto_sync_enabled === false) return

    autoSyncRunning = true
    try {
      await pushLocalLedgerToShared(activeLedgerId)
    } catch (error) {
      console.warn('[shared-ledger] auto sync failed', error)
    } finally {
      autoSyncRunning = false
    }
  }, Math.max(800, Number(delayMs) || 0))
}
