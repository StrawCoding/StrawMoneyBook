import {
  applyMembershipGrant,
  buildPublicUserProfile,
  nowIso,
  readStore,
  sendJson,
  updateStore,
  SHARED_LEDGER_FIRST_TRIAL_DAYS,
  SHARED_LEDGER_FIRST_TRIAL_SOURCE,
  isSharedLedgerTrialEligible,
} from './shared.js'

export async function handleActivateFirstTrial(req, res, user) {
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
