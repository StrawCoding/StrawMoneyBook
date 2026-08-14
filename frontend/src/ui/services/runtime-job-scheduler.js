/**
 * ART-12 — Named runtime job scheduler (coalesce / anti-reentry).
 * Does not cancel mid-flight work; coalesces concurrent same-name jobs onto one promise.
 */

/**
 * @typedef {{ coalesce?: boolean }} RuntimeJobOptions
 */

export function createRuntimeJobScheduler() {
  /** @type {Map<string, Promise<unknown>>} */
  const inflight = new Map()

  /**
   * @template T
   * @param {string} name
   * @param {() => (T | Promise<T>)} fn
   * @param {RuntimeJobOptions} [options]
   * @returns {Promise<T>}
   */
  function run(name, fn, options = {}) {
    const key = String(name ?? '').trim()
    if (!key) {
      return Promise.resolve().then(fn)
    }
    const coalesce = options.coalesce !== false
    if (coalesce && inflight.has(key)) {
      return /** @type {Promise<T>} */ (inflight.get(key))
    }

    const task = Promise.resolve()
      .then(fn)
      .finally(() => {
        if (inflight.get(key) === task) inflight.delete(key)
      })

    inflight.set(key, task)
    return /** @type {Promise<T>} */ (task)
  }

  function isRunning(name) {
    return inflight.has(String(name ?? '').trim())
  }

  function clear() {
    inflight.clear()
  }

  return { run, isRunning, clear }
}
