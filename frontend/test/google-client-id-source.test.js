import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

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
const i18nSource = readI18nBundleSource()

test('Google auth paths share the same frontend web client id resolver', () => {
  assert.match(googleClientIdSource, /'VITE_GOOGLE_WEB_CLIENT_ID'/)
  assert.match(googleClientIdSource, /'VITE_GOOGLE_OAUTH_CLIENT_ID'/)
  assert.match(googleClientIdSource, /'VITE_GOOGLE_CLIENT_ID'/)
  assert.match(googleIdentitySource, /getConfiguredGoogleWebClientId/)
  assert.match(googleBackupAuthSource, /getConfiguredGoogleWebClientId/)
  assert.match(googleClientIdSource, /common\.missing_google_web_client_id/)
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

test('SMB-224: Google OAuth exchange ignores env redirect_uri for Android server auth codes', () => {
  // Regression: env redirect_uri breaks mobile server auth code exchange with GOOGLE_EXCHANGE_005.
  // redirect_uri must only be sent when the client explicitly passes it.
  assert.match(oauthExchangeApiSource, /function resolveExchangeRedirectUri/)
  const getEnvMatch = oauthExchangeApiSource.match(/function getGoogleOAuthEnv\(\) \{[\s\S]*?\n\}/)
  assert.ok(getEnvMatch, 'getGoogleOAuthEnv must exist')
  assert.doesNotMatch(getEnvMatch[0], /redirectUri/)
  assert.match(
    oauthExchangeApiSource,
    /resolveExchangeRedirectUri\(body\)/,
    'exchange must resolve redirect_uri from request body only',
  )
})

test('SMB-224: Google OAuth postJson surfaces backend message before machine error code', () => {
  assert.match(
    googleBackupAuthSource,
    /data\?\.message \?\?\s*data\?\.error_description/,
    'postJson must prefer backend message (Google error_description) over error code',
  )
})

test('SMB-224 Restart: serverless OAuth endpoints treat client_id-shaped secret as missing', () => {
  // Regression for the v1.2.46 follow-up: GOOGLE_OAUTH_CLIENT_SECRET pasted as
  // a client_id (ends with '.apps.googleusercontent.com') caused Google to
  // return "invalid_client / The provided client secret is invalid." for both
  // exchange and refresh, which surfaced as the confusing GOOGLE_EXCHANGE_005 /
  // GOOGLE_REFRESH_005. Both serverless copies must coerce such a value to
  // empty so the request fails fast with the actionable
  // MISSING_GOOGLE_OAUTH_ENV (GOOGLE_EXCHANGE_004 / GOOGLE_REFRESH_004) error.
  for (const source of [oauthExchangeApiSource, oauthRefreshApiSource]) {
    assert.match(source, /function isClientIdShapedSecret/)
    assert.ok(
      source.includes('.apps.googleusercontent.com'),
      'isClientIdShapedSecret must check the .apps.googleusercontent.com suffix',
    )
    assert.match(
      source,
      /clientSecretLooksLikeClientId \? '' : rawClientSecret/,
      'getGoogleOAuthEnv must coerce a client_id-shaped secret to empty',
    )
    assert.match(source, /function describeMissingOAuthVars/)
    assert.match(
      source,
      /current value looks like a Google OAuth client_id/,
      'missing-env message must call out the client_id-shaped secret mistake',
    )
    assert.match(source, /GOCSPX-/, 'missing-env message must reference the GOCSPX- prefix')
  }
})

test('SMB-224 Restart: Google auth error mapper surfaces server config errors to end users', () => {
  // When the backend returns missing_google_oauth_env / invalid_client (because
  // GOOGLE_OAUTH_CLIENT_SECRET is misconfigured), the frontend must show an
  // actionable "後端設定錯誤，請通知管理員" message instead of leaking the raw
  // env-var name to the user, while keeping the original debug detail for Linear.
  assert.match(googleBackupAuthSource, /missing_google_oauth_env/)
  assert.match(googleBackupAuthSource, /invalid_client/)
  assert.match(googleBackupAuthSource, /client secret is invalid/)
  assert.match(googleBackupAuthSource, /google_exchange_004/)
  assert.match(googleBackupAuthSource, /google_refresh_004/)
  assert.match(
    googleBackupAuthSource,
    /Google 自動備份後端設定錯誤，請通知管理員檢查 Google OAuth client \/ secret 設定。/,
  )
})

test('SMB-224 Restart: backend startup loudly flags client_id-shaped GOOGLE_OAUTH_CLIENT_SECRET', () => {
  // Regression: prior to this fix the startup banner only warned about
  // missing env vars, so an operator who pasted a client_id into the secret
  // would see no warning at all and only learn about it from
  // GOOGLE_EXCHANGE_005 reports in the field. The boot path must console.error
  // a precise diagnostic that names both the wrong value's shape and the
  // expected 'GOCSPX-' shape.
  const serverSource = readFileSync(
    resolve(import.meta.dirname, '../../backend/src/server.js'),
    'utf8',
  )
  assert.match(serverSource, /clientSecretLooksLikeClientId/)
  assert.match(serverSource, /\.apps\.googleusercontent\.com/)
  assert.match(serverSource, /GOCSPX-/)
  assert.match(serverSource, /console\.error\(/)
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
