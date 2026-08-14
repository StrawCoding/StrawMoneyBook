/**
 * Serializes OUTER SQLite transactions only (ART-02 / Plan v2 §3).
 * Nested work joins via TransactionContext, never by racing on a global depth counter.
 */
export class SqliteWriteQueue {
  constructor() {
    /** @type {Promise<void>} */
    this._tail = Promise.resolve()
    this._pending = 0
  }

  get pendingCount() {
    return this._pending
  }

  /**
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  enqueue(task) {
    this._pending += 1
    const run = this._tail.then(() => task())
    // Keep the chain alive after reject so later outers still run.
    this._tail = run.then(
      () => {
        this._pending = Math.max(0, this._pending - 1)
      },
      () => {
        this._pending = Math.max(0, this._pending - 1)
      },
    )
    return run
  }
}

export const sharedSqliteWriteQueue = new SqliteWriteQueue()
