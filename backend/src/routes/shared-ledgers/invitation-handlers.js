import { isMailTransportConfigured, sendSharedLedgerInvitationEmail } from '../../collab/mailer.js'
import {
  buildPublicUserProfile,
  buildSharedLedgerInvitationSummary,
  buildSharedLedgerSummary,
  canInviteMembers,
  createForbiddenError,
  createId,
  findPendingInvitationForEmail,
  findSharedLedger,
  findUserByEmail,
  getMemberRole,
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

const SHARED_LEDGER_INVITE_BASE = String(process.env.SHARED_LEDGER_INVITE_BASE_URL ?? 'https://www.strawmb.com/open/shared-ledger').trim()

function enforceHttpsInviteBase(rawBase) {
  const fallback = 'https://www.strawmb.com/open/shared-ledger'
  const normalized = String(rawBase ?? '').trim() || fallback
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    return fallback
  }
  const host = String(parsed.hostname ?? '').trim().toLowerCase()
  const isLocalHost = host === 'localhost' || host === '127.0.0.1'
  if (parsed.protocol === 'http:' && !isLocalHost) {
    parsed.protocol = 'https:'
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost)) {
    return fallback
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '') || fallback
}

function buildInviteUrl(inviteCode) {
  const normalizedCode = String(inviteCode ?? '').trim().toUpperCase()
  if (!normalizedCode) return ''
  const base = enforceHttpsInviteBase(SHARED_LEDGER_INVITE_BASE).replace(/\/$/, '')
  const url = `${base}?inviteCode=${encodeURIComponent(normalizedCode)}`
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url)) {
    return `https://www.strawmb.com/open/shared-ledger?inviteCode=${encodeURIComponent(normalizedCode)}`
  }
  return url
}

function normalizeEmailDeliveryError(error) {
  return String(error?.message ?? error ?? '邀請 Email 寄送失敗').trim().slice(0, 240)
}

function buildEmailDeliveryPayload(delivery = {}) {
  return {
    status: String(delivery.status ?? 'pending'),
    sent_at: String(delivery.sent_at ?? ''),
    error: String(delivery.error ?? ''),
    attempted_at: String(delivery.attempted_at ?? ''),
  }
}

function applyEmailDeliveryToInvitation(invitation, delivery) {
  invitation.email_delivery_status = delivery.status
  invitation.email_sent_at = delivery.sent_at
  invitation.email_last_error = delivery.error
  invitation.email_last_attempt_at = delivery.attempted_at
}

async function deliverSharedLedgerInvitationEmail(sharedLedger, invitation, user) {
  const attemptedAt = nowIso()
  const email = String(invitation?.email ?? '').trim().toLowerCase()
  const logContext = {
    sharedLedgerId: String(sharedLedger?.id ?? ''),
    invitationId: String(invitation?.id ?? ''),
    email,
  }

  if (!isMailTransportConfigured()) {
    const delivery = {
      status: 'not_configured',
      sent_at: '',
      error: '目前尚未設定寄信服務',
      attempted_at: attemptedAt,
    }
    console.warn('[shared-ledger] invitation email skipped (mail transport not configured)', logContext)
    return delivery
  }

  try {
    const inviterDisplayName = String(user?.display_name ?? user?.email ?? user?.account ?? '').trim()
    const inviteUrl = buildInviteUrl(sharedLedger?.invite_code)
    await sendSharedLedgerInvitationEmail({
      email,
      inviterDisplayName,
      ledgerName: sharedLedger?.name ?? '',
      inviteUrl,
    })
    const delivery = {
      status: 'sent',
      sent_at: attemptedAt,
      error: '',
      attempted_at: attemptedAt,
    }
    console.info('[shared-ledger] invitation email sent', logContext)
    return delivery
  } catch (error) {
    const delivery = {
      status: 'failed',
      sent_at: '',
      error: normalizeEmailDeliveryError(error),
      attempted_at: attemptedAt,
    }
    console.error('[shared-ledger] invitation email failed', {
      ...logContext,
      error: delivery.error,
    })
    return delivery
  }
}

async function persistInvitationEmailDelivery(sharedLedgerId, invitationId, delivery) {
  await updateStore(async (data) => {
    const sharedLedger = findSharedLedger(data, sharedLedgerId)
    if (!sharedLedger) return
    const invitation = (sharedLedger.invitations ?? []).find((item) => String(item.id) === String(invitationId))
    if (!invitation) return
    applyEmailDeliveryToInvitation(invitation, delivery)
    sharedLedger.updated_at = nowIso()
  })
}

function findPendingInvitation(sharedLedger, invitationId) {
  return (sharedLedger?.invitations ?? []).find((item) => (
    String(item.id) === String(invitationId)
    && String(item?.status ?? 'pending') === 'pending'
  )) ?? null
}

export async function handleInviteByEmail(req, res, user, sharedLedgerId) {
  const body = parseBody(req)
  const email = validateEmail(body.email)
  const currentUserEmail = String(user?.email ?? user?.account ?? '').trim().toLowerCase()

  const invitationId = await updateStore(async (data) => {
    const sharedLedger = findSharedLedger(data, sharedLedgerId)
    if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
      throw new Error('找不到共同帳本')
    }

    if (!canInviteMembers(getMemberRole(sharedLedger, user.id))) {
      throw createForbiddenError('沒有權限邀請新成員')
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
      email_delivery_status: 'pending',
      email_sent_at: '',
      email_last_error: '',
      email_last_attempt_at: '',
    }
    sharedLedger.invitations = [...(sharedLedger.invitations ?? []), invitation]
    sharedLedger.updated_at = nowIso()
    sharedLedger.updated_by_user_id = user.id
    return invitation.id
  })

  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  const invitation = (sharedLedger?.invitations ?? []).find((item) => String(item.id) === String(invitationId))
  const delivery = await deliverSharedLedgerInvitationEmail(sharedLedger, invitation, user)
  await persistInvitationEmailDelivery(sharedLedgerId, invitationId, delivery)

  const refreshedData = await readStore()
  const refreshedLedger = findSharedLedger(refreshedData, sharedLedgerId)
  const refreshedInvitation = (refreshedLedger?.invitations ?? []).find((item) => String(item.id) === String(invitationId))

  sendJson(res, 201, {
    invitation: buildSharedLedgerInvitationSummary(refreshedLedger, refreshedInvitation, refreshedData),
    email_delivery: buildEmailDeliveryPayload(delivery),
  })
}

export async function handleListOutgoingInvitations(req, res, user, sharedLedgerId) {
  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
    sendJson(res, 404, {
      error: 'shared_ledger_not_found',
      message: '找不到共同帳本',
    })
    return
  }

  const items = (Array.isArray(sharedLedger.invitations) ? sharedLedger.invitations : [])
    .filter((invitation) => String(invitation?.status ?? 'pending') === 'pending')
    .map((invitation) => buildSharedLedgerInvitationSummary(sharedLedger, invitation, data))

  sendJson(res, 200, { items })
}

export async function handleResendInvitation(req, res, user, sharedLedgerId, invitationId) {
  const data = await readStore()
  const sharedLedger = findSharedLedger(data, sharedLedgerId)
  if (!sharedLedger || !isSharedLedgerMember(sharedLedger, user.id)) {
    throw new Error('找不到共同帳本')
  }

  if (!canInviteMembers(getMemberRole(sharedLedger, user.id))) {
    throw createForbiddenError('沒有權限重新寄送邀請')
  }

  const invitation = findPendingInvitation(sharedLedger, invitationId)
  if (!invitation) {
    throw new Error('找不到待重新寄送的邀請')
  }

  const delivery = await deliverSharedLedgerInvitationEmail(sharedLedger, invitation, user)
  await persistInvitationEmailDelivery(sharedLedgerId, invitationId, delivery)

  const refreshedData = await readStore()
  const refreshedLedger = findSharedLedger(refreshedData, sharedLedgerId)
  const refreshedInvitation = findPendingInvitation(refreshedLedger, invitationId)

  sendJson(res, 200, {
    invitation: buildSharedLedgerInvitationSummary(refreshedLedger, refreshedInvitation, refreshedData),
    email_delivery: buildEmailDeliveryPayload(delivery),
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
