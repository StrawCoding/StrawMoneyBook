/**
 * ART-01/02 harness: sql.js-backed txn wrapper mirroring product SqliteWriteQueue + TxContext.
 * Used by node tests that cannot load Capacitor SQLite.
 */
import {
  createTransactionContext,
  getActiveTransactionContext,
  runWithTransactionContext,
  __resetTransactionContextForTests,
} from '../../src/core/db/sqlite-tx-context.js'
import { SqliteWriteQueue } from '../../src/core/db/sqlite-write-queue.js'

/**
 * Legacy (pre-ART-02) semantics: module-level depth. Concurrent outers can join the same BEGIN.
 * Kept only to characterize the STAB-01 race in tests.
 */
export function createLegacyDepthTxn(db) {
  let activeTransactionDepth = 0

  async function withTransaction(handler) {
    const isOutermost = activeTransactionDepth === 0
    if (isOutermost) {
      db.run('BEGIN')
    }
    activeTransactionDepth += 1
    try {
      const result = await handler()
      if (isOutermost) {
        db.run('COMMIT')
      }
      return result
    } catch (error) {
      if (isOutermost) {
        try {
          db.run('ROLLBACK')
        } catch {
          // ignore
        }
      }
      throw error
    } finally {
      activeTransactionDepth = Math.max(0, activeTransactionDepth - 1)
    }
  }

  return {
    withTransaction,
    getDepth: () => activeTransactionDepth,
    run(sql, params = []) {
      db.run(sql, params)
    },
    get(sql, params = []) {
      const stmt = db.prepare(sql)
      try {
        stmt.bind(params)
        if (stmt.step()) return stmt.getAsObject()
        return undefined
      } finally {
        stmt.free()
      }
    },
    all(sql, params = []) {
      const stmt = db.prepare(sql)
      const rows = []
      try {
        stmt.bind(params)
        while (stmt.step()) rows.push(stmt.getAsObject())
        return rows
      } finally {
        stmt.free()
      }
    },
  }
}

/**
 * Spec-correct wrapper: outer queue + TransactionContext ownership.
 */
export function createQueuedTxn(db, queue = new SqliteWriteQueue()) {
  async function withTransaction(handler) {
    const existing = getActiveTransactionContext()
    if (existing && existing.status === 'open') {
      existing.depth += 1
      try {
        return await handler(existing)
      } finally {
        existing.depth = Math.max(0, existing.depth - 1)
      }
    }

    return queue.enqueue(async () => {
      const ctx = createTransactionContext()
      ctx.depth = 1
      db.run('BEGIN')
      try {
        const result = await runWithTransactionContext(ctx, async () => handler(ctx))
        ctx.status = 'committing'
        db.run('COMMIT')
        ctx.status = 'committed'
        return result
      } catch (error) {
        ctx.status = 'rolling_back'
        try {
          db.run('ROLLBACK')
        } catch {
          // ignore
        }
        ctx.status = 'rolled_back'
        throw error
      } finally {
        ctx.depth = 0
      }
    })
  }

  return {
    queue,
    withTransaction,
    resetContext: __resetTransactionContextForTests,
    run(sql, params = []) {
      db.run(sql, params)
    },
    get(sql, params = []) {
      const stmt = db.prepare(sql)
      try {
        stmt.bind(params)
        if (stmt.step()) return stmt.getAsObject()
        return undefined
      } finally {
        stmt.free()
      }
    },
    all(sql, params = []) {
      const stmt = db.prepare(sql)
      const rows = []
      try {
        stmt.bind(params)
        while (stmt.step()) rows.push(stmt.getAsObject())
        return rows
      } finally {
        stmt.free()
      }
    },
  }
}

export function openHarnessSchema(SQL) {
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE kv (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      owner TEXT NOT NULL
    );
  `)
  return db
}
