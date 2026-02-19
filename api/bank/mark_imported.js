import { methodGuard, parseBody, sendJson } from './_utils.js'

export default async function handler(req, res) {
  if (methodGuard(req, res)) return
  const body = parseBody(req)
  const transactions = Array.isArray(body.transactions) ? body.transactions : []
  sendJson(res, 200, {
    ok: true,
    accepted: transactions.length,
    marked_at: new Date().toISOString(),
  })
}
