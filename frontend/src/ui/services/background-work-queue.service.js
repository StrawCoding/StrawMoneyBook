/**
 * Serial background work queue: defers heavy jobs until UI idle and yields between steps
 * so bank/carrier sync and SQLite batches do not stall the Capacitor WebView main thread.
 */
import { runtimeJobs } from './runtime-job-scheduler.js'
import { scheduleWhenUiIdle, yieldToMainThread } from '@/core/utils/cooperative-yield'

const DEFAULT_IDLE_TIMEOUT_MS = 2500

/**
 * @typedef {{ idleTimeoutMs?: number, coalesce?: boolean }} EnqueueBackgroundWorkOptions
 */

export function createBackgroundWorkQueue(options = {}) {
  const defaultIdleTimeoutMs = Math.max(
    0,
    Number(options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS,
  )

  /** @type {Array<{ name: string, fn: () => unknown, idleTimeoutMs: number, resolve: (v: unknown) => void, reject: (e: unknown) => void }>} */
  const pending = []
  /** @type {Map<string, Promise<unknown>>} */
  const promiseByName = new Map()
  let draining = false

  function isQueued(name) {
    const key = String(name ?? '').trim()
    if (!key) return false
    return promiseByName.has(key)
  }

  /**
   * @template T
   * @param {string} name
   * @param {() => (T | Promise<T>)} fn
   * @param {EnqueueBackgroundWorkOptions} [jobOptions]
   * @returns {Promise<T>}
   */
  function enqueue(name, fn, jobOptions = {}) {
    const key = String(name ?? '').trim()
    const coalesce = jobOptions.coalesce !== false
    if (coalesce && key && promiseByName.has(key)) {
      return /** @type {Promise<T>} */ (promiseByName.get(key))
    }

    const idleTimeoutMs = Math.max(
      0,
      Number(jobOptions.idleTimeoutMs ?? defaultIdleTimeoutMs) || defaultIdleTimeoutMs,
    )

    /** @type {Promise<T>} */
    const outer = new Promise((resolve, reject) => {
      pending.push({
        name: key || `anonymous:${Date.now()}:${pending.length}`,
        fn,
        idleTimeoutMs,
        resolve: /** @type {(v: unknown) => void} */ (resolve),
        reject,
      })
    })

    if (key) {
      promiseByName.set(key, outer)
      outer.finally(() => {
        if (promiseByName.get(key) === outer) {
          promiseByName.delete(key)
        }
      })
    }

    void drain()
    return outer
  }

  async function drain() {
    if (draining) return
    draining = true
    try {
      while (pending.length > 0) {
        const item = pending.shift()
        if (!item) continue
        try {
          await scheduleWhenUiIdle(item.idleTimeoutMs)
          await yieldToMainThread()
          const runFn = () => Promise.resolve().then(item.fn)
          const result = item.name.startsWith('anonymous:')
            ? await runFn()
            : await runtimeJobs.run(item.name, runFn)
          item.resolve(result)
        } catch (error) {
          item.reject(error)
        }
        await yieldToMainThread()
      }
    } finally {
      draining = false
      if (pending.length > 0) {
        void drain()
      }
    }
  }

  function clearForTest() {
    pending.length = 0
    promiseByName.clear()
    draining = false
  }

  return { enqueue, isQueued, clearForTest }
}

/** Shared queue for app resume, auto sync, and other deferred maintenance. */
export const backgroundWorkQueue = createBackgroundWorkQueue()
