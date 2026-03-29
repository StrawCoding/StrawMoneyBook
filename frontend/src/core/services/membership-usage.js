export function readAiUsageMap(storage, storageKey) {
  if (!storage) return {}
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_error) {
    return {}
  }
}

export function writeAiUsageMap(storage, storageKey, usageMap) {
  if (!storage) return
  try {
    storage.setItem(storageKey, JSON.stringify(usageMap))
  } catch (_error) {
    // Ignore write failures (e.g. private mode quota).
  }
}

export function normalizeUsageCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

export function getDailyUsage({
  now = new Date(),
  storage = null,
  storageKey,
  toDateKey,
  limit,
} = {}) {
  const dateKey = toDateKey(now) || toDateKey(new Date())
  if (!Number.isFinite(limit)) {
    return {
      dateKey,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit,
    }
  }

  const usageMap = readAiUsageMap(storage, storageKey)
  const used = normalizeUsageCount(usageMap[dateKey])
  return {
    dateKey,
    used,
    remaining: Math.max(0, limit - used),
    limit,
  }
}

export function recordDailyUsage({
  now = new Date(),
  storage = null,
  storageKey,
  toDateKey,
  limit,
} = {}) {
  const usage = getDailyUsage({
    now,
    storage,
    storageKey,
    toDateKey,
    limit,
  })

  if (!Number.isFinite(usage.limit)) return usage

  if (!storage) {
    const used = usage.used + 1
    return {
      ...usage,
      used,
      remaining: Math.max(0, usage.limit - used),
    }
  }

  const usageMap = readAiUsageMap(storage, storageKey)
  usageMap[usage.dateKey] = usage.used + 1
  writeAiUsageMap(storage, storageKey, usageMap)
  return getDailyUsage({
    now,
    storage,
    storageKey,
    toDateKey,
    limit,
  })
}
