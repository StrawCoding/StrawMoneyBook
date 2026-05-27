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
