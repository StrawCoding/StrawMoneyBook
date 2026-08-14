/**
 * ART-01 Layer C+G+F — sql.js integration for transaction isolation.
 * Proves Spec queue+context isolation; characterizes legacy global-depth race.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  createLegacyDepthTxn,
  createQueuedTxn,
  openHarnessSchema,
} from './harness/sqlite-tx-harness.js'
import { __resetTransactionContextForTests } from '../src/core/db/sqlite-tx-context.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

test('product sqlite.js uses WriteQueue + TxContext (no module-level activeTransactionDepth)', () => {
  const sqlite = readFileSync(resolve(root, 'src/core/db/sqlite.js'), 'utf8')
  assert.match(sqlite, /sharedSqliteWriteQueue/)
  assert.match(sqlite, /createTransactionContext/)
  assert.match(sqlite, /runWithTransactionContext/)
  assert.doesNotMatch(sqlite, /let activeTransactionDepth/)
})

test('legacy depth race: concurrent outers can share BEGIN (STAB-01 characterization)', async () => {
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createLegacyDepthTxn(db)

  let aBegan = false
  let bJoinedWhileAOpen = false

  const a = txn.withTransaction(async () => {
    aBegan = true
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['a1', 'A', 'A'])
    await sleep(40)
    // If B joined our BEGIN, rolling back A would also wipe B — checked below via intentional abort path.
    return 'A'
  })

  await sleep(5)
  const b = txn.withTransaction(async () => {
    // Under legacy semantics, depth>0 means B joins A's BEGIN.
    bJoinedWhileAOpen = aBegan && txn.getDepth() > 0
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['b1', 'B', 'B'])
    return 'B'
  })

  await Promise.all([a, b])
  assert.equal(bJoinedWhileAOpen, true, 'legacy harness must demonstrate cross-outer join')

  // Prove contamination via rollback: start A, let B join, abort A → B's row disappears.
  const db2 = openHarnessSchema(SQL)
  const txn2 = createLegacyDepthTxn(db2)
  let sawJoin = false
  const a2 = txn2.withTransaction(async () => {
    txn2.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['a2', 'A', 'A'])
    await sleep(40)
    throw new Error('abort-A')
  })
  await sleep(5)
  const b2 = txn2.withTransaction(async () => {
    sawJoin = txn2.getDepth() > 1 || (txn2.getDepth() === 1 && true)
    // depth is shared; when B runs inside A's open txn, depth >= 1 before B increments... 
    // After B enters, depth is 2 while both "active".
    txn2.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['b2', 'B', 'B'])
    return 'B'
  })

  await assert.rejects(a2, /abort-A/)
  // B may resolve or reject depending on timing after rollback; wait either way.
  try {
    await b2
  } catch {
    // ignore
  }
  const rows = txn2.all('SELECT id, owner FROM kv ORDER BY id')
  // Contaminated rollback: B's write must not survive if it joined A's BEGIN.
  assert.equal(rows.length, 0, 'legacy join causes A rollback to wipe B writes')
  assert.ok(sawJoin)
  db.close()
  db2.close()
})

test('queued: A success / B success — independent rows', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)

  const [ra, rb] = await Promise.all([
    txn.withTransaction(async (ctx) => {
      assert.ok(ctx?.id)
      txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['a', '1', ctx.id])
      await sleep(20)
      return ctx.id
    }),
    txn.withTransaction(async (ctx) => {
      assert.ok(ctx?.id)
      txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['b', '1', ctx.id])
      return ctx.id
    }),
  ])

  assert.notEqual(ra, rb)
  const rows = txn.all('SELECT id, owner FROM kv ORDER BY id')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].owner, ra)
  assert.equal(rows[1].owner, rb)
  db.close()
})

test('queued: A rollback / B success — B row survives', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)

  const a = txn.withTransaction(async (ctx) => {
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['a', '1', ctx.id])
    await sleep(25)
    throw new Error('fail-A')
  })
  const b = txn.withTransaction(async (ctx) => {
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['b', '1', ctx.id])
    return 'B'
  })

  await assert.rejects(a, /fail-A/)
  assert.equal(await b, 'B')
  const rows = txn.all('SELECT id FROM kv ORDER BY id')
  assert.deepEqual(rows.map((r) => r.id), ['b'])
  db.close()
})

test('queued: A success / B rollback — A row survives', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)

  const a = txn.withTransaction(async (ctx) => {
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['a', '1', ctx.id])
    await sleep(25)
    return 'A'
  })
  const b = txn.withTransaction(async (ctx) => {
    txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['b', '1', ctx.id])
    throw new Error('fail-B')
  })

  assert.equal(await a, 'A')
  await assert.rejects(b, /fail-B/)
  const rows = txn.all('SELECT id FROM kv ORDER BY id')
  assert.deepEqual(rows.map((r) => r.id), ['a'])
  db.close()
})

test('queued: nested same context joins; nested throw rolls back outer', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)

  await assert.rejects(
    () =>
      txn.withTransaction(async (outer) => {
        txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['outer', '1', outer.id])
        await txn.withTransaction(async (inner) => {
          assert.equal(inner.id, outer.id)
          txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['inner', '1', inner.id])
          throw new Error('nested-fail')
        })
      }),
    /nested-fail/,
  )

  assert.equal(txn.all('SELECT id FROM kv').length, 0)
  db.close()
})

test('queued: exception mid-nested leaves no partial rows', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)

  await assert.rejects(
    () =>
      txn.withTransaction(async (ctx) => {
        txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['p1', '1', ctx.id])
        await txn.withTransaction(async () => {
          txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', ['p2', '1', ctx.id])
        })
        throw new Error('after-nested')
      }),
    /after-nested/,
  )
  assert.equal(txn.all('SELECT id FROM kv').length, 0)
  db.close()
})

test('queued: 50 concurrent outers serialize without cross-contamination', async () => {
  __resetTransactionContextForTests()
  const SQL = await initSqlJs()
  const db = openHarnessSchema(SQL)
  const txn = createQueuedTxn(db)
  const N = 50

  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      txn.withTransaction(async (ctx) => {
        const id = `row_${i}`
        txn.run('INSERT INTO kv (id, value, owner) VALUES (?, ?, ?)', [id, String(i), ctx.id])
        await sleep(i % 3)
        if (i % 7 === 0) {
          throw new Error(`fail-${i}`)
        }
        return id
      }).then(
        (id) => ({ ok: true, id }),
        (err) => ({ ok: false, message: String(err.message) }),
      ),
    ),
  )

  const okIds = results.filter((r) => r.ok).map((r) => r.id).sort()
  const failCount = results.filter((r) => !r.ok).length
  assert.equal(failCount, Math.floor((N - 1) / 7) + 1)
  const rows = txn.all('SELECT id FROM kv ORDER BY id').map((r) => r.id)
  assert.deepEqual(rows, okIds)
  db.close()
})
