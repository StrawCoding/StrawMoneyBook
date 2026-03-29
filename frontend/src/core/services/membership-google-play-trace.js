function clonePlayCallTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: String(entry.id ?? ''),
    operation: String(entry.operation ?? ''),
    startedAt: String(entry.startedAt ?? ''),
    endedAt: String(entry.endedAt ?? ''),
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : null,
    status: String(entry.status ?? ''),
    errorCode: String(entry.errorCode ?? ''),
    errorMessage: String(entry.errorMessage ?? ''),
  }
}

export function createGooglePlayTraceStore({ maxEntries = 60 } = {}) {
  const listeners = new Set()
  let seq = 0
  let entries = []
  let executionQueue = Promise.resolve()

  function trimEntries() {
    if (entries.length <= maxEntries) return
    entries = entries.slice(0, maxEntries)
  }

  function getSnapshot() {
    return entries
      .map(clonePlayCallTraceEntry)
      .filter(Boolean)
  }

  function notifyListeners() {
    if (!listeners.size) return
    const snapshot = getSnapshot()
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch (_error) {
        // Ignore listener errors to avoid breaking membership flow.
      }
    }
  }

  function begin(operation) {
    const nowMs = Date.now()
    const entry = {
      id: `play_call_${nowMs}_${seq++}`,
      operation: String(operation ?? '').trim() || 'unknown',
      startedAt: new Date(nowMs).toISOString(),
      endedAt: '',
      durationMs: null,
      status: 'running',
      errorCode: '',
      errorMessage: '',
    }

    entries = [entry, ...entries]
    trimEntries()
    notifyListeners()
    return {
      entry,
      startedAtMs: nowMs,
    }
  }

  function end(context, { status, error = null } = {}) {
    if (!context?.entry) return

    const endedAtMs = Date.now()
    context.entry.endedAt = new Date(endedAtMs).toISOString()
    context.entry.durationMs = Math.max(0, endedAtMs - Number(context.startedAtMs || endedAtMs))
    context.entry.status = status === 'ok' ? 'ok' : 'error'

    if (context.entry.status === 'error') {
      context.entry.errorCode = String(error?.code ?? '').trim().toUpperCase()
      context.entry.errorMessage = String(error?.message ?? error ?? '').trim()
    } else {
      context.entry.errorCode = ''
      context.entry.errorMessage = ''
    }

    notifyListeners()
  }

  async function trace(operation, task) {
    const run = async () => {
      const context = begin(operation)
      try {
        const result = await task()
        end(context, { status: 'ok' })
        return result
      } catch (error) {
        end(context, { status: 'error', error })
        throw error
      }
    }

    const currentRun = executionQueue.then(run, run)
    executionQueue = currentRun.catch(() => undefined)
    return currentRun
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') {
      return () => {}
    }

    listeners.add(listener)
    if (emitCurrent) {
      try {
        listener(getSnapshot())
      } catch (_error) {
        // Ignore listener errors to avoid breaking subscription flow.
      }
    }

    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getSnapshot,
    subscribe,
    trace,
  }
}
