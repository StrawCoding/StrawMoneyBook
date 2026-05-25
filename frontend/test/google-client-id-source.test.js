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
const oauthExchangeApiSource = readFileSync(
  resolve(import.meta.dirname, '../api/google/oauth/exchange.js'),
  'utf8',
)
const oauthRefreshApiSource = readFileSync(
  resolve(import.meta.dirname, '../api/google/oauth/refresh.js'),
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

test('serverless Google OAuth APIs accept shared web client id fallback', () => {
  // Regression: api.strawmb.com may run the serverless copy of the OAuth endpoints.
  // Those endpoints must not require a duplicate GOOGLE_OAUTH_CLIENT_ID when the
  // already-configured GOOGLE_AUTH_WEB_CLIENT_ID is the same OAuth web client.
  for (const source of [oauthExchangeApiSource, oauthRefreshApiSource]) {
    assert.match(
      source,
      /String\(process\.env\.GOOGLE_OAUTH_CLIENT_ID \?\? ''\)\.trim\(\) \|\|\s*String\(process\.env\.GOOGLE_AUTH_WEB_CLIENT_ID \?\? ''\)\.trim\(\)/,
    )
    assert.match(source, /GOOGLE_AUTH_WEB_CLIENT_ID \(or GOOGLE_OAUTH_CLIENT_ID\)/)
  }
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
