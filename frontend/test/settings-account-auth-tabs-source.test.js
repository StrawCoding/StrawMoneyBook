import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const accountSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAccountPage.vue'),
  'utf8',
)
const habitatCss = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/habitat-ui.css'),
  'utf8',
)

test('account login/register tabs expose selected state for modern segment pills', () => {
  assert.match(accountSource, /data-testid="account-auth-tab-login"/)
  assert.match(accountSource, /data-testid="account-auth-tab-register"/)
  assert.match(accountSource, /primary: authMode === 'login'/)
  assert.match(accountSource, /aria-selected="authMode === 'register'/)
  assert.match(habitatCss, /\.segment-pills \.tab-btn\.active/)
})
