import speechHandler from '../../../backend/src/routes/speech.js'

export default async function handler(req, res) {
  res.__request = req
  await speechHandler(req, res)
}
