import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createBackgroundWorkQueue } from '../src/ui/services/background-work-queue.service.js'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(resolve(root, rel), 'utf8')

test('background work queue runs jobs serially (not all at once)', async () => {
  const queue = createBackgroundWorkQueue({ idleTimeoutMs: 0 })
  const order = []
  const firstGate = { release: null }
  const firstStarted = new Promise((resolve) => {
    firstGate.release = resolve
  })

  const first = queue.enqueue('job-a', async () => {
    order.push('a-start')
    await firstStarted
    order.push('a-end')
    return 'a'
  })
  const second = queue.enqueue('job-b', async () => {
    order.push('b')
    return 'b'
  })

  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(order, ['a-start'], 'second job must wait until first completes')
  firstGate.release()
  assert.equal(await first, 'a')
  assert.equal(await second, 'b')
  assert.deepEqual(order, ['a-start', 'a-end', 'b'])
})

test('background work queue coalesces duplicate named jobs', async () => {
  const queue = createBackgroundWorkQueue({ idleTimeoutMs: 0 })
  let runs = 0
  const slow = async () => {
    runs += 1
    await new Promise((r) => setTimeout(r, 25))
    return runs
  }
  const a = queue.enqueue('same', slow)
  const b = queue.enqueue('same', slow)
  assert.equal(a, b)
  await Promise.all([a, b])
  assert.equal(runs, 1)
})

test('app-runtime routes foreground sync through background work queue', () => {
  const appRuntime = read('src/ui/services/app-runtime.service.js')
  assert.match(appRuntime, /background-work-queue\.service\.js/)
  assert.match(appRuntime, /enqueueAppForegroundSyncBatch/)
  assert.match(appRuntime, /enqueueBankSyncAutoRefresh/)
})

test('carrier auto refresh yields and uses runtime job coalesce', () => {
  const source = read('src/services/einvoice/carrier-sync.service.js')
  assert.match(source, /yieldToMainThread/)
  assert.match(source, /runtimeJobs\.run\(`carrier-auto-refresh:/)
})
