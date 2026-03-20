import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRouteFromAppUrl } from '../src/ui/services/app-url-route.js'

test('resolves widget deep links to fixed routes', () => {
  const options = {
    extractSharedLedgerInviteCode: () => null,
    getPreferredBookkeepingPath: () => '/transactions/quick-add',
  }

  assert.deepEqual(
    resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://analysis', options),
    { path: '/analysis' },
  )
  assert.deepEqual(
    resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://ai-auto-bookkeeping', options),
    { path: '/ai-auto-bookkeeping' },
  )
  assert.deepEqual(
    resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://transactions/quick-add', options),
    { path: '/transactions/quick-add' },
  )
})

test('preserves legacy home quickAdd deep link behavior', () => {
  assert.deepEqual(
    resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://home?quickAdd=1', {
      extractSharedLedgerInviteCode: () => null,
      getPreferredBookkeepingPath: () => '/qna-bookkeeping',
    }),
    { path: '/qna-bookkeeping' },
  )

  assert.deepEqual(
    resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://home', {
      extractSharedLedgerInviteCode: () => null,
      getPreferredBookkeepingPath: () => '/transactions/quick-add',
    }),
    { path: '/' },
  )
})

test('resolves shared ledger invite links before route fallbacks', () => {
  assert.deepEqual(
    resolveRouteFromAppUrl('https://strawmoney.app/open/shared-ledger?inviteCode=abc123', {
      extractSharedLedgerInviteCode: () => 'abc123',
      getPreferredBookkeepingPath: () => '/transactions/quick-add',
    }),
    {
      path: '/settings/shared-ledgers',
      query: { inviteCode: 'abc123' },
    },
  )
})

test('returns null for unsupported or malformed urls', () => {
  const options = {
    extractSharedLedgerInviteCode: () => null,
    getPreferredBookkeepingPath: () => '/transactions/quick-add',
  }

  assert.equal(resolveRouteFromAppUrl('', options), null)
  assert.equal(resolveRouteFromAppUrl('not a url', options), null)
  assert.equal(resolveRouteFromAppUrl('com.strawcoding.strawmoneybook://unknown', options), null)
})
