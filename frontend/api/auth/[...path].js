import authHandler from '../../../backend/src/routes/auth.js'
import { rejectProductionServerless } from '../_production-guard.js'

export default async function handler(req, res) {
  if (rejectProductionServerless(res)) return
  res.__request = req
  await authHandler(req, res)
}
