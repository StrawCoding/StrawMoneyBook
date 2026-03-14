import authHandler from '../../../backend/src/routes/auth.js'

export default async function handler(req, res) {
  res.__request = req
  await authHandler(req, res)
}
