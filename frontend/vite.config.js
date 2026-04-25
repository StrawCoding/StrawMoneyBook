import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

function createRouteModuleLoader(relativePath) {
  const moduleUrl = pathToFileURL(fileURLToPath(new URL(relativePath, import.meta.url))).href
  return () => import(/* @vite-ignore */ moduleUrl)
}

const EXACT_API_ROUTE_LOADERS = {
  '/api/app-update/play': createRouteModuleLoader('./api/app-update/play.js'),
  '/api/bank/disconnect': createRouteModuleLoader('./api/bank/disconnect.js'),
  '/api/bank/exchange': createRouteModuleLoader('./api/bank/exchange.js'),
  '/api/bank/link_session': createRouteModuleLoader('./api/bank/link_session.js'),
  '/api/bank/mark_imported': createRouteModuleLoader('./api/bank/mark_imported.js'),
  '/api/bank/sync': createRouteModuleLoader('./api/bank/sync.js'),
  '/api/exchange-rate/cbc': createRouteModuleLoader('./api/exchange-rate/cbc.js'),
  '/api/google/oauth/exchange': createRouteModuleLoader('./api/google/oauth/exchange.js'),
  '/api/google/oauth/refresh': createRouteModuleLoader('./api/google/oauth/refresh.js'),
}

const PREFIX_API_ROUTE_LOADERS = [
  {
    prefix: '/api/auth',
    loadRoute: createRouteModuleLoader('./api/auth/[...path].js'),
  },
  {
    prefix: '/api/referrals',
    loadRoute: createRouteModuleLoader('./api/referrals/[...path].js'),
  },
  {
    prefix: '/api/shared-ledgers',
    loadRoute: createRouteModuleLoader('./api/shared-ledgers/[...path].js'),
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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  const plugins = [vue()]
  if (command !== 'build') {
    plugins.push(localApiDevPlugin())
  }
  if (mode !== 'production') {
    plugins.push(vueDevTools())
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['jeep-sqlite', 'jeep-sqlite/loader'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('vuedraggable')) return 'vendor-dnd'
              if (
                id.includes('@capacitor-community/sqlite')
                || id.includes('/@capacitor/')
                || id.includes('@sqlite.org/sqlite-wasm')
                || id.includes('jeep-sqlite')
                || id.includes('sql.js')
              ) {
                return 'vendor-sqlite'
              }
              if (id.includes('@fortawesome')) return 'vendor-icons'
              if (id.includes('/vue/')) return 'vendor-vue'
              return 'vendor'
            }
            if (
              id.includes('/src/ui/services/i18n.service.js')
              || id.includes('/src/ui/services/runtime-')
            ) {
              return 'app-i18n'
            }
            if (
              id.includes('/src/core/services/ai-bookkeeping')
              || id.includes('/src/ui/composables/use-speech-input.js')
            ) {
              return 'app-ai'
            }
            if (
              id.includes('/src/core/services/membership.service.js')
              || id.includes('/src/core/services/google-play-billing.service.js')
              || id.includes('/src/ui/services/app-update.service.js')
            ) {
              return 'app-membership'
            }
            if (
              id.includes('/src/services/google/auth.js')
              || id.includes('/src/ui/services/google-identity.service.js')
              || id.includes('/src/ui/services/google-backup.service.js')
            ) {
              return 'app-google'
            }
            return null
          },
        },
      },
    },
  }
})
