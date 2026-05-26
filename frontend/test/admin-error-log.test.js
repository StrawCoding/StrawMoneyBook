import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  logClientError,
  logToastError,
  getErrorLogSnapshot,
  subscribeErrorLog,
  resetErrorLogForTest,
  resetErrorLogServiceDependenciesForTest,
  setErrorLogServiceDependenciesForTest,
} from '../src/ui/services/error-log.service.js'

afterEach(() => {
  resetErrorLogForTest()
  resetErrorLogServiceDependenciesForTest()
})

test('logClientError deduplicates repeated errors within the cooldown window', async () => {
  const uploads = []
  setErrorLogServiceDependenciesForTest({
    uploadClientErrorLog: async (payload) => {
      uploads.push(payload)
      return { ok: true }
    },
  })

  const error = new Error('boom')
  await logClientError(error, { source: 'vue', routePath: '/settings/admin' })
  await logClientError(error, { source: 'vue', routePath: '/settings/admin' })

  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].message, 'boom')
})

test('logClientError preserves sanitized debug metadata in the upload payload', async () => {
  const uploads = []
  setErrorLogServiceDependenciesForTest({
    uploadClientErrorLog: async (payload) => {
      uploads.push(payload)
      return { ok: true }
    },
  })

  const error = new Error('bank sync failed')
  error.code = 'bank_sync_login_failed'
  await logClientError(error, {
    source: 'bank_sync',
    routePath: '/settings/bank-sync',
    debug: {
      operation: 'connect_bank_account',
      debugHint: 'check otp',
      debugLastStep: 'submit_login',
      trace: {
        steps: [
          { step: 'load_login_page', status: 'ok' },
          { step: 'submit_login', status: 'error' },
        ],
      },
    },
  })

  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].context.debug.operation, 'connect_bank_account')
  assert.equal(uploads[0].context.debug.debugHint, 'check otp')
  assert.equal(uploads[0].context.debug.trace.steps[1].step, 'submit_login')
})

// SMB-220: error log buffer integration tests

test('logToastError appends error entry accessible via getErrorLogSnapshot', () => {
  logToastError('網路連線失敗', '/settings/auto-backup')
  const snapshot = getErrorLogSnapshot()
  assert.equal(snapshot.length, 1)
  assert.equal(snapshot[0].source, 'toast')
  assert.equal(snapshot[0].message, '網路連線失敗')
  assert.equal(snapshot[0].routePath, '/settings/auto-backup')
  assert.ok(snapshot[0].loggedAt)
  assert.ok(snapshot[0].id.startsWith('error_log_'))
})

test('logClientError appends vue error entry to in-memory buffer', async () => {
  setErrorLogServiceDependenciesForTest({
    uploadClientErrorLog: async () => ({ ok: true }),
  })
  const error = new Error('component render failed')
  await logClientError(error, { source: 'vue', component: 'HomeView', routePath: '/' })
  const snapshot = getErrorLogSnapshot()
  assert.equal(snapshot.length, 1)
  assert.equal(snapshot[0].source, 'vue')
  assert.equal(snapshot[0].message, 'component render failed')
  assert.equal(snapshot[0].component, 'HomeView')
  assert.equal(snapshot[0].routePath, '/')
})

test('subscribeErrorLog receives current entries immediately and on update', () => {
  logToastError('first error', '/home')
  const received = []
  const unsub = subscribeErrorLog((items) => received.push([...items]))
  logToastError('second error', '/settings')
  unsub()

  assert.ok(received.length >= 2)
  assert.equal(received[0].length, 1)
  assert.equal(received[0][0].message, 'first error')
  assert.equal(received[1].length, 2)
  assert.equal(received[1][0].message, 'second error')
})

test('error log buffer trims to 100 entries', () => {
  for (let i = 0; i < 105; i++) {
    logToastError(`error ${i}`, '/home')
  }
  const snapshot = getErrorLogSnapshot()
  assert.equal(snapshot.length, 100)
  assert.equal(snapshot[0].message, 'error 104')
})

test('SMB-220 debug page imports subscribeErrorLog and getErrorLogSnapshot', () => {
  const debugPageSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDeveloperDebugPage.vue'),
    'utf8',
  )
  assert.match(debugPageSource, /subscribeErrorLog/)
  assert.match(debugPageSource, /getErrorLogSnapshot/)
  assert.match(debugPageSource, /error_logs/)
})

test('SMB-220 main.js installs global error logging', () => {
  const mainSource = readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8')
  assert.match(mainSource, /installGlobalErrorLogging/)
})

test('SMB-220 ui.store calls logToastError for error type toasts', () => {
  const storeSource = readFileSync(resolve(import.meta.dirname, '../src/ui/stores/ui.store.js'), 'utf8')
  assert.match(storeSource, /logToastError/)
  assert.match(storeSource, /type.*error|error.*type/i)
})

test('settings router and settings page expose the admin console entry points', () => {
  const routerSource = readFileSync(resolve(import.meta.dirname, '../src/ui/router/index.js'), 'utf8')
  const settingsSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings.vue'), 'utf8')

  assert.match(routerSource, /name: 'settings-admin'/)
  assert.match(routerSource, /name: 'settings-admin-user'/)
  assert.match(routerSource, /path: '\/settings\/admin\/users\/:id'/)
  assert.match(routerSource, /getSharedLedgerSession\(\)\?\.user\?\.is_admin/)
  assert.match(settingsSource, /\/settings\/admin/)
  assert.match(settingsSource, /settings\.admin_console/)
})

test('admin member management uses search pagination and a dedicated detail page', () => {
  const adminPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAdminPage.vue'), 'utf8')
  const adminMemberPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAdminMemberPage.vue'), 'utf8')

  assert.match(adminPageSource, /const MEMBERS_PER_PAGE = 10/)
  assert.match(adminPageSource, /v-model\.trim="searchQuery"/)
  assert.match(adminPageSource, /pageInput/)
  assert.match(adminPageSource, /settings-admin-user/)
  assert.match(adminPageSource, /dashboard-hero/)
  assert.match(adminPageSource, /activityChartPoints/)
  assert.match(adminPageSource, /healthScore/)
  assert.match(adminPageSource, /copyLogEvent\(log\)/)
  assert.match(adminPageSource, /buildLogCopyPayload/)
  assert.match(adminPageSource, /navigator\.clipboard\?\.writeText/)

  assert.match(adminMemberPageSource, /updateAdminUserMembership/)
  assert.match(adminMemberPageSource, /deleteAdminUser/)
  assert.match(adminMemberPageSource, /會員詳細資料/)
})
