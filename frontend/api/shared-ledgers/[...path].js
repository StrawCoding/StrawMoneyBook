import sharedLedgersHandler from '../../../backend/src/routes/shared-ledgers.js'
import { rejectProductionServerless } from '../_production-guard.js'

export default async function handler(req, res) {
  if (rejectProductionServerless(res)) return
  res.__request = req
  await sharedLedgersHandler(req, res)
}
