/**
 * ART-13–16 / ART-19 — error contract, role matrix, membership gate, UI→sqlite ban.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APP_ERROR_KIND,
  classifyAppError,
  tagAppError,
} from '../src/core/domain/errors.js'
import {
  canPushSharedLedgerSnapshot,
  getSharedLedgerPermissions,
  SHARED_LEDGER_ROLES,
} from '../src/core/domain/shared-ledger-role-matrix.js'
import {
  canPushSharedLedgerSnapshot as beCanPush,
  getSharedLedgerPermissions as bePermissions,
  SHARED_LEDGER_ROLES as beRoles,
} from '../../backend/src/collab/shared-ledger-role-matrix.js'

const root = dirname(fileURLToPath(import.meta.url))

test('ART-19 classifyAppError taxonomy', () => {
  assert.equal(classifyAppError({ code: 'shared_ledger_replace_restore_failed' }).kind, APP_ERROR_KIND.RECOVERY)
  assert.equal(classifyAppError({ status: 401 }).kind, APP_ERROR_KIND.AUTH)
  assert.equal(classifyAppError({ status: 409, message: 'conflict' }).kind, APP_ERROR_KIND.CONFLICT)
  assert.equal(classifyAppError({ message: 'fetch failed' }).kind, APP_ERROR_KIND.NETWORK)
  assert.equal(classifyAppError({ message: 'FOREIGN KEY constraint failed' }).kind, APP_ERROR_KIND.DATABASE)
  assert.equal(classifyAppError({ message: 'amountMinor 必須為大於 0 的數字' }).kind, APP_ERROR_KIND.DOMAIN)
  const err = tagAppError(new Error('x'), { kind: APP_ERROR_KIND.RECOVERY, code: 'x' })
  assert.equal(err.appErrorKind, APP_ERROR_KIND.RECOVERY)
})

test('ART-15 FE/BE role matrix deepEqual', () => {
  assert.deepEqual([...SHARED_LEDGER_ROLES], [...beRoles])
  for (const role of SHARED_LEDGER_ROLES) {
    assert.deepEqual(getSharedLedgerPermissions(role), bePermissions(role))
    assert.equal(canPushSharedLedgerSnapshot(role), beCanPush(role))
  }
  assert.equal(canPushSharedLedgerSnapshot('viewer'), false)
  assert.equal(canPushSharedLedgerSnapshot('member'), true)
})

test('ART-16 MembershipGate exposes client limits API (not server authority)', () => {
  const gate = readFileSync(resolve(root, '../src/core/domain/membership-gate.js'), 'utf8')
  assert.match(gate, /export const MembershipGate/)
  assert.match(gate, /getSnapshot:\s*getMembershipTierSnapshot/)
  assert.match(gate, /assertCanCreateLedger/)
  assert.match(gate, /server remains authoritative/)
})

test('ART-14 ui/services must not import core/db/sqlite', () => {
  const dir = resolve(root, '../src/ui/services')
  const offenders = []
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = resolve(current, name)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith('.js')) continue
      const text = readFileSync(full, 'utf8')
      if (/from ['"]@\/core\/db\/sqlite['"]/.test(text) || /from ['"].*core\/db\/sqlite/.test(text)) {
        offenders.push(full.replace(root, ''))
      }
    }
  }
  walk(dir)
  assert.deepEqual(offenders, [])
})

test('ART-13 shared-ledger replace goes through destructive-data-ops use-case', () => {
  const shared = readFileSync(resolve(root, '../src/ui/services/shared-ledger.service.js'), 'utf8')
  const ops = readFileSync(resolve(root, '../src/core/application/destructive-data-ops.js'), 'utf8')
  assert.match(shared, /replaceLedgerWithDurableRecovery/)
  assert.match(ops, /export async function replaceLedgerWithDurableRecovery/)
})
