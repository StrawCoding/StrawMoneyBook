import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_CAPTCHA_API_URL,
  DEFAULT_LOGIN_URL,
  DEFAULT_SELECTORS,
  getCaptchaApiUrl,
  getLoginUrl,
  getQueryApiPattern,
  getSelectors,
} from '../src/einvoice/portal-config.js'

const repoRoot = resolve(import.meta.dirname, '..')
const providerSource = readFileSync(resolve(repoRoot, 'src/einvoice/playwright-provider.js'), 'utf8')
const contractCheckSource = readFileSync(resolve(repoRoot, 'scripts/einvoice-portal-contract-check.mjs'), 'utf8')

test('SMB-251: portal config uses verified SPA selectors and captcha API', () => {
  const selectors = getSelectors()
  assert.match(selectors.phone, /#mobile_phone/)
  assert.match(selectors.password, /#password/)
  assert.match(selectors.captchaInput, /#captcha/)
  assert.match(selectors.loginButton, /#submitBtn/)
  assert.match(getLoginUrl(), /einvoice\.nat\.gov\.tw/)
  assert.match(getCaptchaApiUrl(), /act002i\/captcha/)
  assert.ok(getQueryApiPattern().test('https://service-mc.einvoice.nat.gov.tw/ptl/portal/api/foo/query'))
})

test('SMB-251: playwright provider fetches captcha token and intercepts JSON', () => {
  assert.match(providerSource, /fetchCaptchaFromApi/)
  assert.match(providerSource, /captchaToken/)
  assert.match(providerSource, /extractInvoicesFromJsonPayloads/)
  assert.match(providerSource, /page\.on\('response'/)
  assert.doesNotMatch(providerSource, /screenshot\(\{ type: 'png' \}\)/)
  assert.match(providerSource, /mergeQueryWindows/)
  assert.match(providerSource, /portal-config\.js/)
  assert.match(providerSource, /PLAYWRIGHT_MCP_CONFIG/)
  assert.match(providerSource, /`-s=\$\{safeSessionId\}`/)
  assert.doesNotMatch(providerSource, /--config/)
})

test('SMB-251: contract-check script asserts login selectors and captcha shape', () => {
  assert.match(contractCheckSource, /#mobile_phone|selectors\.phone/)
  assert.match(contractCheckSource, /#password|selectors\.password/)
  assert.match(contractCheckSource, /#captcha|selectors\.captchaInput/)
  assert.match(contractCheckSource, /act002i\/captcha|getCaptchaApiUrl/)
  assert.match(contractCheckSource, /hasToken/)
  assert.match(contractCheckSource, /hasImage/)
})

test('SMB-251: default portal constants match 2026-06 verification', () => {
  assert.equal(DEFAULT_SELECTORS.phone, '#mobile_phone')
  assert.equal(DEFAULT_SELECTORS.password, '#password')
  assert.equal(DEFAULT_SELECTORS.captchaInput, '#captcha')
  assert.equal(DEFAULT_SELECTORS.loginButton, '#submitBtn')
  assert.match(DEFAULT_CAPTCHA_API_URL, /service-mc\.einvoice\.nat\.gov\.tw\/act\/login\/api\/act002i\/captcha/)
  assert.match(DEFAULT_LOGIN_URL, /einvoice\.nat\.gov\.tw/)
})
