import referralsHandler from '../../../backend/src/routes/referrals.js'
import { rejectProductionServerless } from '../_production-guard.js'

export default async function handler(req, res) {
  if (rejectProductionServerless(res)) return
  res.__request = req
  await referralsHandler(req, res)
}
