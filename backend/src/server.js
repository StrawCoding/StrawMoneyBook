import { createServer } from 'node:http'
import authHandler from './routes/auth.js'
import referralsHandler from './routes/referrals.js'
import sharedLedgersHandler from './routes/shared-ledgers.js'

const HOST = String(process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0'
const PORT = Math.max(1, Number(process.env.PORT ?? 8787) || 8787)

function ensureNodeStyleResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = function status(code) {
      res.statusCode = Number(code) || 200
      return res
    }
  }
  if (typeof res.json !== 'function') {
    res.json = function json(payload) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
      }
      res.end(JSON.stringify(payload))
      return res
    }
  }
  return res
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return ''
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
  const response = ensureNodeStyleResponse(res)

  try {
    req.body = await readRequestBody(req)
    const host = String(req.headers?.host ?? `${HOST}:${PORT}`)
    const pathname = new URL(String(req.url ?? '/'), `http://${host}`).pathname

    if (pathname === '/health') {
      response.status(200).json({
        ok: true,
        service: 'strawmoneybook-backend',
      })
      return
    }

    if (pathname.startsWith('/api/auth')) {
      await authHandler(req, response)
      return
    }

    if (pathname.startsWith('/api/shared-ledgers')) {
      await sharedLedgersHandler(req, response)
      return
    }

    if (pathname.startsWith('/api/referrals')) {
      await referralsHandler(req, response)
      return
    }

    response.status(404).json({
      error: 'not_found',
      message: 'route not found',
    })
  } catch (error) {
    response.status(500).json({
      error: 'server_error',
      message: String(error?.message ?? error ?? 'unknown error'),
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT}`)
})
