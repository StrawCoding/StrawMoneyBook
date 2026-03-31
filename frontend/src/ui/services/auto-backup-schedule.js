export function resolveAutoBackupIntervalHours(intervalHours) {
  return Math.max(1, Number(intervalHours ?? 24) || 24)
}

export function isAutoBackupDue(state, nowMs = Date.now()) {
  if (!state?.connected || !state?.autoEnabled) return false

  const lastBackupAt = String(state?.lastBackupAt ?? '').trim()
  if (!lastBackupAt) return true

  const lastBackupMs = Date.parse(lastBackupAt)
  if (!Number.isFinite(lastBackupMs)) return true

  const intervalMs = resolveAutoBackupIntervalHours(state?.intervalHours) * 60 * 60 * 1000
  return nowMs - lastBackupMs >= intervalMs
}
