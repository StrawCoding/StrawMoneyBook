import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const frontendRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
const googleAuthSource = readFileSync(resolve(frontendRoot, 'src/services/einvoice/auth.js'), 'utf8')
const envDevelopment = readFileSync(resolve(frontendRoot, '.env.development'), 'utf8')
const envExample = readFileSync(resolve(frontendRoot, '.env.example'), 'utf8')
const opsApi = 'https://api.strawmb.com'

test('npm run dev loads ops API bases from .env.development', () => {
  const devEnv = loadEnv('development', frontendRoot, 'VITE_')
  assert.equal(devEnv.VITE_SHARED_LEDGER_API_BASE_URL, opsApi)
  assert.equal(devEnv.VITE_EINVOICE_API_BASE_URL, opsApi)
  assert.equal(devEnv.VITE_GOOGLE_OAUTH_API_ORIGIN, opsApi)
  assert.equal(devEnv.VITE_EXCHANGE_RATE_API_BASE_URL, opsApi)
  assert.match(envDevelopment, /^VITE_SHARED_LEDGER_API_BASE_URL=https:\/\/api\.strawmb\.com$/m)
  assert.match(envExample, /VITE_SHARED_LEDGER_API_BASE_URL=https:\/\/api\.strawmb\.com/)
  assert.match(envExample, /127\.0\.0\.1:8787/)
})

test('production / vite preview does not inherit npm run dev ops API env', () => {
  const prodEnv = loadEnv('production', frontendRoot, 'VITE_')
  assert.notEqual(prodEnv.VITE_SHARED_LEDGER_API_BASE_URL, opsApi)
  assert.equal(String(prodEnv.VITE_SHARED_LEDGER_API_BASE_URL ?? '').trim(), '')
  assert.equal(String(prodEnv.VITE_GOOGLE_OAUTH_API_ORIGIN ?? '').trim(), '')
})

test('explicit Google OAuth origin prefixes even on localhost', () => {
  assert.match(googleAuthSource, /function shouldPrefixGoogleOAuthApiOrigin/)
  assert.match(
    googleAuthSource,
    /isAbsoluteHttpUrl\(String\(import\.meta\.env\.VITE_GOOGLE_OAUTH_API_ORIGIN/,
  )
  assert.match(googleAuthSource, /npm run dev/)
})

test('package.json exposes playwright:dev-ops-api for npm run dev', () => {
  assert.equal(packageJson.scripts.dev, 'vite')
  assert.equal(
    packageJson.scripts['playwright:dev-ops-api'],
    'node scripts/playwright-dev-ops-api.mjs',
  )
})
