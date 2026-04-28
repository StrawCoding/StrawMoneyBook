import {
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  findSharedLedger,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  listSharedLedgersForUser,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  sendJson,
  updateStore,
  validateSnapshot,
} from './shared.js'

export async function handleList(req, res, user) {
  const data = await readStore()
  sendJson(res, 200, {
    items: listSharedLedgersForUser(data, user.id),
    pending_invitations: listPendingSharedLedgerInvitationsForUser(data, user),
  })
}

export async function handleCreate(req, res, user) {
  const body = parseBody(req)
  const snapshot = body.snapshot
  const snapshotInfo = validateSnapshot(snapshot)
  const explicitName = normalizeText(body.name)
  const nextName = explicitName || snapshotInfo.ledgerName

  const sharedLedger = await updateStore(async (data) => {
    const now = nowIso()
    const record = {
      id: createId('shared_ledger'),
      ledger_id: snapshotInfo.ledgerId,
      name: nextName,
      invite_code: createInviteCode(),
      owner_user_id: user.id,
      members: [
        {
          user_id: user.id,
          role: 'owner',
          joined_at: now,
        },
      ],
      invitations: [],
      snapshot,
      version: 1,
      created_at: now,
      updated_at: now,
      updated_by_user_id: user.id,
    }
    data.shared_ledgers.push(record)
    return record
  })

  const data = await readStore()
  const created = findSharedLedger(data, sharedLedger.id)
  sendJson(res, 201, {
    item: buildSharedLedgerSummary(created, user.id, data),
  })
}

export async function handleJoin(req, res, user) {
  const body = parseBody(req)
  const inviteCode = normalizeText(body.inviteCode).toUpperCase()
  if (!inviteCode) {
    throw new Error('請輸入邀請碼')
  }

  const joinedLedgerId = await updateStore(async (data) => {
    const target = data.shared_ledgers.find((item) => String(item.invite_code ?? '').toUpperCase() === inviteCode)
    if (!target) {
      throw new Error('找不到對應的共同帳本邀請碼')
    }

    if (!isSharedLedgerMember(target, user.id)) {
      target.members.push({
        user_id: user.id,
        role: 'member',
        joined_at: nowIso(),
      })
      target.updated_at = nowIso()
      target.updated_by_user_id = user.id
    }

    return target.id
  })

  const data = await readStore()
  const joined = findSharedLedger(data, joinedLedgerId)
  sendJson(res, 200, {
    item: buildSharedLedgerSummary(joined, user.id, data),
    snapshot: joined.snapshot,
  })
}

export async function handleDetail(req, res, user, sharedLedgerId) {
  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
    sendJson(res, 404, {
      error: 'shared_ledger_not_found',
      message: '找不到共同帳本',
    })
    return
  }

  sendJson(res, 200, {
    item: buildSharedLedgerSummary(sharedLedger, user.id, data),
  })
}

export async function handleSnapshotFetch(req, res, user, sharedLedgerId) {
  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
    sendJson(res, 404, {
      error: 'shared_ledger_not_found',
      message: '找不到共同帳本',
    })
    return
  }

  sendJson(res, 200, {
    item: buildSharedLedgerSummary(sharedLedger, user.id, data),
    snapshot: sharedLedger.snapshot,
  })
}

export async function handleSnapshotPush(req, res, user, sharedLedgerId) {
  const body = parseBody(req)
  const snapshot = body.snapshot
  const force = Boolean(body.force)
  const baseVersion = Number(body.baseVersion ?? 0)
  const snapshotInfo = validateSnapshot(snapshot)

  const savedId = await updateStore(async (data) => {
    const sharedLedger = findSharedLedger(data, sharedLedgerId)
    if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
      throw new Error('找不到共同帳本')
    }

    if (snapshotInfo.ledgerId !== String(sharedLedger.ledger_id ?? '')) {
      throw new Error('帳本 ID 不一致，無法覆蓋共同帳本')
    }

    const currentVersion = Number(sharedLedger.version ?? 0)
    if (!force && currentVersion !== baseVersion) {
      const conflictError = new Error('共同帳本已被其他成員更新，請先下載最新版本')
      conflictError.code = 'version_conflict'
      conflictError.status = 409
      conflictError.currentVersion = currentVersion
      throw conflictError
    }

    sharedLedger.snapshot = snapshot
    sharedLedger.name = normalizeText(body.name) || snapshotInfo.ledgerName || sharedLedger.name
    sharedLedger.version = currentVersion + 1
    sharedLedger.updated_at = nowIso()
    sharedLedger.updated_by_user_id = user.id
    return sharedLedger.id
  })

  const data = await readStore()
  const saved = findSharedLedger(data, savedId)
  sendJson(res, 200, {
    item: buildSharedLedgerSummary(saved, user.id, data),
  })
}

export async function handleDelete(req, res, user, sharedLedgerId) {
  const result = await updateStore(async (data) => {
    const sharedLedger = findSharedLedger(data, sharedLedgerId)
    if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
      throw new Error('找不到共同帳本')
    }

    const isOwner = String(sharedLedger.owner_user_id ?? '') === String(user.id)
    if (isOwner) {
      data.shared_ledgers = (data.shared_ledgers ?? []).filter((item) => String(item.id) !== String(sharedLedgerId))
      return {
        mode: 'owner_deleted',
        sharedLedgerId: String(sharedLedgerId),
      }
    }

    sharedLedger.members = (sharedLedger.members ?? []).filter((member) => String(member?.user_id ?? '') !== String(user.id))
    sharedLedger.updated_at = nowIso()
    sharedLedger.updated_by_user_id = user.id
    return {
      mode: 'member_left',
      sharedLedgerId: String(sharedLedgerId),
    }
  })

  sendJson(res, 200, {
    removed: true,
    mode: result.mode,
    shared_ledger_id: result.sharedLedgerId,
  })
}
