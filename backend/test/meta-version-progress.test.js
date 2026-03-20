import test from 'node:test'
import assert from 'node:assert/strict'

process.env.LINEAR_API_KEY = 'test-linear-api-key'
process.env.LINEAR_TEAM_KEY = 'SMB'

const metaHandler = (await import('../src/routes/meta.js')).default

function createMockResponse(req) {
  return {
    __request: req,
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    getHeader(name) {
      return this.headers[name]
    },
    status(code) {
      this.statusCode = Number(code) || 200
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end(payload) {
      this.ended = payload
      return this
    },
  }
}

test('version progress only returns safe issue fields sorted by updated time', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: {
          team: {
            issues: {
              nodes: [
                {
                  title: 'Older issue',
                  updatedAt: '2026-03-20T08:00:00.000Z',
                  state: { name: 'Todo' },
                  description: 'hidden',
                },
                {
                  title: 'Newest issue',
                  updatedAt: '2026-03-20T09:30:00.000Z',
                  state: { name: 'In Progress' },
                  secret: 'hidden',
                },
              ],
            },
          },
        },
      }
    },
  })

  try {
    const req = {
      method: 'GET',
      url: '/api/meta/version-progress',
      headers: { host: 'localhost' },
    }
    const res = createMockResponse(req)

    await metaHandler(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      items: [
        { title: 'Newest issue', status: 'In Progress' },
        { title: 'Older issue', status: 'Todo' },
      ],
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('version progress returns an error when Linear API key is missing', async () => {
  const previousApiKey = process.env.LINEAR_API_KEY
  delete process.env.LINEAR_API_KEY

  try {
    const req = {
      method: 'GET',
      url: '/api/meta/version-progress',
      headers: { host: 'localhost' },
    }
    const res = createMockResponse(req)

    await metaHandler(req, res)

    assert.equal(res.statusCode, 503)
    assert.equal(res.body?.error, 'linear_not_configured')
  } finally {
    process.env.LINEAR_API_KEY = previousApiKey
  }
})
