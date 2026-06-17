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
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-243: credentialed CORS preflight reflects origin + credentials even when ALLOW_ALL_ORIGINS is enabled', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?cors-preflight-test=${Date.now()}`)
    // A real browser preflight never carries the actual X-Straw-Auth-Storage
    // header; it advertises it via Access-Control-Request-Headers instead.
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-straw-auth-storage',
      },
    }
    const res = createMockResponse(req)

    const handled = httpModule.methodGuard(req, res, ['POST'])

    assert.equal(handled, true)
    assert.equal(res.statusCode, 204)
    assert.equal(res.getHeader('access-control-allow-origin'), 'https://localhost')
    assert.equal(res.getHeader('access-control-allow-credentials'), 'true')
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-243: anonymous CORS preflight keeps wildcard ACAO when ALLOW_ALL_ORIGINS is enabled', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?cors-preflight-anon-test=${Date.now()}`)
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }
    const res = createMockResponse(req)

    const handled = httpModule.methodGuard(req, res, ['POST'])

    assert.equal(handled, true)
    assert.equal(res.statusCode, 204)
    assert.equal(res.getHeader('access-control-allow-origin'), '*')
    assert.equal(res.getHeader('access-control-allow-credentials'), undefined)
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-243: anonymous cross-origin requests keep wildcard ACAO when ALLOW_ALL_ORIGINS is enabled', async () => {
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
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-243: Capacitor origin auth/google POST uses cross-origin CORP with credentialed CORS', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?corp-test=${Date.now()}`)
    const res = createMockResponse({
      headers: {
        origin: 'capacitor://localhost',
        'x-straw-auth-storage': 'cookie',
      },
    })

    httpModule.sendJson(res, 400, { error: 'google_token_required' })

    assert.equal(res.getHeader('access-control-allow-origin'), 'capacitor://localhost')
    assert.equal(res.getHeader('access-control-allow-credentials'), 'true')
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})

test('SMB-244: native client header is allowed in credentialed CORS preflight', async () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS
  const previousNodeEnv = process.env.NODE_ENV
  process.env.ALLOWED_ORIGINS = '*'
  process.env.NODE_ENV = 'production'

  try {
    const httpModule = await import(`../src/collab/http.js?cors-native-client-test=${Date.now()}`)
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://localhost',
        host: 'api.strawmb.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-straw-auth-storage,x-straw-native-client',
      },
    }
    const res = createMockResponse(req)

    const handled = httpModule.methodGuard(req, res, ['POST'])

    assert.equal(handled, true)
    assert.equal(res.statusCode, 204)
    assert.equal(res.getHeader('access-control-allow-origin'), 'https://localhost')
    assert.equal(res.getHeader('access-control-allow-credentials'), 'true')
    assert.match(
      String(res.getHeader('access-control-allow-headers') ?? ''),
      /x-straw-native-client/i,
    )
    assert.equal(res.getHeader('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = previousAllowedOrigins
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
