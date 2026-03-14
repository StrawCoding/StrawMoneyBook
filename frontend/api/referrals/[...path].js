import referralsHandler from '../../../backend/src/routes/referrals.js'

export default async function handler(req, res) {
  res.__request = req
  await referralsHandler(req, res)
}
