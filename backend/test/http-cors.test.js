import test from 'node:test'
import assert from 'node:assert/strict'

function createMockResponse(req) {
  const headers = {}
  const res = {
    __request: req,
    statusCode: 200,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()]
    },
    headers,
    status(code) {
      res.statusCode = Number(code) || 200
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
    end() {
      return res
    },
  }
  return res
}

test('SMB-238: cookie auth requests reflect origin with credentials even when ALLOW_ALL_ORIGINS is enabled', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?cors-test=${Date.now()}`)
    const res = createMockResponse({
      headers: {
        origin: 'https://localhost',
        'x-straw-auth-storage': 'cookie',
      },
    })

    httpModule.sendJson(res, 200, { ok: true })

    assert.equal(res.getHeader('access-control-allow-origin'), 'https://localhost')
    assert.equal(res.getHeader('access-control-allow-credentials'), 'true')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-238: anonymous cross-origin requests keep wildcard ACAO when ALLOW_ALL_ORIGINS is enabled', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?cors-anon-test=${Date.now()}`)
    const res = createMockResponse({
      headers: {
        origin: 'https://localhost',
      },
    })

    httpModule.sendJson(res, 200, { ok: true })

    assert.equal(res.getHeader('access-control-allow-origin'), '*')
    assert.equal(res.getHeader('access-control-allow-credentials'), undefined)
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
