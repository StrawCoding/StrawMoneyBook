function normalizeProductDisplay(display) {
  if (!display || typeof display !== 'object') {
    return {
      monthly: null,
      lifetime: null,
    }
  }
  return {
    monthly: display.monthly ?? null,
    lifetime: display.lifetime ?? null,
  }
}

function getEmptyProductDisplay() {
  return {
    monthly: null,
    lifetime: null,
  }
}

export function createMembershipProductDisplayStore({
  cacheTtlMs = 10 * 60 * 1000,
} = {}) {
  let cache = getEmptyProductDisplay()
  let cachedAt = 0
  let inFlight = null

  function setCache(display) {
    cache = normalizeProductDisplay(display)
    cachedAt = Date.now()
    return cache
  }

  function hasCache() {
    return cachedAt > 0
  }

  function isFresh(nowMs = Date.now()) {
    if (!hasCache()) return false
    return nowMs - cachedAt <= cacheTtlMs
  }

  function getSnapshot() {
    if (!hasCache()) {
      return getEmptyProductDisplay()
    }
    return cache
  }

  function clearInFlight() {
    inFlight = null
  }

  async function fetchDisplay({
    force = false,
    ensureSupported,
    loadDisplay,
    onFetchError,
  } = {}) {
    let supported = await ensureSupported({ forceRefresh: force })
    if (!supported && !force) {
      supported = await ensureSupported({ forceRefresh: true })
    }
    if (!supported) {
      return getEmptyProductDisplay()
    }

    if (!force && isFresh()) {
      return cache
    }

    if (inFlight) {
      return inFlight
    }

    inFlight = Promise.resolve()
      .then(() => loadDisplay())
      .then((display) => setCache(display))
      .catch((error) => {
        onFetchError?.(error)
        if (hasCache()) {
          return cache
        }
        return getEmptyProductDisplay()
      })
      .finally(clearInFlight)

    return inFlight
  }

  return {
    fetchDisplay,
    getEmptyProductDisplay,
    getSnapshot,
    hasCache,
    isFresh,
    setCache,
  }
}
