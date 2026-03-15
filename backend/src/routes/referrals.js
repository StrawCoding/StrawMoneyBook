import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { methodGuard, normalizePath, parseBody, sendJson } from '../collab/http.js'
import {
  applyMembershipGrant,
  buildPublicUserProfile,
  findUserById,
  findUserByReferralCode,
  nowIso,
  readStore,
  updateStore,
} from '../collab/store.js'

const INVITER_REWARD_DAYS = 7
const INVITEE_REWARD_DAYS = 3

function buildReferralSummary(data, user) {
  const referredByUser = findUserById(data, user?.referred_by_user_id)
  const referrals = Array.isArray(data?.referrals)
    ? data.referrals.filter((item) => String(item?.inviter_user_id ?? '') === String(user?.id ?? ''))
    : []

  return {
    code: String(user?.referral_code ?? ''),
    invited_count: referrals.length,
    referred_by_user_id: String(user?.referred_by_user_id ?? ''),
    referred_by_display_name: referredByUser?.display_name || referredByUser?.email || referredByUser?.account || '',
    referral_redeemed_at: String(user?.referral_redeemed_at ?? ''),
    inviter_reward_days: INVITER_REWARD_DAYS,
    invitee_reward_days: INVITEE_REWARD_DAYS,
  }
}

async function handleGetSummary(req, res, user) {
  const data = await readStore()
  const currentUser = data.users.find((item) => String(item.id) === String(user.id))
  sendJson(res, 200, {
    user: await buildPublicUserProfile(currentUser),
    summary: buildReferralSummary(data, currentUser),
  })
}

async function handleRedeem(req, res, user) {
  const body = parseBody(req)
  const code = String(body.code ?? '').trim().toUpperCase()
  if (!code) {
    throw new Error('請輸入邀請碼')
  }

  const updatedUserId = await updateStore(async (data) => {
    const invitee = data.users.find((item) => String(item.id) === String(user.id))
    if (!invitee) {
      throw new Error('找不到使用者')
    }

    if (String(invitee.referred_by_user_id ?? '').trim()) {
      throw new Error('你已經使用過邀請碼')
    }

    const inviter = findUserByReferralCode(data, code)
    if (!inviter) {
      throw new Error('找不到邀請碼')
    }
    if (String(inviter.id) === String(invitee.id)) {
      throw new Error('不能使用自己的邀請碼')
    }

    const duplicated = (data.referrals ?? []).some(
      (item) =>
        String(item?.inviter_user_id ?? '') === String(inviter.id)
        && String(item?.invitee_user_id ?? '') === String(invitee.id),
    )
    if (duplicated) {
      throw new Error('你已經使用過這位好友的邀請碼')
    }

    const now = nowIso()
    data.referrals = [
      ...(data.referrals ?? []),
      {
        id: `referral_${Date.now().toString(36)}`,
        code,
        inviter_user_id: inviter.id,
        invitee_user_id: invitee.id,
        inviter_reward_days: INVITER_REWARD_DAYS,
        invitee_reward_days: INVITEE_REWARD_DAYS,
        created_at: now,
      },
    ]

    invitee.referred_by_user_id = inviter.id
    invitee.referred_by_code = code
    invitee.referral_redeemed_at = now
    invitee.updated_at = now
    inviter.updated_at = now

    applyMembershipGrant(inviter, INVITER_REWARD_DAYS, 'referral_inviter_bonus', {
      invitee_user_id: invitee.id,
    })
    applyMembershipGrant(invitee, INVITEE_REWARD_DAYS, 'referral_invitee_bonus', {
      inviter_user_id: inviter.id,
    })

    return invitee.id
  })

  const data = await readStore()
  const updatedUser = data.users.find((item) => String(item.id) === String(updatedUserId))
  sendJson(res, 200, {
    user: await buildPublicUserProfile(updatedUser),
    summary: buildReferralSummary(data, updatedUser),
  })
}

export default async function referralsHandler(req, res) {
  if (methodGuard(req, res, ['GET', 'POST'])) return

  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return

  const pathname = normalizePath(req, '/api/referrals')

  try {
    if (req.method === 'GET' && pathname === '/me') {
      await handleGetSummary(req, res, user)
      return
    }

    if (req.method === 'POST' && pathname === '/redeem') {
      await handleRedeem(req, res, user)
      return
    }

    sendJson(res, 404, { error: 'not_found' })
  } catch (error) {
    sendJson(res, 400, {
      error: 'referral_request_failed',
      message: String(error?.message ?? error ?? 'referral request failed'),
    })
  }
}
