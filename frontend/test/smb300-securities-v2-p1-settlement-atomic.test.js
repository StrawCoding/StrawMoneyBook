import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCancelSettlementPlan,
  buildConfirmSettlementPlan,
  applyCancelSettlementPlan,
  applyConfirmSettlementPlan,
  runAtomicSql,
} from '../src/core/utils/securities-settlement-apply.js'
import { isSettlementDue } from '../src/core/utils/securities-settlement.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')
const root = resolve(import.meta.dirname, '..')

function openSettlementDb(SQL) {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      is_settlement INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE categories (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_key TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE securities (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      asset_class TEXT NOT NULL DEFAULT 'stock',
      settlement_account_id TEXT,
      deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE security_transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      security_id TEXT NOT NULL,
      type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      price_minor INTEGER NOT NULL DEFAULT 0,
      fee_minor INTEGER NOT NULL DEFAULT 0,
      fee_mode TEXT NOT NULL DEFAULT 'into_cost',
      record_mode TEXT NOT NULL DEFAULT 'funds',
      principal_minor INTEGER NOT NULL DEFAULT 0,
      proceeds_minor INTEGER NOT NULL DEFAULT 0,
      settle_at TEXT,
      settlement_status TEXT NOT NULL DEFAULT 'scheduled',
      confirmed_at TEXT,
      cash_account_id TEXT,
      cash_principal_tx_id TEXT,
      cash_pnl_tx_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense','income','adjustment','transfer')),
      transfer_group_id TEXT,
      account_id TEXT,
      peer_account_id TEXT,
      category_id TEXT,
      amount_minor INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      note TEXT,
      location TEXT,
      tags_json TEXT,
      origin_type TEXT,
      external_ref_id TEXT,
      idempotency_key TEXT,
      is_reimbursable INTEGER NOT NULL DEFAULT 0,
      reimbursement_state TEXT NOT NULL DEFAULT 'none',
      reimbursed_at TEXT,
      reimburse_target_minor INTEGER,
      include_in_budget INTEGER NOT NULL DEFAULT 1,
      include_in_analysis INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
  `)
  return db
}

function seedBase(db, { ledgerId = 'led1', accountId = 'acc_settle', categoryId = 'cat_pnl', securityId = 'sec1' } = {}) {
  db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', [ledgerId, '個人'])
  db.run(
    'INSERT INTO accounts (ledger_id, id, name, account_type, is_settlement) VALUES (?, ?, ?, ?, 1);',
    [ledgerId, accountId, '券商交割', 'asset'],
  )
  db.run(
    'INSERT INTO categories (ledger_id, id, name, system_key) VALUES (?, ?, ?, ?);',
    [ledgerId, categoryId, '投資損益', 'investment_pnl'],
  )
  db.run(
    `INSERT INTO securities (ledger_id, id, symbol, name, asset_class, settlement_account_id, deleted_at)
     VALUES (?, ?, ?, ?, 'stock', ?, NULL);`,
    [ledgerId, securityId, '2330', '台積電', accountId],
  )
  return { ledgerId, accountId, categoryId, securityId }
}

function insertScheduledFundsTx(db, {
  ledgerId,
  securityId,
  id,
  type,
  principalMinor,
  proceedsMinor = 0,
  settleAt,
}) {
  const now = '2026-08-01T02:00:00.000Z'
  db.run(
    `INSERT INTO security_transactions (
      ledger_id, id, security_id, type, occurred_at, quantity, price_minor, fee_minor,
      fee_mode, record_mode, principal_minor, proceeds_minor, settle_at, settlement_status,
      confirmed_at, cash_account_id, cash_principal_tx_id, cash_pnl_tx_id, note,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'into_cost', 'funds', ?, ?, ?, 'scheduled',
      NULL, NULL, NULL, NULL, NULL, ?, ?, NULL);`,
    [ledgerId, id, securityId, type, now, principalMinor, proceedsMinor, settleAt, now, now],
  )
}

function readSecurityTx(db, ledgerId, id) {
  const res = db.exec(
    `SELECT settlement_status, cash_principal_tx_id, cash_pnl_tx_id, confirmed_at
       FROM security_transactions WHERE ledger_id = '${ledgerId}' AND id = '${id}';`,
  )
  if (!res[0]) return null
  const row = res[0].values[0]
  return {
    settlement_status: row[0],
    cash_principal_tx_id: row[1],
    cash_pnl_tx_id: row[2],
    confirmed_at: row[3],
  }
}

function readLedgerRows(db, ledgerId) {
  const res = db.exec(
    `SELECT id, type, amount_minor, include_in_analysis, deleted_at, category_id, note
       FROM transactions WHERE ledger_id = '${ledgerId}' ORDER BY id;`,
  )
  if (!res[0]) return []
  return res[0].values.map((row) => ({
    id: row[0],
    type: row[1],
    amount_minor: row[2],
    include_in_analysis: row[3],
    deleted_at: row[4],
    category_id: row[5],
    note: row[6],
  }))
}

function confirmDueOnDb(db, {
  ledgerId,
  security,
  securityTx,
  categoryId,
  afterPrincipal = null,
}) {
  assert.equal(isSettlementDue(securityTx.settle_at, new Date('2026-08-13T12:00:00')), true)
  const plan = buildConfirmSettlementPlan({
    ledgerId,
    security,
    securityTx,
    investmentPnlCategoryId: categoryId,
    principalTxId: `tx_prin_${securityTx.id}`,
    pnlTxId: `tx_pnl_${securityTx.id}`,
    confirmedAt: '2026-08-13T12:00:00.000Z',
  })
  return runAtomicSql(db, () => applyConfirmSettlementPlan(db, {
    ledgerId,
    securityTxId: securityTx.id,
    plan,
    afterPrincipal,
    now: '2026-08-13T12:00:00.000Z',
  }))
}

test('sql.js: due confirm buy 300 posts only principal adjustment (不計收支)', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-11T02:00:00.000Z' // due before 2026-08-13
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_buy',
    type: 'buy',
    principalMinor: 30000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_buy',
    type: 'buy',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 0,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }

  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })

  const stx = readSecurityTx(db, ids.ledgerId, 'stx_buy')
  assert.equal(stx.settlement_status, 'confirmed')
  assert.equal(stx.cash_principal_tx_id, 'tx_prin_stx_buy')
  assert.equal(stx.cash_pnl_tx_id, null)

  const rows = readLedgerRows(db, ids.ledgerId)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].type, 'adjustment')
  assert.equal(rows[0].amount_minor, -30000)
  assert.equal(rows[0].include_in_analysis, 0)
  db.close()
})

test('sql.js: due confirm sell 300→320 posts principal + income 20', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_sell_p',
    type: 'sell',
    principalMinor: 30000,
    proceedsMinor: 32000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_sell_p',
    type: 'sell',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 32000,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }

  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })

  const rows = readLedgerRows(db, ids.ledgerId)
  assert.equal(rows.length, 2)
  const principal = rows.find((r) => r.type === 'adjustment')
  const pnl = rows.find((r) => r.type === 'income')
  assert.equal(principal.amount_minor, 30000)
  assert.equal(principal.include_in_analysis, 0)
  assert.equal(pnl.amount_minor, 2000)
  assert.equal(pnl.include_in_analysis, 1)
  assert.equal(pnl.category_id, ids.categoryId)
  assert.equal(principal.amount_minor + pnl.amount_minor, 32000)

  const stx = readSecurityTx(db, ids.ledgerId, 'stx_sell_p')
  assert.equal(stx.settlement_status, 'confirmed')
  assert.ok(stx.cash_principal_tx_id)
  assert.ok(stx.cash_pnl_tx_id)
  db.close()
})

test('sql.js: due confirm sell 300→280 posts principal + expense 20', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_sell_l',
    type: 'sell',
    principalMinor: 30000,
    proceedsMinor: 28000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_sell_l',
    type: 'sell',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 28000,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }

  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })

  const rows = readLedgerRows(db, ids.ledgerId)
  assert.equal(rows.length, 2)
  const principal = rows.find((r) => r.type === 'adjustment')
  const pnl = rows.find((r) => r.type === 'expense')
  assert.equal(principal.amount_minor, 30000)
  assert.equal(principal.include_in_analysis, 0)
  assert.equal(pnl.amount_minor, -2000)
  assert.equal(pnl.include_in_analysis, 1)
  assert.equal(principal.amount_minor + pnl.amount_minor, 28000)
  db.close()
})

test('sql.js: mid-confirm failure rolls back principal + leaves scheduled', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_fail',
    type: 'sell',
    principalMinor: 30000,
    proceedsMinor: 32000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_fail',
    type: 'sell',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 32000,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }

  assert.throws(
    () => confirmDueOnDb(db, {
      ledgerId: ids.ledgerId,
      security,
      securityTx,
      categoryId: ids.categoryId,
      afterPrincipal: () => {
        throw new Error('injected failure after principal leg')
      },
    }),
    /injected failure after principal leg/,
  )

  assert.deepEqual(readLedgerRows(db, ids.ledgerId), [])
  const stx = readSecurityTx(db, ids.ledgerId, 'stx_fail')
  assert.equal(stx.settlement_status, 'scheduled')
  assert.equal(stx.cash_principal_tx_id, null)
  assert.equal(stx.cash_pnl_tx_id, null)
  db.close()
})

test('sql.js: cancel confirmed atomically soft-deletes cash legs + status cancelled', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_cancel',
    type: 'sell',
    principalMinor: 30000,
    proceedsMinor: 32000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_cancel',
    type: 'sell',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 32000,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }
  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })
  const confirmed = readSecurityTx(db, ids.ledgerId, 'stx_cancel')

  const cancelPlan = buildCancelSettlementPlan({
    settlement_status: 'confirmed',
    cash_principal_tx_id: confirmed.cash_principal_tx_id,
    cash_pnl_tx_id: confirmed.cash_pnl_tx_id,
  })

  assert.throws(
    () => runAtomicSql(db, () => applyCancelSettlementPlan(db, {
      ledgerId: ids.ledgerId,
      securityTxId: 'stx_cancel',
      plan: cancelPlan,
      afterSoftDelete: () => {
        throw new Error('injected failure after soft-delete')
      },
      now: '2026-08-13T13:00:00.000Z',
    })),
    /injected failure after soft-delete/,
  )

  // Failure after soft-delete must roll back → legs still live, status still confirmed
  const afterFail = readSecurityTx(db, ids.ledgerId, 'stx_cancel')
  assert.equal(afterFail.settlement_status, 'confirmed')
  const live = readLedgerRows(db, ids.ledgerId).filter((r) => !r.deleted_at)
  assert.equal(live.length, 2)

  runAtomicSql(db, () => applyCancelSettlementPlan(db, {
    ledgerId: ids.ledgerId,
    securityTxId: 'stx_cancel',
    plan: cancelPlan,
    now: '2026-08-13T13:00:00.000Z',
  }))

  const cancelled = readSecurityTx(db, ids.ledgerId, 'stx_cancel')
  assert.equal(cancelled.settlement_status, 'cancelled')
  assert.equal(cancelled.cash_principal_tx_id, null)
  assert.equal(cancelled.cash_pnl_tx_id, null)
  const all = readLedgerRows(db, ids.ledgerId)
  assert.equal(all.length, 2)
  assert.ok(all.every((r) => r.deleted_at))
  db.close()
})

function softDeleteSecurityTx(db, ledgerId, id, deletedAt = '2026-08-13T14:00:00.000Z') {
  db.run(
    `UPDATE security_transactions
        SET deleted_at = ?, updated_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [deletedAt, deletedAt, ledgerId, id],
  )
}

function softDeleteSecurity(db, ledgerId, id, deletedAt = '2026-08-13T14:00:00.000Z') {
  db.run(
    `UPDATE securities
        SET deleted_at = ?
      WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [deletedAt, ledgerId, id],
  )
}

function readSecurityLive(db, ledgerId, id) {
  const res = db.exec(
    `SELECT deleted_at FROM securities WHERE ledger_id = '${ledgerId}' AND id = '${id}';`,
  )
  if (!res[0]) return null
  return { deleted_at: res[0].values[0][0] }
}

function readSecurityTxLive(db, ledgerId, id) {
  const res = db.exec(
    `SELECT settlement_status, deleted_at, cash_principal_tx_id, cash_pnl_tx_id
       FROM security_transactions WHERE ledger_id = '${ledgerId}' AND id = '${id}';`,
  )
  if (!res[0]) return null
  const row = res[0].values[0]
  return {
    settlement_status: row[0],
    deleted_at: row[1],
    cash_principal_tx_id: row[2],
    cash_pnl_tx_id: row[3],
  }
}

test('sql.js: delete confirmed transaction rolls back cash+soft-delete atomically on failure', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_del',
    type: 'sell',
    principalMinor: 30000,
    proceedsMinor: 32000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_del',
    type: 'sell',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 32000,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }
  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })
  const confirmed = readSecurityTx(db, ids.ledgerId, 'stx_del')
  const cancelPlan = buildCancelSettlementPlan({
    settlement_status: 'confirmed',
    cash_principal_tx_id: confirmed.cash_principal_tx_id,
    cash_pnl_tx_id: confirmed.cash_pnl_tx_id,
  })

  assert.throws(
    () => runAtomicSql(db, () => {
      applyCancelSettlementPlan(db, {
        ledgerId: ids.ledgerId,
        securityTxId: 'stx_del',
        plan: cancelPlan,
        now: '2026-08-13T14:00:00.000Z',
      })
      softDeleteSecurityTx(db, ids.ledgerId, 'stx_del')
      throw new Error('injected failure after delete tx cascade')
    }),
    /injected failure after delete tx cascade/,
  )

  const afterFail = readSecurityTxLive(db, ids.ledgerId, 'stx_del')
  assert.equal(afterFail.settlement_status, 'confirmed')
  assert.equal(afterFail.deleted_at, null)
  const live = readLedgerRows(db, ids.ledgerId).filter((r) => !r.deleted_at)
  assert.equal(live.length, 2)

  runAtomicSql(db, () => {
    applyCancelSettlementPlan(db, {
      ledgerId: ids.ledgerId,
      securityTxId: 'stx_del',
      plan: cancelPlan,
      now: '2026-08-13T14:00:00.000Z',
    })
    softDeleteSecurityTx(db, ids.ledgerId, 'stx_del')
  })

  const deleted = readSecurityTxLive(db, ids.ledgerId, 'stx_del')
  assert.ok(deleted.deleted_at)
  assert.equal(deleted.settlement_status, 'cancelled')
  assert.ok(readLedgerRows(db, ids.ledgerId).every((r) => r.deleted_at))
  db.close()
})

test('sql.js: delete security with confirmed legs rolls back atomically on mid-failure', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  // openSettlementDb securities table needs deleted_at already — seed uses NULL
  const ids = seedBase(db)
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_sec_del',
    type: 'buy',
    principalMinor: 30000,
    settleAt,
  })
  const security = { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId }
  const securityTx = {
    id: 'stx_sec_del',
    type: 'buy',
    record_mode: 'funds',
    quantity: 0,
    price_minor: 0,
    fee_minor: 0,
    fee_mode: 'into_cost',
    principal_minor: 30000,
    proceeds_minor: 0,
    settle_at: settleAt,
    cash_account_id: ids.accountId,
  }
  confirmDueOnDb(db, { ledgerId: ids.ledgerId, security, securityTx, categoryId: ids.categoryId })
  const confirmed = readSecurityTx(db, ids.ledgerId, 'stx_sec_del')
  const cancelPlan = buildCancelSettlementPlan({
    settlement_status: 'confirmed',
    cash_principal_tx_id: confirmed.cash_principal_tx_id,
    cash_pnl_tx_id: confirmed.cash_pnl_tx_id,
  })

  assert.throws(
    () => runAtomicSql(db, () => {
      applyCancelSettlementPlan(db, {
        ledgerId: ids.ledgerId,
        securityTxId: 'stx_sec_del',
        plan: cancelPlan,
        now: '2026-08-13T14:00:00.000Z',
      })
      softDeleteSecurityTx(db, ids.ledgerId, 'stx_sec_del')
      throw new Error('injected failure before security soft-delete')
    }),
    /injected failure before security soft-delete/,
  )

  assert.equal(readSecurityLive(db, ids.ledgerId, ids.securityId).deleted_at, null)
  assert.equal(readSecurityTxLive(db, ids.ledgerId, 'stx_sec_del').deleted_at, null)
  assert.equal(readSecurityTxLive(db, ids.ledgerId, 'stx_sec_del').settlement_status, 'confirmed')
  assert.equal(readLedgerRows(db, ids.ledgerId).filter((r) => !r.deleted_at).length, 1)

  runAtomicSql(db, () => {
    applyCancelSettlementPlan(db, {
      ledgerId: ids.ledgerId,
      securityTxId: 'stx_sec_del',
      plan: cancelPlan,
      now: '2026-08-13T14:00:00.000Z',
    })
    softDeleteSecurityTx(db, ids.ledgerId, 'stx_sec_del')
    softDeleteSecurity(db, ids.ledgerId, ids.securityId)
  })

  assert.ok(readSecurityLive(db, ids.ledgerId, ids.securityId).deleted_at)
  assert.ok(readSecurityTxLive(db, ids.ledgerId, 'stx_sec_del').deleted_at)
  assert.ok(readLedgerRows(db, ids.ledgerId).every((r) => r.deleted_at))
  db.close()
})

test('sql.js: two settlement accounts same symbol confirm independently', async () => {
  const SQL = await initSqlJs()
  const db = openSettlementDb(SQL)
  const ids = seedBase(db)
  db.run(
    'INSERT INTO accounts (ledger_id, id, name, account_type, is_settlement) VALUES (?, ?, ?, ?, 1);',
    [ids.ledgerId, 'acc_settle_b', '券商交割B', 'asset'],
  )
  db.run(
    `INSERT INTO securities (ledger_id, id, symbol, name, asset_class, settlement_account_id, deleted_at)
     VALUES (?, ?, ?, ?, 'stock', ?, NULL);`,
    [ids.ledgerId, 'sec2', '2330', '台積電-B', 'acc_settle_b'],
  )
  const settleAt = '2026-08-10T02:00:00.000Z'
  insertScheduledFundsTx(db, {
    ...ids,
    id: 'stx_a',
    type: 'buy',
    principalMinor: 30000,
    settleAt,
  })
  insertScheduledFundsTx(db, {
    ledgerId: ids.ledgerId,
    securityId: 'sec2',
    id: 'stx_b',
    type: 'buy',
    principalMinor: 50000,
    settleAt,
  })

  confirmDueOnDb(db, {
    ledgerId: ids.ledgerId,
    security: { id: ids.securityId, symbol: '2330', settlement_account_id: ids.accountId },
    securityTx: {
      id: 'stx_a',
      type: 'buy',
      record_mode: 'funds',
      quantity: 0,
      price_minor: 0,
      fee_minor: 0,
      fee_mode: 'into_cost',
      principal_minor: 30000,
      proceeds_minor: 0,
      settle_at: settleAt,
      cash_account_id: ids.accountId,
    },
    categoryId: ids.categoryId,
  })
  confirmDueOnDb(db, {
    ledgerId: ids.ledgerId,
    security: { id: 'sec2', symbol: '2330', settlement_account_id: 'acc_settle_b' },
    securityTx: {
      id: 'stx_b',
      type: 'buy',
      record_mode: 'funds',
      quantity: 0,
      price_minor: 0,
      fee_minor: 0,
      fee_mode: 'into_cost',
      principal_minor: 50000,
      proceeds_minor: 0,
      settle_at: settleAt,
      cash_account_id: 'acc_settle_b',
    },
    categoryId: ids.categoryId,
  })

  const rows = readLedgerRows(db, ids.ledgerId)
  assert.equal(rows.length, 2)
  assert.equal(rows.find((r) => r.amount_minor === -30000)?.type, 'adjustment')
  assert.equal(rows.find((r) => r.amount_minor === -50000)?.type, 'adjustment')
  assert.equal(readSecurityTx(db, ids.ledgerId, 'stx_a').settlement_status, 'confirmed')
  assert.equal(readSecurityTx(db, ids.ledgerId, 'stx_b').settlement_status, 'confirmed')
  db.close()
})

test('sqlite withTransaction is real BEGIN/COMMIT and settlement service uses it', () => {
  const sqlite = readFileSync(resolve(root, 'src/core/db/sqlite.js'), 'utf8')
  const service = readFileSync(resolve(root, 'src/core/services/security.service.js'), 'utf8')
  const detail = readFileSync(resolve(root, 'src/ui/views/securities/SecurityDetailPage.vue'), 'utf8')
  const apply = readFileSync(resolve(root, 'src/core/utils/securities-settlement-apply.js'), 'utf8')

  assert.match(sqlite, /beginTransaction/)
  assert.match(sqlite, /commitTransaction/)
  assert.match(sqlite, /rollbackTransaction/)
  assert.match(sqlite, /sharedSqliteWriteQueue/)
  assert.match(sqlite, /createTransactionContext/)
  assert.match(sqlite, /isInsideOwnedTransaction|joinOuter \? false : true/)
  assert.doesNotMatch(sqlite, /let activeTransactionDepth/)
  assert.doesNotMatch(sqlite, /This helper currently serves only as a logical grouping boundary/)

  assert.match(service, /buildConfirmSettlementPlan/)
  assert.match(service, /buildCancelSettlementPlan/)
  assert.match(service, /withTransaction\(async \(\) => \{[\s\S]*postCashLegsFromPlan/)
  assert.match(service, /withTransaction\(async \(\) => \{[\s\S]*buildCancelSettlementPlan/)
  assert.match(service, /withTransaction\(async \(\) => \{[\s\S]*softDeleteSecurityTransaction/)
  assert.match(service, /export async function removeSecurity\([\s\S]*withTransaction\(async \(\) => \{[\s\S]*rollbackCashLegs/)

  assert.match(apply, /runAtomicSql/)
  assert.match(apply, /afterPrincipal/)

  assert.match(detail, /securities-edit-symbol/)
  assert.match(detail, /securities-edit-name/)
  assert.match(detail, /profileForm\.assetClass/)
  assert.match(detail, /assetClass:/)
})
