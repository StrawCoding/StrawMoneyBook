import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { methodGuard, normalizePath, normalizeText, parseBody, sendJson } from '../collab/http.js'
import {
  applyMembershipGrant,
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerSummary,
  createId,
  createInviteCode,
  findPendingInvitationForEmail,
  findUserByEmail,
  getMembershipGrantSummary,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  nowIso,
  readStore,
  updateStore,
  validateEmail,
  validateSnapshot,
} from '../collab/store.js'

const SHARED_LEDGER_FIRST_TRIAL_DAYS = 3
const SHARED_LEDGER_FIRST_TRIAL_SOURCE = 'shared_ledger_first_trial'

function findSharedLedger(data, sharedLedgerId) {
  return data.shared_ledgers.find((item) => String(item.id) === String(sharedLedgerId)) ?? null
}

function listSharedLedgersForUser(data, userId) {
  return data.shared_ledgers
    .filter((item) => isSharedLedgerMember(item, userId))
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .map((item) => buildSharedLedgerSummary(item, userId, data))
}

function isSharedLedgerTrialEligible(user) {
  const grants = Array.isArray(user?.membership_grants) ? user.membership_grants : []
  return grants.length === 0
}

async function ensureSharedLedgerMembership(res, user) {
  if (getMembershipGrantSummary(user).active) {
    return true
  }

  sendJson(res, 403, {
    error: 'membership_required',
    message: '共同帳本僅限會員使用',
    user: await buildPublicUserProfile(user),
    membership_trial_eligible: isSharedLedgerTrialEligible(user),
  })
  return false
}

async function handleActivateFirstTrial(req, res, user) {
  const result = await updateStore(async (data) => {
    const currentUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!currentUser) {
      throw new Error('找不到使用者')
    }

    if (!isSharedLedgerTrialEligible(currentUser)) {
      throw new Error('此帳號已使用過會員資格，無法再啟用首次 3 天免費')
    }

    const grant = applyMembershipGrant(currentUser, SHARED_LEDGER_FIRST_TRIAL_DAYS, SHARED_LEDGER_FIRST_TRIAL_SOURCE, {
      feature: 'shared_ledgers',
    })

    return {
      userId: currentUser.id,
      expiresAt: String(grant?.end_at ?? ''),
    }
  })

  const data = await readStore()
  const currentUser = data.users.find((item) => String(item.id) === String(result?.userId ?? ''))
  sendJson(res, 200, {
    user: await buildPublicUserProfile(currentUser),
    trial_days: SHARED_LEDGER_FIRST_TRIAL_DAYS,
    expires_at: String(result?.expiresAt ?? ''),
  })
}

async function handleList(req, res, user) {
  const data = await readStore()
  sendJson(res, 200, {
    items: listSharedLedgersForUser(data, user.id),
    pending_invitations: listPendingSharedLedgerInvitationsForUser(data, user),
  })
}

async function handleCreate(req, res, user) {
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

async function handleJoin(req, res, user) {
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

async function handleInviteByEmail(req, res, user, sharedLedgerId) {
  const body = parseBody(req)
  const email = validateEmail(body.email)
  const currentUserEmail = String(user?.email ?? user?.account ?? '').trim().toLowerCase()

  const invitationId = await updateStore(async (data) => {
    const sharedLedger = findSharedLedger(data, sharedLedgerId)
    if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
      throw new Error('找不到共同帳本')
    }

    if (email === currentUserEmail) {
      throw new Error('不可邀請自己')
    }

    const invitedUser = findUserByEmail(data, email)
    if (invitedUser && isSharedLedgerMember(sharedLedger, invitedUser.id)) {
      throw new Error('對方已經在共同帳本中')
    }

    const pendingInvitation = findPendingInvitationForEmail(sharedLedger, email)
    if (pendingInvitation) {
      throw new Error('此 Email 已經在待邀請清單中')
    }

    const invitation = {
      id: createId('shared_invitation'),
      email,
      invited_by_user_id: user.id,
      status: 'pending',
      created_at: nowIso(),
      accepted_at: '',
    }
    sharedLedger.invitations = [...(sharedLedger.invitations ?? []), invitation]
    sharedLedger.updated_at = nowIso()
    sharedLedger.updated_by_user_id = user.id
    return invitation.id
  })

  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  const invitation = (sharedLedger?.invitations ?? []).find((item) => String(item.id) === String(invitationId))
  sendJson(res, 201, {
    invitation: buildSharedLedgerInvitationSummary(sharedLedger, invitation, data),
  })
}

async function handlePendingInvitations(req, res, user) {
  const data = await readStore()
  sendJson(res, 200, {
    items: listPendingSharedLedgerInvitationsForUser(data, user),
    user: await buildPublicUserProfile(user),
  })
}

async function handleAcceptInvitation(req, res, user, invitationId) {
  const acceptedLedgerId = await updateStore(async (data) => {
    const currentUser = data.users.find((item) => String(item.id) === String(user.id))
    if (!currentUser) {
      throw new Error('找不到使用者')
    }

    for (const sharedLedger of data.shared_ledgers) {
      const invitation = (sharedLedger.invitations ?? []).find((item) => String(item.id) === String(invitationId))
      if (!invitation) continue
      if (normalizeText(invitation.status || 'pending') !== 'pending') {
        throw new Error('此邀請已失效')
      }
      if (String(invitation.email ?? '').trim().toLowerCase() !== String(currentUser.email ?? '').trim().toLowerCase()) {
        throw new Error('這不是你的邀請')
      }
      if (String(invitation.invited_by_user_id ?? '').trim() === String(currentUser.id)) {
        throw new Error('不可接受自己的邀請')
      }

      if (!isSharedLedgerMember(sharedLedger, currentUser.id)) {
        sharedLedger.members = [
          ...(sharedLedger.members ?? []),
          {
            user_id: currentUser.id,
            role: 'member',
            joined_at: nowIso(),
          },
        ]
      }

      invitation.status = 'accepted'
      invitation.accepted_at = nowIso()
      sharedLedger.updated_at = nowIso()
      sharedLedger.updated_by_user_id = currentUser.id
      return sharedLedger.id
    }

    throw new Error('找不到共同帳本邀請')
  })

  const data = await readStore()
  const sharedLedger = findSharedLedger(data, acceptedLedgerId)
  sendJson(res, 200, {
    item: buildSharedLedgerSummary(sharedLedger, user.id, data),
    snapshot: sharedLedger.snapshot,
  })
}

async function handleDetail(req, res, user, sharedLedgerId) {
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

async function handleSnapshotFetch(req, res, user, sharedLedgerId) {
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

async function handleSnapshotPush(req, res, user, sharedLedgerId) {
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
    if (!force && currentVersion > 0 && currentVersion !== baseVersion) {
      const conflictError = new Error('共同帳本已被其他成員更新，請先下載最新版本')
      conflictError.code = 'version_conflict'
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

async function handleDelete(req, res, user, sharedLedgerId) {
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

export default async function sharedLedgersHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return

  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const pathname = normalizePath(req, '/api/shared-ledgers')
  const segments = pathname.split('/').filter(Boolean)

  try {
    if (req.method === 'POST' && segments.length === 2 && segments[0] === 'trial' && segments[1] === 'activate') {
      await handleActivateFirstTrial(req, res, user)
      return
    }

    if (!await ensureSharedLedgerMembership(res, user)) {
      return
    }

    if (req.method === 'GET' && segments.length === 2 && segments[0] === 'invitations' && segments[1] === 'pending') {
      await handlePendingInvitations(req, res, user)
      return
    }

    if (req.method === 'POST' && segments.length === 2 && segments[0] === 'invitations' && segments[1]) {
      await handleAcceptInvitation(req, res, user, segments[1])
      return
    }

    if (req.method === 'GET' && segments.length === 0) {
      await handleList(req, res, user)
      return
    }

    if (req.method === 'POST' && segments.length === 0) {
      await handleCreate(req, res, user)
      return
    }

    if (req.method === 'POST' && segments.length === 1 && segments[0] === 'join') {
      await handleJoin(req, res, user)
      return
    }

    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'invitations') {
      await handleInviteByEmail(req, res, user, segments[0])
      return
    }

    if (segments.length === 1 && req.method === 'GET') {
      await handleDetail(req, res, user, segments[0])
      return
    }

    if (segments.length === 2 && segments[1] === 'snapshot' && req.method === 'GET') {
      await handleSnapshotFetch(req, res, user, segments[0])
      return
    }

    if (segments.length === 2 && segments[1] === 'snapshot' && req.method === 'POST') {
      await handleSnapshotPush(req, res, user, segments[0])
      return
    }

    if (segments.length === 1 && req.method === 'DELETE') {
      await handleDelete(req, res, user, segments[0])
      return
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    if (String(error?.code ?? '') === 'version_conflict') {
      sendJson(res, 409, {
        error: 'version_conflict',
        message: String(error?.message ?? '共同帳本版本衝突'),
        current_version: Number(error?.currentVersion ?? 0),
      })
      return
    }

    sendJson(res, 400, {
      error: 'shared_ledger_request_failed',
      message: String(error?.message ?? error ?? 'shared ledger request failed'),
    })
  }
}
