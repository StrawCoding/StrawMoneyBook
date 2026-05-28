import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const googleOAuthSource = readFileSync(
  resolve(import.meta.dirname, '../src/routes/google-oauth.js'),
  'utf8',
)

test('SMB-224: backend Google OAuth exchange ignores env redirect_uri for server auth codes', () => {
  assert.match(googleOAuthSource, /function resolveExchangeRedirectUri/)
  const getEnvMatch = googleOAuthSource.match(/function getGoogleOAuthEnv\(\) \{[\s\S]*?\n\}/)
  assert.ok(getEnvMatch, 'getGoogleOAuthEnv must exist')
  assert.doesNotMatch(getEnvMatch[0], /redirectUri/)
  assert.match(
    googleOAuthSource,
    /resolveExchangeRedirectUri\(body\)/,
    'exchange must resolve redirect_uri from request body only',
  )
})

test('SMB-224 Restart: backend treats a client_id-shaped GOOGLE_OAUTH_CLIENT_SECRET as missing', () => {
  // Regression: when operators paste the OAuth web-client_id into
  // GOOGLE_OAUTH_CLIENT_SECRET, Google replies with
  // "invalid_client / The provided client secret is invalid." which surfaces
  // as the confusing GOOGLE_EXCHANGE_005. The route must detect the
  // client_id shape and short-circuit with the actionable
  // MISSING_GOOGLE_OAUTH_ENV (GOOGLE_EXCHANGE_004) error instead.
  assert.match(googleOAuthSource, /function isClientIdShapedSecret/)
  assert.ok(
    googleOAuthSource.includes('.apps.googleusercontent.com'),
    'isClientIdShapedSecret must check the .apps.googleusercontent.com suffix',
  )
  assert.match(
    googleOAuthSource,
    /clientSecretLooksLikeClientId \? '' : rawClientSecret/,
    'getGoogleOAuthEnv must coerce a client_id-shaped secret to empty',
  )
  assert.match(
    googleOAuthSource,
    /function describeMissingOAuthVars/,
    'route must describe which env var is misconfigured',
  )
  assert.match(
    googleOAuthSource,
    /current value looks like a Google OAuth client_id/,
    'missing-env message must call out the client_id-shaped secret mistake',
  )
  assert.match(
    googleOAuthSource,
    /GOCSPX-/,
    'missing-env message must reference the expected GOCSPX- secret prefix',
  )
})

test('SMB-224 Restart: backend reuses describeMissingOAuthVars for both exchange and refresh', () => {
  // Both /api/google/oauth/exchange and /api/google/oauth/refresh must
  // surface the same actionable diagnostic when GOOGLE_OAUTH_CLIENT_SECRET is
  // misconfigured. Counting call sites prevents either route from drifting
  // back to the old generic "GOOGLE_OAUTH_CLIENT_SECRET is missing" message.
  // Strip the function definition before counting call sites so the
  // assertion stays honest if the helper is renamed or its signature changes.
  const withoutDefinition = googleOAuthSource.replace(/function describeMissingOAuthVars\(\{[\s\S]*?\n\}/, '')
  const calls = withoutDefinition.match(/describeMissingOAuthVars\(\{/g) ?? []
  assert.equal(calls.length, 2, 'exchange and refresh handlers must both call describeMissingOAuthVars')
})
