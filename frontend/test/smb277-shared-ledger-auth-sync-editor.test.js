import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyCreateEditorAttribution,
  applyUpdateEditorAttribution,
  buildTransactionEditorAttributionView,
} from '../src/core/services/transaction-editor-attribution.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendSource = readFileSync(join(root, 'src/services/shared-ledger/backend.js'), 'utf8')
const invitationSource = readFileSync(
  join(dirname(root), 'backend/src/routes/shared-ledgers/invitation-handlers.js'),
  'utf8',
)
const ledgerHandlersSource = readFileSync(
  join(dirname(root), 'backend/src/routes/shared-ledgers/ledger-handlers.js'),
  'utf8',
)
const routesSource = readFileSync(
  join(dirname(root), 'backend/src/routes/shared-ledgers/index.js'),
  'utf8',
)
const migration040 = readFileSync(
  join(root, 'src/core/db/migrations/040_transaction_editor_attribution.sql'),
  'utf8',
)

test('SMB-277: invite links are forced to https://www.strawmb.com/open/shared-ledger', () => {
  assert.match(backendSource, /PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE = 'https:\/\/www\.strawmb\.com\/open\/shared-ledger'/)
  assert.match(backendSource, /function enforceHttpsInviteBase\(/)
  assert.match(backendSource, /export function buildSharedLedgerInviteLink\(/)
  assert.match(backendSource, /url\.protocol = 'https:'/)
  assert.match(invitationSource, /function enforceHttpsInviteBase\(/)
  assert.match(invitationSource, /https:\/\/www\.strawmb\.com\/open\/shared-ledger/)
})

test('SMB-277: rotate invite code endpoint exists for Owner/Admin', () => {
  assert.match(ledgerHandlersSource, /export async function handleRotateInviteCode/)
  assert.match(ledgerHandlersSource, /canInviteMembers\(/)
  assert.match(routesSource, /invite-code', 'rotate'/)
  assert.match(backendSource, /export async function rotateSharedLedgerInviteCode/)
})

test('SMB-277: silent refresh failure keeps profile and marks needs reauth', () => {
  assert.match(backendSource, /sessionNeedsReauth/)
  assert.match(backendSource, /export function needsSharedLedgerReauth\(/)
  assert.match(backendSource, /export function getSharedLedgerAuthStatus\(/)
  assert.match(backendSource, /clearAuthTokens\(\{ markNeedsReauth: true \}\)/)
  assert.match(backendSource, /shouldPreserveSessionOnRefreshFailure\(error\)/)
})

test('SMB-277: transaction editor attribution migration and helpers', () => {
  assert.match(migration040, /created_by_user_id/)
  assert.match(migration040, /updated_by_user_id/)
  assert.match(migration040, /created_by_display_name/)
  assert.match(migration040, /updated_by_display_name/)

  const created = applyCreateEditorAttribution({ note: 'x' }, { userId: 'u1', displayName: '澤' })
  assert.equal(created.createdByUserId, 'u1')
  assert.equal(created.updatedByDisplayName, '澤')

  const updated = applyUpdateEditorAttribution({ note: 'y' }, { userId: 'u2', displayName: '安' })
  assert.equal(updated.updatedByUserId, 'u2')
  assert.equal(updated.updatedByDisplayName, '安')

  const sharedView = buildTransactionEditorAttributionView({
    created_by_user_id: 'u1',
    created_by_display_name: '徐承澤',
    updated_by_user_id: 'u2',
    updated_by_display_name: '安娜',
  }, { currentUserId: 'u1', isSharedLedger: true })
  assert.equal(sharedView.samePerson, false)
  assert.equal(sharedView.createdByName, '徐承澤')
  assert.equal(sharedView.updatedByName, '安娜')

  const soloSelfHidden = buildTransactionEditorAttributionView({
    created_by_user_id: 'u1',
    created_by_display_name: '我',
    updated_by_user_id: 'u1',
    updated_by_display_name: '我',
  }, { currentUserId: 'u1', isSharedLedger: false })
  assert.equal(soloSelfHidden, null)
})
