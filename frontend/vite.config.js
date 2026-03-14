import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fileURLToPath, URL } from 'node:url'

const EXACT_API_ROUTE_LOADERS = {
  '/api/app-update/play': () => import('./api/app-update/play.js'),
  '/api/bank/disconnect': () => import('./api/bank/disconnect.js'),
  '/api/bank/exchange': () => import('./api/bank/exchange.js'),
  '/api/bank/link_session': () => import('./api/bank/link_session.js'),
  '/api/bank/mark_imported': () => import('./api/bank/mark_imported.js'),
  '/api/bank/sync': () => import('./api/bank/sync.js'),
  '/api/exchange-rate/cbc': () => import('./api/exchange-rate/cbc.js'),
  '/api/google/oauth/exchange': () => import('./api/google/oauth/exchange.js'),
  '/api/google/oauth/refresh': () => import('./api/google/oauth/refresh.js'),
}

const PREFIX_API_ROUTE_LOADERS = [
  {
    prefix: '/api/auth',
    loadRoute: () => import('./api/auth/[...path].js'),
  },
  {
    prefix: '/api/referrals',
    loadRoute: () => import('./api/referrals/[...path].js'),
  },
  {
    prefix: '/api/speech',
    loadRoute: () => import('./api/speech/[...path].js'),
  },
  {
    prefix: '/api/shared-ledgers',
    loadRoute: () => import('./api/shared-ledgers/[...path].js'),
  },
]

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
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return Buffer.alloc(0)
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function resolveApiRouteLoader(pathname) {
  const exactRoute = EXACT_API_ROUTE_LOADERS[pathname]
  if (exactRoute) {
    return exactRoute
  }

  const matchedPrefixRoute = PREFIX_API_ROUTE_LOADERS.find(({ prefix }) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))
  return matchedPrefixRoute?.loadRoute ?? null
}

function createApiMiddleware() {
  return async function apiMiddleware(req, res, next) {
    const parsedUrl = new URL(req.url ?? '/', 'http://localhost')
    const pathname = parsedUrl.pathname
    const loadRoute = resolveApiRouteLoader(pathname)
    if (!loadRoute) {
      next()
      return
    }

    try {
      req.rawBody = await readRequestBody(req)
      const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase()
      if (!req.rawBody.length) {
        req.body = ''
      } else if (contentType.includes('application/json') || contentType.startsWith('text/')) {
        req.body = req.rawBody.toString('utf8')
      } else {
        req.body = req.rawBody
      }
      req.query = Object.fromEntries(parsedUrl.searchParams.entries())
      const routeModule = await loadRoute()
      const handler = routeModule?.default
      if (typeof handler !== 'function') {
        next(new Error(`invalid api handler for ${pathname}`))
        return
      }
      await handler(req, ensureNodeStyleResponse(res))
    } catch (error) {
      ensureNodeStyleResponse(res).status(500).json({
        error: 'dev_server_error',
        message: String(error?.message ?? error ?? 'unknown error'),
      })
    }
  }
}

function localApiDevPlugin() {
  return {
    name: 'local-api-dev-plugin',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware())
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    plugins: [vue(), vueDevTools(), localApiDevPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['jeep-sqlite', 'jeep-sqlite/loader'],
    },
  }
})
