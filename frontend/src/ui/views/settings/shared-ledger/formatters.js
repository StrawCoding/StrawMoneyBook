/**
 * ART-17 — Shared-ledger settings page label helpers (pure; take i18n `t`).
 */

export function formatSharedLedgerDateTime(value) {
  const source = String(value ?? '').trim()
  if (!source) return '-'
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return source
  return parsed.toLocaleString()
}

export function getSharedLedgerRoleLabel(t, role) {
  const normalized = String(role ?? '').trim().toLowerCase()
  if (normalized === 'owner') return t('shared_ledger.role.owner', '擁有者')
  if (normalized === 'admin') return t('shared_ledger.role.admin', '管理員')
  if (normalized === 'viewer') return t('shared_ledger.role.reader', '唯讀成員')
  return t('shared_ledger.role.member', '一般成員')
}

export function getSharedLedgerAssignableRoles(member, { canTransferOwnership, assignableRoles }) {
  if (canTransferOwnership) return assignableRoles
  const current = String(member?.role ?? '').trim().toLowerCase()
  if (current === 'admin') return ['admin']
  return ['member', 'viewer']
}
