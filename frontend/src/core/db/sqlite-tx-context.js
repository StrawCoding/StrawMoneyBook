/**
 * Explicit transaction ownership (ART-02 / Plan v2 §3).
 * Outer withTransaction creates a context; nested calls must inherit the same id/token.
 */

let nextContextSeq = 1

/** @typedef {'open' | 'committing' | 'committed' | 'rolling_back' | 'rolled_back'} TxStatus */

/**
 * @typedef {object} TransactionContext
 * @property {string} id
 * @property {string} token
 * @property {number} depth
 * @property {TxStatus} status
 */

/** @type {TransactionContext | null} */
let activeContext = null

/**
 * @returns {TransactionContext}
 */
export function createTransactionContext() {
  const seq = nextContextSeq++
  return {
    id: `txctx_${seq}_${Date.now().toString(36)}`,
    token: `tok_${seq}_${Math.random().toString(36).slice(2, 10)}`,
    depth: 0,
    status: 'open',
  }
}

/**
 * @returns {TransactionContext | null}
 */
export function getActiveTransactionContext() {
  return activeContext
}

/**
 * @param {TransactionContext | null} ctx
 */
export function setActiveTransactionContext(ctx) {
  activeContext = ctx
}

/**
 * Run `fn` with `ctx` as the active transaction context (supports nested restore).
 * @template T
 * @param {TransactionContext} ctx
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function runWithTransactionContext(ctx, fn) {
  const previous = activeContext
  activeContext = ctx
  try {
    return await fn()
  } finally {
    activeContext = previous
  }
}

export function __resetTransactionContextForTests() {
  activeContext = null
  nextContextSeq = 1
}
