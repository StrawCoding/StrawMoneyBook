/**
 * ART-01 Layer B+G — SqliteWriteQueue / TransactionContext unit + concurrency.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTransactionContext,
  getActiveTransactionContext,
  runWithTransactionContext,
  __resetTransactionContextForTests,
} from '../src/core/db/sqlite-tx-context.js'
import { SqliteWriteQueue } from '../src/core/db/sqlite-write-queue.js'

test('SqliteWriteQueue serializes outer tasks FIFO', async () => {
  const queue = new SqliteWriteQueue()
  const order = []

  const a = queue.enqueue(async () => {
    order.push('a-start')
    await new Promise((r) => setTimeout(r, 30))
    order.push('a-end')
    return 'A'
  })
  const b = queue.enqueue(async () => {
    order.push('b-start')
    await new Promise((r) => setTimeout(r, 5))
    order.push('b-end')
    return 'B'
  })

  const [ra, rb] = await Promise.all([a, b])
  assert.equal(ra, 'A')
  assert.equal(rb, 'B')
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end'])
})

test('SqliteWriteQueue continues after a rejected task', async () => {
  const queue = new SqliteWriteQueue()
  const a = queue.enqueue(async () => {
    throw new Error('boom')
  })
  const b = queue.enqueue(async () => 'ok')
  await assert.rejects(a, /boom/)
  assert.equal(await b, 'ok')
})

test('TransactionContext ownership: nested inherits same id; concurrent outers get distinct ids', async () => {
  __resetTransactionContextForTests()
  const queue = new SqliteWriteQueue()
  const seen = []

  async function outerWork(label) {
    return queue.enqueue(async () => {
      const ctx = createTransactionContext()
      ctx.depth = 1
      return runWithTransactionContext(ctx, async () => {
        seen.push({ label, phase: 'outer', id: ctx.id })
        const nested = getActiveTransactionContext()
        assert.equal(nested?.id, ctx.id)
        nested.depth += 1
        try {
          seen.push({ label, phase: 'nested', id: nested.id })
        } finally {
          nested.depth -= 1
        }
        await new Promise((r) => setTimeout(r, 10))
        return ctx.id
      })
    })
  }

  const [idA, idB] = await Promise.all([outerWork('A'), outerWork('B')])
  assert.notEqual(idA, idB)
  const aOuter = seen.find((s) => s.label === 'A' && s.phase === 'outer')
  const aNested = seen.find((s) => s.label === 'A' && s.phase === 'nested')
  assert.equal(aOuter.id, aNested.id)
})

test('without active context, a new outer never joins another context id', async () => {
  __resetTransactionContextForTests()
  const queue = new SqliteWriteQueue()
  let midA = null

  const a = queue.enqueue(async () => {
    const ctx = createTransactionContext()
    return runWithTransactionContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 20))
      midA = getActiveTransactionContext()?.id
      return ctx.id
    })
  })

  // B starts while A is in-flight but must wait on queue — never see A's context.
  const b = queue.enqueue(async () => {
    assert.equal(getActiveTransactionContext(), null)
    const ctx = createTransactionContext()
    return runWithTransactionContext(ctx, async () => {
      assert.notEqual(getActiveTransactionContext()?.id, midA)
      return ctx.id
    })
  })

  const [idA, idB] = await Promise.all([a, b])
  assert.notEqual(idA, idB)
  assert.ok(midA)
  assert.equal(midA, idA)
})
