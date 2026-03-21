import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  logClientError,
  resetErrorLogServiceDependenciesForTest,
  setErrorLogServiceDependenciesForTest,
} from '../src/ui/services/error-log.service.js'

afterEach(() => {
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

  assert.match(adminMemberPageSource, /updateAdminUserMembership/)
  assert.match(adminMemberPageSource, /deleteAdminUser/)
  assert.match(adminMemberPageSource, /會員詳細資料/)
})
