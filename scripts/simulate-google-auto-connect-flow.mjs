import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerId = 'ledger-auto-connect-sim'
const GOOGLE_BACKUP_KEY = 'backup.google_drive'

globalThis.localStorage = createMemoryStorage()

const state = {
  settings: new Map(),
  silentTokenAttempts: [],
  interactiveLogins: [],
}

state.settings.set(`${ledgerId}::${GOOGLE_BACKUP_KEY}`, {
  connected: true,
  accountEmail: 'demo@strawmb.com',
  accountName: 'Demo User',
  accountImageUrl: '',
  autoEnabled: true,
  dataChangeAutoEnabled: false,
  intervalHours: 24,
  lastBackupFilename: '',
  lastBackupAt: '',
  lastBackupStatus: 'idle',
  lastError: '',
})

globalThis.__googleAutoConnectSimState = state

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
    noExternal: ['@capacitor/core'],
  },
})

try {
  const backup = await server.ssrLoadModule('/src/ui/services/google-backup.service.js')

  console.log('--- Simulate: autoConnectGoogleBackup with interactive fallback ---')
  const restoredState = await backup.autoConnectGoogleBackup(ledgerId, { allowInteractive: true })
  console.log({
    connected: restoredState.connected,
    accountEmail: restoredState.accountEmail,
    accountName: restoredState.accountName,
    lastError: restoredState.lastError,
  })

  console.log('--- Trace summary ---')
  console.log({
    silentTokenAttempts: state.silentTokenAttempts,
    interactiveLoginCount: state.interactiveLogins.length,
    interactivePreferredEmail: state.interactiveLogins[0]?.preferredEmail ?? '',
  })
} finally {
  await server.close()
}

function createMockPlugin() {
  const capacitorCoreId = '\0mock-capacitor-core-auto-connect'
  const settingsRepoId = '\0mock-settings-repo-auto-connect'
  const authServiceId = '\0mock-google-auth-service'
  const exportServiceId = '\0mock-export-service-auto-connect'
  const driveServiceId = '\0mock-google-drive-service-auto-connect'
  const i18nServiceId = '\0mock-i18n-service-auto-connect'

  return {
    name: 'mock-google-auto-connect-deps',
    enforce: 'pre',
    resolveId(source) {
      if (source === '@capacitor/core') return capacitorCoreId
      if (source === '@/core/repositories/settings.repo' || source === '@/core/repositories/settings.repo.js') return settingsRepoId
      if (source === '@/services/google/auth' || source === '@/services/google/auth.js') return authServiceId
      if (source === '@/core/services/export.service' || source === '@/core/services/export.service.js') return exportServiceId
      if (source === '@/services/google/drive-appdata-backup' || source === '@/services/google/drive-appdata-backup.js') return driveServiceId
      if (source === '@/ui/services/i18n.service' || source === '@/ui/services/i18n.service.js') return i18nServiceId
      return null
    },
    load(id) {
      if (id === settingsRepoId || id.endsWith('/src/core/repositories/settings.repo.js')) {
        return `
          const state = globalThis.__googleAutoConnectSimState;
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
      if (id === authServiceId || id.endsWith('/src/services/google/auth.js')) {
        return `
          const state = globalThis.__googleAutoConnectSimState;
          let cachedProfile = {};
          export async function getAccessToken(options = {}) {
            state.silentTokenAttempts.push({
              interactive: options?.interactive !== false,
              preferredEmail: String(options?.preferredEmail ?? ''),
            });
            if (options?.interactive === false) {
              const error = new Error('silent token unavailable');
              error.code = 'GOOGLE_REAUTH_REQUIRED';
              throw error;
            }
            return 'interactive-access-token';
          }
          export function getCachedGoogleProfile() {
            return cachedProfile;
          }
          export async function googleSignIn(options = {}) {
            state.interactiveLogins.push({
              preferredEmail: String(options?.preferredEmail ?? ''),
            });
            cachedProfile = {
              email: 'demo@strawmb.com',
              name: 'Demo User',
              imageUrl: 'https://img.local/demo.png',
            };
            return {
              accessToken: 'interactive-access-token',
              profile: cachedProfile,
            };
          }
          export function hasCachedGoogleAuthSession() {
            return true;
          }
          export async function reauth() {
            return 'interactive-access-token';
          }
          export async function googleSignOut() {}
        `
      }
      if (id === exportServiceId || id.endsWith('/src/core/services/export.service.js')) {
        return `
          export async function exportAllLedgersJson() {
            return { ledgers: [] };
          }
        `
      }
      if (id === driveServiceId || id.endsWith('/src/services/google/drive-appdata-backup.js')) {
        return `
          export async function downloadAppDataBackupText() {
            return '';
          }
          export async function listAppDataBackups() {
            return [];
          }
          export async function uploadBackupJsonToAppDataFolder() {
            return { filename: 'StrawMoneyBook_all_ledgers.json', modifiedTime: '2026-03-07T00:00:00.000Z' };
          }
        `
      }
      if (id === i18nServiceId || id.endsWith('/src/ui/services/i18n.service.js')) {
        return `
          export function translateMessage(key, params, fallback) {
            return String(fallback ?? key ?? '');
          }
        `
      }
      if (id === capacitorCoreId) {
        return `
          export const Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
          export function registerPlugin() { return {}; }
          export default { Capacitor, registerPlugin };
        `
      }
      return null
    },
  }
}

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}
