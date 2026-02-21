import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerId = 'ledger-sim-1'

process.env.VITE_GOOGLE_WEB_CLIENT_ID = process.env.VITE_GOOGLE_WEB_CLIENT_ID || 'mock-web-client-id.apps.googleusercontent.com'
process.env.VITE_GOOGLE_USE_SERVER_AUTH_CODE = 'true'
process.env.VITE_GOOGLE_OAUTH_EXCHANGE_URL = 'https://mock.strawmb.local/api/google/oauth/exchange'
process.env.VITE_GOOGLE_OAUTH_REFRESH_URL = 'https://mock.strawmb.local/api/google/oauth/refresh'

globalThis.localStorage = createMemoryStorage()

const state = {
  socialCalls: [],
  settings: new Map(),
  exchangeCalls: 0,
  refreshCalls: 0,
  driveListAuthHeaders: [],
  driveUploadAuthHeaders: [],
  triggerDrive401Once: true,
}

globalThis.__googleBackupSimState = state
globalThis.fetch = createFetchMock(state)

const server = await createServer({
  root: rootDir,
  configFile: false,
  plugins: [createMockPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  optimizeDeps: {
    noDiscovery: true,
  },
  ssr: {
    noExternal: true,
  },
})

try {
  const backup = await server.ssrLoadModule('/src/ui/services/google-backup.service.js')

  console.log('--- Simulate: connectGoogleBackup ---')
  const connectedState = await backup.connectGoogleBackup(ledgerId)
  console.log({
    connected: connectedState.connected,
    accountEmail: connectedState.accountEmail,
    accountName: connectedState.accountName,
  })

  console.log('--- Simulate: performGoogleBackup (with forced 401 once) ---')
  const backupResult = await backup.performGoogleBackup(ledgerId, { interactiveAuth: false })
  console.log(backupResult)

  const finalState = await backup.getGoogleBackupState(ledgerId)
  console.log('--- Final backup state ---')
  console.log({
    connected: finalState.connected,
    lastBackupStatus: finalState.lastBackupStatus,
    lastBackupFilename: finalState.lastBackupFilename,
  })

  console.log('--- Trace summary ---')
  console.log({
    exchangeCalls: state.exchangeCalls,
    refreshCalls: state.refreshCalls,
    driveListAuthHeaders: state.driveListAuthHeaders,
    driveUploadAuthHeaders: state.driveUploadAuthHeaders,
    socialCalls: state.socialCalls.map(([name]) => name),
  })
} finally {
  await server.close()
}

function createMockPlugin() {
  const capacitorCoreId = '\0mock-capacitor-core'
  const socialLoginId = '\0mock-social-login'
  const settingsRepoId = '\0mock-settings-repo'
  const exportServiceId = '\0mock-export-service'

  return {
    name: 'mock-google-backup-deps',
    enforce: 'pre',
    resolveId(source) {
      if (source === '@capacitor/core') return capacitorCoreId
      if (source === '@capgo/capacitor-social-login') return socialLoginId
      if (source === '@/core/repositories/settings.repo' || source === '@/core/repositories/settings.repo.js') return settingsRepoId
      if (source === '@/core/services/export.service' || source === '@/core/services/export.service.js') return exportServiceId
      return null
    },
    load(id) {
      if (id === capacitorCoreId) {
        return `
          export const Capacitor = { isNativePlatform: () => true };
          export function registerPlugin() { return {}; }
          export default { Capacitor, registerPlugin };
        `
      }
      if (id === socialLoginId) {
        return `
          const state = globalThis.__googleBackupSimState;
          export const SocialLogin = {
            initialize: async (options) => {
              state.socialCalls.push(['initialize', options]);
            },
            login: async (options) => {
              state.socialCalls.push(['login', options]);
              return {
                provider: 'google',
                result: {
                  responseType: 'offline',
                  serverAuthCode: 'mock-server-auth-code',
                },
              };
            },
            logout: async (options) => {
              state.socialCalls.push(['logout', options]);
            },
            isLoggedIn: async () => ({ isLoggedIn: true }),
            getAuthorizationCode: async () => ({ accessToken: 'legacy-access-token' }),
          };
          export default { SocialLogin };
        `
      }
      if (id === settingsRepoId || id.endsWith('/src/core/repositories/settings.repo.js')) {
        return `
          const state = globalThis.__googleBackupSimState;
          function keyOf(ledgerId, key) {
            return String(ledgerId) + '::' + String(key);
          }
          export async function getSetting(ledgerId, key) {
            return state.settings.get(keyOf(ledgerId, key));
          }
          export async function setSetting(ledgerId, key, value) {
            state.settings.set(keyOf(ledgerId, key), value);
          }
        `
      }
      if (id === exportServiceId || id.endsWith('/src/core/services/export.service.js')) {
        return `
          export async function exportAllLedgersJson() {
            return {
              backup_scope: 'all_ledgers',
              generatedAt: '2026-02-21T00:00:00.000Z',
              ledgers: [{ id: 'demo-ledger', name: 'Demo Ledger' }],
            };
          }
        `
      }
      return null
    },
  }
}

function createFetchMock(state) {
  return async (url, init = {}) => {
    const target = String(url)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const authHeader = readHeader(init?.headers, 'authorization')

    if (target.includes('/api/google/oauth/exchange') && method === 'POST') {
      state.exchangeCalls += 1
      return jsonResponse({
        accessToken: 'access-token-initial',
        refreshToken: 'refresh-token-1',
        expiresIn: 3600,
        profile: {
          email: 'demo@strawmb.com',
          name: 'Demo User',
          imageUrl: 'https://img.local/demo.png',
        },
      })
    }

    if (target.includes('/api/google/oauth/refresh') && method === 'POST') {
      state.refreshCalls += 1
      return jsonResponse({
        accessToken: 'access-token-refreshed',
        refreshToken: 'refresh-token-1',
        expiresIn: 3600,
        profile: {
          email: 'demo@strawmb.com',
          name: 'Demo User',
          imageUrl: 'https://img.local/demo.png',
        },
      })
    }

    if (target.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'GET') {
      state.driveListAuthHeaders.push(authHeader)
      if (state.triggerDrive401Once) {
        state.triggerDrive401Once = false
        return textResponse(401, 'expired access token')
      }
      if (authHeader !== 'Bearer access-token-refreshed') {
        return textResponse(401, `unexpected auth header on retry: ${authHeader}`)
      }
      return jsonResponse({ files: [] })
    }

    if (target.startsWith('https://www.googleapis.com/upload/drive/v3/files') && method === 'POST') {
      state.driveUploadAuthHeaders.push(authHeader)
      if (authHeader !== 'Bearer access-token-refreshed') {
        return textResponse(401, `unexpected auth header for upload: ${authHeader}`)
      }
      return jsonResponse({
        id: 'drive-file-1',
        name: 'StrawMoneyBook_all_ledgers.json',
        modifiedTime: '2026-02-21T00:30:00.000Z',
      })
    }

    return textResponse(500, `unhandled mock fetch: ${method} ${target}`)
  }
}

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  }
}

function readHeader(headers, key) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return String(headers.get(key) ?? headers.get(key.toLowerCase()) ?? '').trim()
  }
  const entries = Object.entries(headers)
  for (const [name, value] of entries) {
    if (String(name).toLowerCase() === key.toLowerCase()) {
      return String(value ?? '').trim()
    }
  }
  return ''
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function textResponse(status, text) {
  return new Response(String(text ?? ''), {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
