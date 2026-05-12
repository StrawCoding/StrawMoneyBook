import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const googleClientIdSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/google/client-id.js'),
  'utf8',
)
const googleIdentitySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-identity.service.js'),
  'utf8',
)
const googleBackupAuthSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/einvoice/auth.js'),
  'utf8',
)
const settingsAccountSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAccountPage.vue'),
  'utf8',
)
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)

test('Google auth paths share the same frontend web client id resolver', () => {
  assert.match(googleClientIdSource, /'VITE_GOOGLE_WEB_CLIENT_ID'/)
  assert.match(googleClientIdSource, /'VITE_GOOGLE_OAUTH_CLIENT_ID'/)
  assert.match(googleClientIdSource, /'VITE_GOOGLE_CLIENT_ID'/)
  assert.match(googleIdentitySource, /getConfiguredGoogleWebClientId/)
  assert.match(googleBackupAuthSource, /getConfiguredGoogleWebClientId/)
  assert.match(googleClientIdSource, /settings_account\.google_client_id_missing/)
  assert.doesNotMatch(googleIdentitySource, /import\.meta\.env\.VITE_GOOGLE_WEB_CLIENT_ID/)
  assert.doesNotMatch(googleBackupAuthSource, /import\.meta\.env\.VITE_GOOGLE_WEB_CLIENT_ID/)
})

test('Google client id missing message is translated by supported locales', () => {
  assert.match(i18nSource, /'settings_account\.google_client_id_missing': '缺少 Google Web Client ID/)
  assert.match(i18nSource, /'settings_account\.google_client_id_missing': 'Missing Google Web Client ID/)
  assert.match(i18nSource, /'settings_account\.google_client_id_missing': 'Google Web Client ID がありません/)
})

test('account page keeps Google login row visible when client id is missing', () => {
  assert.match(settingsAccountSource, /<div v-if="showGoogleAuthAction" class="google-auth-block">/)
  assert.match(settingsAccountSource, /<p v-if="googleUnavailableReason" class="muted compact">/)
  assert.doesNotMatch(
    settingsAccountSource,
    /const showGoogleAuthAction = computed\(\(\) => \([\s\S]*?&& googleIdentityAvailable\.value[\s\S]*?\)\)/,
  )
  assert.match(
    settingsAccountSource,
    /if \(\s*!shouldRenderAnyGoogleUi\s*\|\|\s*apiUnavailable\.value\s*\|\|\s*!googleIdentityAvailable\.value\s*\) \{/,
  )
})
