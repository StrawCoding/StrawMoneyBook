import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fileURLToPath, URL } from 'node:url'

const BANK_API_ROUTE_LOADERS = {
  '/link_session': () => import('./api/bank/link_session.js'),
  '/exchange': () => import('./api/bank/exchange.js'),
  '/sync': () => import('./api/bank/sync.js'),
  '/disconnect': () => import('./api/bank/disconnect.js'),
  '/mark_imported': () => import('./api/bank/mark_imported.js'),
}

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

function createBankApiMiddleware() {
  return async function bankApiMiddleware(req, res, next) {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const loadRoute = BANK_API_ROUTE_LOADERS[pathname]
    if (!loadRoute) {
      next()
      return
    }

    try {
      req.body = await readRequestBody(req)
      const routeModule = await loadRoute()
      const handler = routeModule?.default
      if (typeof handler !== 'function') {
        next(new Error(`invalid bank api handler for ${pathname}`))
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

function bankApiDevPlugin() {
  return {
    name: 'bank-api-dev-plugin',
    configureServer(server) {
      server.middlewares.use('/api/bank', createBankApiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/bank', createBankApiMiddleware())
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
    plugins: [vue(), vueDevTools(), bankApiDevPlugin()],
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
