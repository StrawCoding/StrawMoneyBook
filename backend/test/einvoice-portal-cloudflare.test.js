import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUDFLARE_TITLE_PATTERN,
  buildWaitForLoginSelectorsRunCode,
  getPortalSelectorWaitMs,
  isCloudflareChallengeTitle,
} from '../src/einvoice/portal-cloudflare.js'

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
