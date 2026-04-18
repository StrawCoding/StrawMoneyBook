import {
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerSummary,
  createId,
  findPendingInvitationForEmail,
  findSharedLedger,
  findUserByEmail,
  isSharedLedgerMember,
  listPendingSharedLedgerInvitationsForUser,
  normalizeText,
  nowIso,
  parseBody,
  readStore,
  sendJson,
  updateStore,
  validateEmail,
} from './shared.js'

export async function handleInviteByEmail(req, res, user, sharedLedgerId) {
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

export async function handlePendingInvitations(req, res, user) {
  const data = await readStore()
  sendJson(res, 200, {
    items: listPendingSharedLedgerInvitationsForUser(data, user),
    user: await buildPublicUserProfile(user),
  })
}

export async function handleAcceptInvitation(req, res, user, invitationId) {
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
