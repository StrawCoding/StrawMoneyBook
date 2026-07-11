import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUDFLARE_TITLE_PATTERN,
  buildWaitForLoginSelectorsRunCode,
  getPortalSelectorWaitMs,
  isCloudflareChallengeTitle,
} from '../src/einvoice/portal-cloudflare.js'
import { getPlaywrightCliTimeoutMs } from '../src/einvoice/playwright-provider.js'

test('SMB-258: portal cloudflare helpers detect challenge title', () => {
  assert.equal(CLOUDFLARE_TITLE_PATTERN.test('Just a moment...'), true)
  assert.equal(isCloudflareChallengeTitle('Just a moment...'), true)
  assert.equal(isCloudflareChallengeTitle('登入-電子發票整合服務平台'), false)
})

test('SMB-258: wait-for-login run code polls selectors after challenge', () => {
  const code = buildWaitForLoginSelectorsRunCode({ phone: '#mobile_phone' }, 45_000)
  assert.match(code, /Just a moment/)
  assert.match(code, /#mobile_phone/)
  assert.match(code, /cloudflareChallenge/)
  assert.match(code, /while \(Date\.now\(\) < deadline\)/)
  assert.equal(getPortalSelectorWaitMs(), 60_000)
})

test('SMB-265: Playwright CLI timeout exceeds selector and Cloudflare wait', () => {
  const previousWait = process.env.EINVOICE_PORTAL_SELECTOR_WAIT_MS
  const previousCliTimeout = process.env.EINVOICE_PLAYWRIGHT_CLI_TIMEOUT_MS
  process.env.EINVOICE_PORTAL_SELECTOR_WAIT_MS = '60000'
  process.env.EINVOICE_PLAYWRIGHT_CLI_TIMEOUT_MS = '60000'
  try {
    assert.equal(getPortalSelectorWaitMs(), 60_000)
    assert.ok(getPlaywrightCliTimeoutMs() > getPortalSelectorWaitMs())
    assert.equal(getPlaywrightCliTimeoutMs(), 75_000)
  } finally {
    if (previousWait == null) delete process.env.EINVOICE_PORTAL_SELECTOR_WAIT_MS
    else process.env.EINVOICE_PORTAL_SELECTOR_WAIT_MS = previousWait
    if (previousCliTimeout == null) delete process.env.EINVOICE_PLAYWRIGHT_CLI_TIMEOUT_MS
    else process.env.EINVOICE_PLAYWRIGHT_CLI_TIMEOUT_MS = previousCliTimeout
  }
})
