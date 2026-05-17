import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAuthRoute } from '../src/routes/auth.js'
import { resolveSharedLedgersRoute } from '../src/routes/shared-ledgers.js'
import { resolveRouteHandler } from '../src/routes/route-table.js'

test('auth route resolver maps exact endpoints to named handlers', () => {
  assert.equal(resolveAuthRoute('POST', '/register')?.name, 'register')
  assert.equal(resolveAuthRoute('POST', '/google/prepare')?.name, 'google_prepare')
  assert.equal(resolveAuthRoute('GET', '/me')?.name, 'me')
  assert.equal(resolveAuthRoute('POST', '/missing'), null)
})

test('shared ledger route resolver extracts dynamic params for invitations and snapshots', () => {
  const invitationRoute = resolveSharedLedgersRoute('POST', ['invitations', 'invite_123'])
  assert.equal(invitationRoute?.name, 'accept_invitation')
  assert.equal(invitationRoute?.params?.invitationId, 'invite_123')

  const snapshotRoute = resolveSharedLedgersRoute('POST', ['ledger_1', 'snapshot'])
  assert.equal(snapshotRoute?.name, 'snapshot_push')
  assert.equal(snapshotRoute?.params?.sharedLedgerId, 'ledger_1')

  assert.equal(resolveSharedLedgersRoute('GET', ['unknown', 'path']), null)
})

test('server route table resolves health and api prefixes without chained if blocks', () => {
  assert.equal(resolveRouteHandler('/health')?.type, 'health')
  assert.equal(resolveRouteHandler('/api/auth/login')?.prefix, '/api/auth')
  assert.equal(resolveRouteHandler('/api/google/oauth/exchange')?.prefix, '/api/google/oauth')
  assert.equal(resolveRouteHandler('/api/google/oauth/refresh')?.prefix, '/api/google/oauth')
  assert.equal(resolveRouteHandler('/api/shared-ledgers/join')?.prefix, '/api/shared-ledgers')
  assert.equal(resolveRouteHandler('/api/invoice/link_session'), null)
  assert.equal(resolveRouteHandler('/api/unknown'), null)
})
