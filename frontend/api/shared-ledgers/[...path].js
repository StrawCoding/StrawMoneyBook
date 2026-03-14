import sharedLedgersHandler from '../../../backend/src/routes/shared-ledgers.js'

export default async function handler(req, res) {
  res.__request = req
  await sharedLedgersHandler(req, res)
}
