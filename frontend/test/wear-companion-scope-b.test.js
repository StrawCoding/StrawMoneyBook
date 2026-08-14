import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  isWearMessagePath,
  isWearTxOp,
  isWearTxType,
  normalizeWearAddons,
  normalizeWearTags,
  validateLedgerSetPayload,
  validateTxCreatePayload,
  validateTxDeletePayload,
  validateTxUpdatePayload,
  WEAR_PATH_WHITELIST,
  WEAR_PATHS,
  WEAR_PROTOCOL_VERSION,
  WEAR_TX_OPS,
  WEAR_TX_TYPES,
} from '../src/core/services/wear-protocol.js'

const frontendRoot = resolve(import.meta.dirname, '..')
const androidRoot = resolve(frontendRoot, 'android')
const phoneJavaRoot = resolve(androidRoot, 'app/src/main/java/com/strawcoding/strawmoneybook/wear')
const wearKotlinRoot = resolve(androidRoot, 'wear/src/main/java')

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'build' || name === '.gradle') continue
      listFiles(full, out)
      continue
    }
    out.push(full)
  }
  return out
}

function baseCreate(overrides = {}) {
  return {
    idempotencyKey: 'idem-1',
    ledgerId: 'led1',
    catalogRevision: 7,
    accountId: 'acc-cash',
    amountMinor: 12300,
    ...overrides,
  }
}

test('scope B: protocol version stays 1 while paths and types expand', () => {
  assert.equal(WEAR_PROTOCOL_VERSION, 1)
  assert.equal(WEAR_PATHS.txUpdate, '/smb/v1/tx/update')
  assert.equal(WEAR_PATHS.txDelete, '/smb/v1/tx/delete')
  assert.equal(WEAR_PATHS.ledgerSet, '/smb/v1/ledger/set')
  for (const path of WEAR_PATH_WHITELIST) {
    assert.ok(path.startsWith('/smb/v1/'), path)
    assert.equal(isWearMessagePath(path), true, path)
  }
  assert.equal(isWearMessagePath('/smb/v1/tx/purge'), false)
  assert.equal(isWearMessagePath('/smb/v2/tx/create'), false)
  assert.equal(isWearMessagePath(''), false)

  assert.deepEqual([...WEAR_TX_TYPES], [
    'expense',
    'income',
    'transfer',
    'adjustment',
    'credit_spend',
    'credit_repay',
    'credit_refund',
    'loan',
  ])
  assert.deepEqual([...WEAR_TX_OPS], ['create', 'update', 'delete'])
  assert.equal(isWearTxType('securities_trade'), false)
  assert.equal(isWearTxType('reimbursement'), false)
  assert.equal(isWearTxOp('upsert'), false)
})

test('scope B: tx.create accepts expense/income and demands a category', () => {
  for (const type of ['expense', 'income']) {
    const parsed = validateTxCreatePayload(baseCreate({ type, categoryId: 'cat-1' }))
    assert.equal(parsed.op, 'create')
    assert.equal(parsed.type, type)
    assert.equal(parsed.amountMinor, 12300)
    assert.equal(parsed.categoryId, 'cat-1')
    assert.throws(
      () => validateTxCreatePayload(baseCreate({ type })),
      new RegExp(`${type} requires categoryId`),
    )
  }
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'expense', categoryId: 'cat-1', amountMinor: 0 })),
    /amountMinor must be a positive integer/,
  )
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'expense', categoryId: 'cat-1', amountMinor: -5 })),
    /amountMinor must be a positive integer/,
  )
})

test('scope B: transfer needs a distinct peer account and no category', () => {
  const parsed = validateTxCreatePayload(baseCreate({ type: 'transfer', toAccountId: 'acc-bank' }))
  assert.equal(parsed.type, 'transfer')
  assert.equal(parsed.peerAccountId, 'acc-bank')
  assert.equal(parsed.categoryId, null)

  const viaPeer = validateTxCreatePayload(baseCreate({ type: 'transfer', peerAccountId: 'acc-bank' }))
  assert.equal(viaPeer.peerAccountId, 'acc-bank')

  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'transfer' })),
    /transfer requires toAccountId/,
  )
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'transfer', toAccountId: 'acc-cash' })),
    /peer account must differ/,
  )
})

test('scope B: adjustment keeps its sign and rejects zero', () => {
  const negative = validateTxCreatePayload(baseCreate({ type: 'adjustment', amountMinor: -4500 }))
  assert.equal(negative.amountMinor, -4500)
  const positive = validateTxCreatePayload(baseCreate({ type: 'adjustment', amountMinor: 4500 }))
  assert.equal(positive.amountMinor, 4500)
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'adjustment', amountMinor: 0 })),
    /adjustment amountMinor must be a non-zero integer/,
  )
})

test('scope B: credit types carry the funding account or category they need', () => {
  const spend = validateTxCreatePayload(baseCreate({ type: 'credit_spend', categoryId: 'cat-1' }))
  assert.equal(spend.type, 'credit_spend')
  assert.equal(spend.categoryId, 'cat-1')
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'credit_spend' })),
    /credit_spend requires categoryId/,
  )

  const repay = validateTxCreatePayload(baseCreate({ type: 'credit_repay', sourceAccountId: 'acc-bank' }))
  assert.equal(repay.sourceAccountId, 'acc-bank')
  assert.equal(repay.peerAccountId, 'acc-bank')
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'credit_repay' })),
    /credit_repay requires sourceAccountId/,
  )
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'credit_repay', sourceAccountId: 'acc-cash' })),
    /peer account must differ/,
  )

  const refund = validateTxCreatePayload(baseCreate({ type: 'credit_refund' }))
  assert.equal(refund.type, 'credit_refund')
  assert.equal(refund.categoryId, null)
})

test('scope B: loan requires a direction and a counterparty', () => {
  const lend = validateTxCreatePayload(baseCreate({
    type: 'loan',
    loanDirection: 'lend',
    counterpartyName: '小明',
  }))
  assert.equal(lend.loanDirection, 'lend')
  assert.equal(lend.counterpartyName, '小明')

  const borrow = validateTxCreatePayload(baseCreate({
    type: 'loan',
    loanDirection: 'borrow',
    counterpartyName: '公司',
  }))
  assert.equal(borrow.loanDirection, 'borrow')

  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'loan', counterpartyName: '小明' })),
    /loanDirection must be lend or borrow/,
  )
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'loan', loanDirection: 'gift', counterpartyName: '小明' })),
    /loanDirection must be lend or borrow/,
  )
  assert.throws(
    () => validateTxCreatePayload(baseCreate({ type: 'loan', loanDirection: 'lend' })),
    /loan requires counterpartyName/,
  )
})

test('scope B: tags and addons are normalized and capped', () => {
  const parsed = validateTxCreatePayload(baseCreate({
    type: 'expense',
    categoryId: 'cat-1',
    tags: ['  食物  ', '食物', '', 'x'.repeat(80), ...Array.from({ length: 20 }, (_, i) => `t${i}`)],
    addons: [
      { label: '手續費', amountMinor: 15 },
      { label: 'zero', amountMinor: 0 },
      { label: 'nan', amountMinor: 'abc' },
    ],
  }))
  assert.equal(parsed.tags.length, 12)
  assert.equal(parsed.tags[0], '食物')
  assert.equal(parsed.tags[1].length, 40)
  assert.deepEqual(parsed.addons, [{ label: '手續費', amountMinor: 15 }])

  assert.deepEqual(normalizeWearTags('["a","a","b"]'), ['a', 'b'])
  assert.deepEqual(normalizeWearTags('not json'), [])
  assert.deepEqual(normalizeWearTags(null), [])
  assert.deepEqual(normalizeWearAddons(null), [])
})

test('scope B: notes are truncated and occurredAt defaults to now', () => {
  const parsed = validateTxCreatePayload(baseCreate({
    type: 'expense',
    categoryId: 'cat-1',
    note: 'n'.repeat(500),
  }))
  assert.equal(parsed.note.length, 200)
  assert.ok(!Number.isNaN(Date.parse(parsed.occurredAt)))

  const explicit = validateTxCreatePayload(baseCreate({
    type: 'expense',
    categoryId: 'cat-1',
    occurredAt: '2026-08-14T10:00:00.000Z',
  }))
  assert.equal(explicit.occurredAt, '2026-08-14T10:00:00.000Z')
})

test('scope B: tx.update only edits watch-renderable simple types', () => {
  const parsed = validateTxUpdatePayload({
    idempotencyKey: 'idem-u1',
    ledgerId: 'led1',
    catalogRevision: 7,
    targetTxId: 'tx-1',
    type: 'expense',
    accountId: 'acc-cash',
    categoryId: 'cat-1',
    amountMinor: 999,
    tags: ['a'],
  })
  assert.equal(parsed.op, 'update')
  assert.equal(parsed.targetTxId, 'tx-1')
  assert.deepEqual(parsed.tags, ['a'])

  assert.throws(
    () => validateTxUpdatePayload({
      idempotencyKey: 'idem-u1',
      ledgerId: 'led1',
      catalogRevision: 7,
      targetTxId: 'tx-1',
      type: 'transfer',
      accountId: 'acc-cash',
      amountMinor: 999,
    }),
    /update supports expense, income or adjustment only/,
  )
  assert.throws(
    () => validateTxUpdatePayload({
      idempotencyKey: 'idem-u1',
      ledgerId: 'led1',
      catalogRevision: 7,
      type: 'expense',
      accountId: 'acc-cash',
      categoryId: 'cat-1',
      amountMinor: 999,
    }),
    /targetTxId required/,
  )
  assert.throws(
    () => validateTxUpdatePayload({
      idempotencyKey: 'idem-u1',
      ledgerId: 'led1',
      catalogRevision: 7,
      targetTxId: 'tx-1',
      type: 'expense',
      accountId: 'acc-cash',
      amountMinor: 999,
    }),
    /expense requires categoryId/,
  )
  assert.throws(
    () => validateTxUpdatePayload({
      ledgerId: 'led1',
      catalogRevision: 7,
      targetTxId: 'tx-1',
      type: 'expense',
      accountId: 'acc-cash',
      categoryId: 'cat-1',
      amountMinor: 999,
    }),
    /idempotencyKey required/,
  )
})

test('scope B: tx.delete and ledger.set need only their identity fields', () => {
  const parsed = validateTxDeletePayload({
    idempotencyKey: 'idem-d1',
    ledgerId: 'led1',
    targetTxId: 'tx-1',
  })
  assert.deepEqual(parsed, {
    op: 'delete',
    idempotencyKey: 'idem-d1',
    clientTxId: '',
    ledgerId: 'led1',
    targetTxId: 'tx-1',
  })
  assert.throws(
    () => validateTxDeletePayload({ idempotencyKey: 'idem-d1', ledgerId: 'led1' }),
    /targetTxId required/,
  )
  assert.throws(() => validateTxDeletePayload({ ledgerId: 'led1', targetTxId: 'tx-1' }), /idempotencyKey required/)

  assert.deepEqual(validateLedgerSetPayload({ ledgerId: ' led2 ' }), { ledgerId: 'led2' })
  assert.throws(() => validateLedgerSetPayload({}), /ledgerId required/)
})

test('scope B: JS, Kotlin and Java protocol constants stay in lockstep', () => {
  const kotlinPaths = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/protocol/WearPaths.kt'),
    'utf8',
  )
  const javaConstants = readFileSync(resolve(phoneJavaRoot, 'WearCompanionConstants.java'), 'utf8')

  for (const path of WEAR_PATH_WHITELIST) {
    assert.ok(kotlinPaths.includes(`"${path}"`), `WearPaths.kt missing ${path}`)
    assert.ok(javaConstants.includes(`"${path}"`), `WearCompanionConstants.java missing ${path}`)
  }
  for (const type of WEAR_TX_TYPES) {
    assert.ok(kotlinPaths.includes(`"${type}"`), `WearPaths.kt missing type ${type}`)
    assert.ok(javaConstants.includes(`"${type}"`), `WearCompanionConstants.java missing type ${type}`)
  }
  for (const op of WEAR_TX_OPS) {
    assert.ok(kotlinPaths.includes(`"${op}"`), `WearPaths.kt missing op ${op}`)
    assert.ok(javaConstants.includes(`"${op}"`), `WearCompanionConstants.java missing op ${op}`)
  }
  assert.match(kotlinPaths, /PROTOCOL_VERSION\s*=\s*1/)
  assert.match(javaConstants, /PROTOCOL_VERSION\s*=\s*1/)
})

test('scope B: phone engines dispatch every type plus update and delete', () => {
  const jsService = readFileSync(resolve(frontendRoot, 'src/core/services/wear-transaction.service.js'), 'utf8')
  const javaEngine = readFileSync(resolve(phoneJavaRoot, 'WearTransactionEngine.java'), 'utf8')
  const javaProtocol = readFileSync(resolve(phoneJavaRoot, 'WearProtocol.java'), 'utf8')
  const listener = readFileSync(resolve(phoneJavaRoot, 'WearCompanionListenerService.java'), 'utf8')

  assert.match(jsService, /export async function applyWearTxCreate/)
  assert.match(jsService, /export async function applyWearTxUpdate/)
  assert.match(jsService, /export async function applyWearTxDelete/)
  assert.match(jsService, /export async function applyWearOutboxOp/)
  for (const fn of [
    'createExpense',
    'createIncome',
    'createTransfer',
    'createAdjustment',
    'createCreditRepayment',
    'createCreditRefundAdjustment',
    'createLoanWithOptionalTransaction',
    'updateManualTransaction',
    'deleteManualTransaction',
  ]) {
    assert.ok(jsService.includes(fn), `wear-transaction.service.js should reuse ${fn}`)
  }
  // Idempotency stays the contract for replayed outbox rows.
  assert.match(jsService, /INSERT INTO wear_applied/)
  assert.match(jsService, /originType: 'wear'/)

  assert.match(javaProtocol, /validateTxUpdate/)
  assert.match(javaProtocol, /validateTxDelete/)
  assert.match(javaProtocol, /validateLedgerSet/)
  assert.match(javaEngine, /applyTxCreate/)
  assert.match(javaEngine, /applyTxUpdate/)
  assert.match(javaEngine, /applyTxDelete/)
  assert.match(javaEngine, /transfer_group_id/)
  assert.match(javaEngine, /assetsTotalMinor/)
  assert.match(javaEngine, /budgetRemainingMinor/)
  assert.match(javaEngine, /"ledgers"/)
  assert.match(javaEngine, /INSERT INTO wear_applied/)

  assert.match(listener, /PATH_TX_UPDATE/)
  assert.match(listener, /PATH_TX_DELETE/)
  assert.match(listener, /PATH_LEDGER_SET/)
})

test('scope B: watch outbox v2 carries the new columns with a real migration', () => {
  const entity = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/data/OutboxEntity.kt'),
    'utf8',
  )
  const database = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/data/WearOutboxDatabase.kt'),
    'utf8',
  )
  const repo = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/sync/WearSyncRepository.kt'),
    'utf8',
  )
  const cache = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/data/WearCacheStore.kt'),
    'utf8',
  )

  for (const column of ['op', 'peerAccountId', 'sourceAccountId', 'tagsJson', 'extrasJson', 'targetTxId']) {
    assert.ok(entity.includes(column), `OutboxEntity missing ${column}`)
    assert.ok(database.includes(column), `migration missing ${column}`)
  }
  assert.match(database, /version = 2/)
  assert.match(database, /Migration\(1, 2\)/)
  assert.match(database, /ADD COLUMN op TEXT NOT NULL DEFAULT/)
  assert.doesNotMatch(database, /fallbackToDestructiveMigration/)

  assert.match(repo, /enqueueUpdate/)
  assert.match(repo, /enqueueDelete/)
  assert.match(repo, /repeatLast/)
  assert.match(repo, /setActiveLedger/)
  assert.match(cache, /assetsTotalMinor/)
  assert.match(cache, /budgetRemainingMinor/)
  assert.match(cache, /fun ledgers/)
  assert.match(cache, /fun accounts/)
  assert.match(cache, /fun categories/)
  assert.match(cache, /fun templates/)
})

test('scope B: watch UI covers pickers, tags, time, edit/delete, templates, rotary and voice', () => {
  const screens = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/presentation/WearScreens.kt'),
    'utf8',
  )
  const main = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/presentation/MainActivity.kt'),
    'utf8',
  )
  const draft = readFileSync(
    resolve(wearKotlinRoot, 'com/strawcoding/strawmoneybook/presentation/WearDraft.kt'),
    'utf8',
  )

  assert.match(screens, /fun HomeScreen/)
  assert.match(screens, /fun TypePickerScreen/)
  assert.match(screens, /fun EntryScreen/)
  assert.match(screens, /fun PickerScreen/)
  assert.match(screens, /fun TagsScreen/)
  assert.match(screens, /fun TimeScreen/)
  assert.match(screens, /fun NoteScreen/)
  assert.match(screens, /fun RecentScreen/)
  assert.match(screens, /fun TransactionDetailScreen/)
  assert.match(screens, /fun LedgerScreen/)
  assert.match(screens, /fun TemplatesScreen/)
  // rotary/crown scrolling and the voice-note entry point must both exist.
  assert.match(screens, /onRotaryScrollEvent/)
  assert.match(screens, /RecognizerIntent/)
  // Voice must degrade gracefully when the recognizer is absent.
  assert.match(screens, /runCatching/)
  assert.match(main, /WearRoutes/)
  assert.match(draft, /fun validationError|val validationError/)
})

test('scope B: MessageClient-only invariant still holds on both sides', () => {
  const offenders = []
  for (const file of [...listFiles(wearKotlinRoot), ...listFiles(phoneJavaRoot)]) {
    if (!file.endsWith('.kt') && !file.endsWith('.java')) continue
    const text = readFileSync(file, 'utf8')
    if (/PutDataRequest|PutDataMapRequest|DataClient|DataMapItem|DataEventBuffer/.test(text)) {
      offenders.push(file)
    }
  }
  assert.deepEqual(offenders, [], `forbidden Data Layer usage: ${offenders.join(', ')}`)

  // Watch must never reach the phone DB or a network API directly.
  const watchOffenders = []
  for (const file of listFiles(wearKotlinRoot)) {
    if (!file.endsWith('.kt')) continue
    const text = readFileSync(file, 'utf8')
    if (/HttpURLConnection|OkHttpClient|Retrofit|straw_money_bookSQLite/.test(text)) watchOffenders.push(file)
  }
  assert.deepEqual(watchOffenders, [], `watch must stay companion-only: ${watchOffenders.join(', ')}`)
})
