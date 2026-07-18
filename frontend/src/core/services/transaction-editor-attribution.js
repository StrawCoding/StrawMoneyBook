/**
 * Resolve the current signed-in user as a transaction editor snapshot.
 * Lazy-imports shared-ledger session so core stays usable without auth.
 */
export async function resolveCurrentTransactionEditor() {
  try {
    const { getSharedLedgerSession } = await import('@/services/shared-ledger/backend')
    const user = getSharedLedgerSession()?.user
    const userId = String(user?.id ?? '').trim()
    if (!userId) return null
    const displayName = String(
      user?.display_name
      || user?.email
      || user?.account
      || '',
    ).trim()
    return {
      userId,
      displayName: displayName || userId,
    }
  } catch {
    return null
  }
}

export function applyCreateEditorAttribution(input = {}, editor = null) {
  const next = { ...input }
  if (!editor?.userId) return next
  next.createdByUserId = String(editor.userId)
  next.createdByDisplayName = String(editor.displayName ?? '').trim() || String(editor.userId)
  next.updatedByUserId = next.createdByUserId
  next.updatedByDisplayName = next.createdByDisplayName
  return next
}

export function applyUpdateEditorAttribution(input = {}, editor = null) {
  const next = { ...input }
  if (!editor?.userId) return next
  next.updatedByUserId = String(editor.userId)
  next.updatedByDisplayName = String(editor.displayName ?? '').trim() || String(editor.userId)
  return next
}

export function buildTransactionEditorAttributionView(tx = {}, { currentUserId = '', isSharedLedger = false } = {}) {
  const createdByUserId = String(tx?.created_by_user_id ?? '').trim()
  const updatedByUserId = String(tx?.updated_by_user_id ?? '').trim()
  const createdByName = String(tx?.created_by_display_name ?? '').trim()
  const updatedByName = String(tx?.updated_by_display_name ?? '').trim()
  const createdAt = String(tx?.created_at ?? '').trim()
  const updatedAt = String(tx?.updated_at ?? '').trim()

  if (!createdByUserId && !updatedByUserId && !createdByName && !updatedByName) {
    return null
  }

  const normalizedCurrentUserId = String(currentUserId ?? '').trim()
  const onlySelf = Boolean(
    normalizedCurrentUserId
    && (!createdByUserId || createdByUserId === normalizedCurrentUserId)
    && (!updatedByUserId || updatedByUserId === normalizedCurrentUserId),
  )
  if (!isSharedLedger && onlySelf) {
    return null
  }

  const creatorLabel = createdByName || createdByUserId
  const editorLabel = updatedByName || updatedByUserId || creatorLabel
  const samePerson = Boolean(
    (createdByUserId && updatedByUserId && createdByUserId === updatedByUserId)
    || (creatorLabel && editorLabel && creatorLabel === editorLabel),
  )

  return {
    createdByUserId,
    updatedByUserId,
    createdByName: creatorLabel,
    updatedByName: editorLabel,
    createdAt,
    updatedAt,
    samePerson,
    creatorInitial: String(creatorLabel || '?').slice(0, 1),
    editorInitial: String(editorLabel || '?').slice(0, 1),
  }
}
