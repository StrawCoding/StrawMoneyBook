import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateTxCreatePayload,
  validateTxUpdatePayload,
} from '../src/core/services/wear-protocol.js'

const frontendRoot = resolve(import.meta.dirname, '..')
const phoneJavaRoot = resolve(
  frontendRoot,
  'android/app/src/main/java/com/strawcoding/strawmoneybook/wear',
)
const wearKotlinRoot = resolve(frontendRoot, 'android/wear/src/main/java')

function baseCreate(overrides = {}) {
  return {
    idempotencyKey: 'idem-reimb-1',
    ledgerId: 'led1',
    catalogRevision: 7,
    accountId: 'acc-cash',
    categoryId: 'cat-1',
    amountMinor: 2500,
    type: 'expense',
    ...overrides,
  }
}

test('smb303: expense create accepts isReimbursable and defaults budget/analysis off', () => {
  const on = validateTxCreatePayload(baseCreate({ isReimbursable: true }))
  assert.equal(on.isReimbursable, true)
  assert.equal(on.includeInBudget, false)
  assert.equal(on.includeInAnalysis, false)

  const off = validateTxCreatePayload(baseCreate({}))
  assert.equal(off.isReimbursable, false)
  assert.equal(off.includeInBudget, true)
  assert.equal(off.includeInAnalysis, true)

  const explicitBudget = validateTxCreatePayload(baseCreate({
    isReimbursable: true,
    includeInBudget: true,
    includeInAnalysis: true,
  }))
  assert.equal(explicitBudget.isReimbursable, true)
  assert.equal(explicitBudget.includeInBudget, true)
  assert.equal(explicitBudget.includeInAnalysis, true)
})

test('smb303: non-expense types never keep isReimbursable', () => {
  for (const type of ['income', 'transfer', 'adjustment', 'credit_spend', 'loan']) {
    const overrides = { type, isReimbursable: true }
    if (type === 'transfer') {
      overrides.peerAccountId = 'acc-bank'
      delete overrides.categoryId
    } else if (type === 'credit_spend') {
      // category still required
    } else if (type === 'loan') {
      overrides.loanDirection = 'lend'
      overrides.counterpartyName = '小明'
    } else if (type === 'adjustment') {
      delete overrides.categoryId
    }
    const parsed = validateTxCreatePayload(baseCreate(overrides))
    assert.equal(parsed.isReimbursable, false, type)
  }
})

test('smb303: expense update carries isReimbursable', () => {
  const on = validateTxUpdatePayload({
    idempotencyKey: 'idem-u',
    ledgerId: 'led1',
    catalogRevision: 1,
    targetTxId: 'tx-1',
    type: 'expense',
    accountId: 'acc-cash',
    categoryId: 'cat-1',
    amountMinor: 100,
    isReimbursable: true,
  })
  assert.equal(on.isReimbursable, true)
  assert.equal(on.includeInBudget, false)

  const income = validateTxUpdatePayload({
    idempotencyKey: 'idem-u2',
    ledgerId: 'led1',
    catalogRevision: 1,
    targetTxId: 'tx-2',
    type: 'income',
    accountId: 'acc-cash',
    categoryId: 'cat-inc',
    amountMinor: 100,
    isReimbursable: true,
  })
  assert.equal(income.isReimbursable, false)
})

test('smb303: wear sources wire reimbursable end-to-end', () => {
  const javaProtocol = readFileSync(resolve(phoneJavaRoot, 'WearProtocol.java'), 'utf8')
  const javaEngine = readFileSync(resolve(phoneJavaRoot, 'WearTransactionEngine.java'), 'utf8')
  const jsProtocol = readFileSync(resolve(frontendRoot, 'src/core/services/wear-protocol.js'), 'utf8')
  const jsService = readFileSync(
    resolve(frontendRoot, 'src/core/services/wear-transaction.service.js'),
    'utf8',
  )
  const draft = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/presentation/WearDraft.kt'),
    'utf8',
  )
  const screens = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/presentation/WearScreens.kt'),
    'utf8',
  )
  const sync = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/sync/WearSyncRepository.kt'),
    'utf8',
  )
  const cache = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/data/WearCacheStore.kt'),
    'utf8',
  )

  assert.match(javaProtocol, /isReimbursable/)
  assert.match(javaProtocol, /TYPE_EXPENSE\.equals\(type\)/)
  assert.match(javaEngine, /is_reimbursable = \?/)
  assert.match(javaEngine, /reimbursement_state = \?/)
  assert.match(javaEngine, /defaultIsReimbursable/)
  assert.match(javaEngine, /\"isReimbursable\"/)
  assert.match(jsProtocol, /isReimbursable/)
  assert.match(jsService, /isReimbursable: Boolean\(payload\.isReimbursable\)|isReimbursable: payload\.isReimbursable/)
  assert.match(draft, /isReimbursable/)
  assert.match(draft, /supportsReimbursable/)
  assert.match(screens, /可報銷/)
  assert.match(sync, /isReimbursable/)
  assert.match(cache, /defaultIsReimbursable/)
})
