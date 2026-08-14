/**
 * ART-SEC-03 Phase B — Play receipt verification.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-art-sec03b-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-art-sec03b-secret'
process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.strawcoding.strawmoneybook'
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE = join(tempDir, 'play-sa.json')

await writeFile(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE, JSON.stringify({
  type: 'service_account',
  project_id: 'test',
  private_key_id: 'test',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n',
  client_email: 'strawmoneybook@strawmoneybook.iam.gserviceaccount.com',
  client_id: '123',
  token_uri: 'https://oauth2.googleapis.com/token',
}), 'utf8')

const {
  isGooglePlayPublisherConfigured,
  resetGooglePlayPublisherAuthCacheForTests,
  setGooglePlayPublisherRequestClientForTests,
  verifyGooglePlayPurchase,
} = await import('../src/collab/google-play-publisher.js')

const {
  isVerifiedMembershipSource,
  syncMembershipGrantBySource,
  getMembershipGrantSummary,
} = await import('../src/collab/store-membership.js')

test('ART-SEC-03B: google_play_verified is an authoritative membership source', () => {
  assert.equal(isVerifiedMembershipSource('google_play_client_sync'), false)
  assert.equal(isVerifiedMembershipSource('google_play_verified'), true)
})

test('ART-SEC-03B: verified grant unlocks membership summary', () => {
  const user = { membership_grants: [], updated_at: '' }
  const now = new Date().toISOString()
  syncMembershipGrantBySource(user, 'google_play_verified', {
    active: true,
    startAt: now,
    endAt: new Date(Date.now() + 86400000).toISOString(),
    meta: { plan: 'monthly' },
  }, {
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => now,
  })
  const summary = getMembershipGrantSummary(user)
  assert.equal(summary.active, true)
  assert.equal(summary.source, 'google_play_verified')
})

test('ART-SEC-03B: publisher config detects service-account file', () => {
  resetGooglePlayPublisherAuthCacheForTests()
  assert.equal(isGooglePlayPublisherConfigured(), true)
})

test('ART-SEC-03B: verifyGooglePlayPurchase accepts active subscription token', async () => {
  resetGooglePlayPublisherAuthCacheForTests()
  setGooglePlayPublisherRequestClientForTests({
    async request({ url }) {
      assert.match(url, /purchases\/subscriptions\/subs_monthly_premium\/tokens\//)
      return {
        data: {
          orderId: 'GPA.TEST-SUB',
          expiryTimeMillis: String(Date.now() + 3600_000),
          paymentState: 1,
        },
      }
    },
  })

  const result = await verifyGooglePlayPurchase({
    productId: 'subs_monthly_premium',
    purchaseToken: 'token-sub-1',
    productType: 'subs',
  })
  assert.equal(result.active, true)
  assert.equal(result.orderId, 'GPA.TEST-SUB')
  assert.equal(result.productType, 'subs')
  assert.ok(Date.parse(result.expiresAt) > Date.now())
})

test('ART-SEC-03B: verifyGooglePlayPurchase accepts purchased lifetime inapp token', async () => {
  resetGooglePlayPublisherAuthCacheForTests()
  setGooglePlayPublisherRequestClientForTests({
    async request({ url }) {
      assert.match(url, /purchases\/products\/lifetime_unlock\/tokens\//)
      return {
        data: {
          orderId: 'GPA.TEST-IAP',
          purchaseState: 0,
        },
      }
    },
  })

  const result = await verifyGooglePlayPurchase({
    productId: 'lifetime_unlock',
    purchaseToken: 'token-iap-1',
    productType: 'inapp',
  })
  assert.equal(result.active, true)
  assert.equal(result.productType, 'inapp')
  assert.equal(result.expiresAt, '2099-12-31T23:59:59.999Z')
})

test.after(async () => {
  resetGooglePlayPublisherAuthCacheForTests()
  await rm(tempDir, { recursive: true, force: true })
})
