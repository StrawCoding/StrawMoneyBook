function defaultShouldIncludeTransaction() {
  return true
}

function effectiveTransactionAmountMinor(tx) {
  const amount = Math.round(Number(tx?.amount_minor ?? 0))
  if (!Number.isFinite(amount) || amount === 0) return 0
  const deducted = Math.round(Number(tx?.refund_deducted_minor ?? 0))
  if (!Number.isFinite(deducted) || deducted <= 0) return amount
  const remaining = Math.max(0, Math.abs(amount) - deducted)
  return amount < 0 ? remaining * -1 : remaining
}

export const ADDON_BREAKDOWN_ID_PREFIX = '__addon__:'
const ADDON_NOTE_PREFIX = '【附加項目】'

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function addonBreakdownId(label) {
  return `${ADDON_BREAKDOWN_ID_PREFIX}${encodeURIComponent(label)}`
}

export function isAddonBreakdownId(id) {
  return String(id ?? '').startsWith(ADDON_BREAKDOWN_ID_PREFIX)
}

export function addonLabelFromBreakdownId(id) {
  if (!isAddonBreakdownId(id)) return ''
  try {
    return decodeURIComponent(String(id).slice(ADDON_BREAKDOWN_ID_PREFIX.length))
  } catch {
    return String(id).slice(ADDON_BREAKDOWN_ID_PREFIX.length)
  }
}

function parseAddonItemsFromNote(note) {
  const summaryLine = String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(ADDON_NOTE_PREFIX))
  if (!summaryLine) return []

  return summaryLine
    .slice(ADDON_NOTE_PREFIX.length)
    .trim()
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((segment) => {
      const matched = segment.match(/^(.+?)([+-])(\d+(?:\.\d+)?)$/)
      if (!matched) return null
      const [, rawLabel, sign, amountText] = matched
      const label = String(rawLabel ?? '').trim()
      const deltaMajor = round2(Math.abs(Number(amountText)))
      if (!label || deltaMajor <= 0) return null
      return {
        label,
        direction: sign === '-' ? 'minus' : 'plus',
        deltaMinor: Math.round(deltaMajor * 100),
      }
    })
    .filter(Boolean)
}

function normalizePositiveAddonParts(tx, finalAmountMinor) {
  const positiveItems = parseAddonItemsFromNote(tx?.note)
    .filter((item) => item.direction === 'plus' && item.deltaMinor > 0)
  if (!positiveItems.length || finalAmountMinor <= 0) return []

  const totalAddonMinor = positiveItems.reduce((sum, item) => sum + item.deltaMinor, 0)
  if (totalAddonMinor <= finalAmountMinor) return positiveItems

  let allocatedMinor = 0
  return positiveItems
    .map((item, index) => {
      const isLast = index === positiveItems.length - 1
      const amountMinor = isLast
        ? Math.max(0, finalAmountMinor - allocatedMinor)
        : Math.max(0, Math.round((item.deltaMinor / totalAddonMinor) * finalAmountMinor))
      allocatedMinor += amountMinor
      return { ...item, deltaMinor: amountMinor }
    })
    .filter((item) => item.deltaMinor > 0)
}

export function getBreakdownPartsForTransaction(tx, {
  type,
  scope = 'category',
  getAddonLabel = (label) => `附加項目：${label}`,
} = {}) {
  if (tx?.type !== type || tx?.origin_type === 'loan_payment') return []

  const effectiveAmountMinor = effectiveTransactionAmountMinor(tx)
  const amount = type === 'expense' ? Math.abs(effectiveAmountMinor) : effectiveAmountMinor
  if (!Number.isFinite(amount) || amount <= 0) return []

  if (scope !== 'category' || type !== 'expense') {
    const id = scope === 'account'
      ? (tx.account_id || '__unassigned_account__')
      : (tx.category_id || '__uncategorized__')
    return [{ id, amountMinor: amount, count: 1, icon: '' }]
  }

  const addonParts = normalizePositiveAddonParts(tx, amount)
  const addonTotalMinor = addonParts.reduce((sum, item) => sum + item.deltaMinor, 0)
  const baseMinor = Math.max(0, amount - addonTotalMinor)
  const parts = []

  if (baseMinor > 0) {
    parts.push({
      id: tx.category_id || '__uncategorized__',
      amountMinor: baseMinor,
      count: 1,
      icon: '',
    })
  }

  for (const item of addonParts) {
    parts.push({
      id: addonBreakdownId(item.label),
      amountMinor: item.deltaMinor,
      count: 1,
      name: getAddonLabel(item.label),
      icon: 'fa-solid fa-tags',
      addonLabel: item.label,
    })
  }

  return parts
}

function resolveBreakdownName(id, scope, {
  accountNameMap,
  categoryNameMap,
  getAddonLabel,
  getUnassignedAccountLabel,
  getUncategorizedLabel,
}) {
  if (scope === 'account') {
    if (id === '__unassigned_account__') return getUnassignedAccountLabel()
    return accountNameMap.get(id) || getUnassignedAccountLabel()
  }
  if (isAddonBreakdownId(id)) return getAddonLabel(addonLabelFromBreakdownId(id))
  if (id === '__uncategorized__') return getUncategorizedLabel()
  return categoryNameMap.get(id) || getUncategorizedLabel()
}

function resolveBreakdownIcon(id, scope, {
  accountIconMap,
  categoryIconMap,
}) {
  if (scope === 'account') {
    if (id === '__unassigned_account__') return ''
    return accountIconMap.get(id) || ''
  }
  if (isAddonBreakdownId(id)) return 'fa-solid fa-tags'
  if (id === '__uncategorized__') return ''
  return categoryIconMap.get(id) || ''
}

export function buildThemePalette(count, swatches = []) {
  const safeCount = Math.max(1, Number(count) || 1)
  const palette = (Array.isArray(swatches) ? swatches : []).slice(0, safeCount)
  if (palette.length >= safeCount) return palette

  for (let index = palette.length; index < safeCount; index += 1) {
    const hue = (index * 137.508) % 360
    palette.push(`color-mix(in srgb, hsl(${hue.toFixed(2)}deg 82% 62%) 82%, var(--card) 18%)`)
  }

  return palette
}

export function buildBreakdownRows({
  transactions = [],
  type,
  scope = 'category',
  shouldIncludeTransaction = defaultShouldIncludeTransaction,
  categoryNameMap = new Map(),
  categoryIconMap = new Map(),
  accountNameMap = new Map(),
  accountIconMap = new Map(),
  getAddonLabel = (label) => `附加項目：${label}`,
  getUncategorizedLabel = () => '未分類',
  getUnassignedAccountLabel = () => '未指定帳戶',
  swatches = [],
} = {}) {
  const map = new Map()
  for (const tx of transactions) {
    if (!shouldIncludeTransaction(tx)) continue
    const parts = getBreakdownPartsForTransaction(tx, { type, scope, getAddonLabel })
    for (const part of parts) {
      const current = map.get(part.id) || { amountMinor: 0, count: 0 }
      current.amountMinor += part.amountMinor
      current.count += part.count
      map.set(part.id, current)
    }
  }

  const rows = Array.from(map.entries())
    .map(([id, aggregate]) => ({
      id,
      amountMinor: aggregate.amountMinor,
      count: aggregate.count,
      name: resolveBreakdownName(id, scope, {
        accountNameMap,
        categoryNameMap,
        getAddonLabel,
        getUnassignedAccountLabel,
        getUncategorizedLabel,
      }),
      icon: resolveBreakdownIcon(id, scope, {
        accountIconMap,
        categoryIconMap,
      }),
    }))
    .sort((left, right) => right.amountMinor - left.amountMinor)

  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)
  if (!total) return []

  const palette = buildThemePalette(rows.length, swatches)
  return rows.map((row, index) => ({
    ...row,
    color: palette[index],
    percent: Math.round((row.amountMinor / total) * 100),
  }))
}

export function buildAccountBalanceBreakdown({
  accounts = [],
  accountBalanceMap = new Map(),
  swatches = [],
} = {}) {
  const rows = accounts
    .map((account) => {
      const balanceMinor = accountBalanceMap.get(account.id) ?? Number(account.opening_balance_minor ?? 0)
      return {
        id: account.id,
        amountMinor: Number(balanceMinor) || 0,
        magnitudeMinor: Math.abs(Number(balanceMinor) || 0),
        count: 1,
        name: account.name,
        icon: String(account.icon ?? '').trim(),
      }
    })
    .sort((left, right) => right.amountMinor - left.amountMinor)

  if (!rows.length) return []

  const totalMagnitude = rows.reduce((sum, row) => sum + row.magnitudeMinor, 0)
  const palette = buildThemePalette(rows.length, swatches)

  return rows.map((row, index) => ({
    ...row,
    color: palette[index],
    percent: totalMagnitude > 0 ? Math.round((row.magnitudeMinor / totalMagnitude) * 100) : 0,
  }))
}

export function buildPieStyle(items = []) {
  if (!items.length) {
    return { background: 'conic-gradient(var(--chart-track) 0deg 360deg)' }
  }

  const total = items.reduce((sum, item) => sum + item.amountMinor, 0)
  let cursor = 0
  const segments = []

  for (const item of items) {
    const deg = (item.amountMinor / total) * 360
    const start = cursor
    const end = cursor + deg
    segments.push(`${item.color} ${start}deg ${end}deg`)
    cursor = end
  }

  return { background: `conic-gradient(${segments.join(', ')})` }
}

export function buildBarRows(items = []) {
  if (!items.length) return []

  const maxAmount = items.reduce((max, item) => {
    const value = Math.abs(Number(item?.magnitudeMinor ?? item?.amountMinor ?? 0) || 0)
    return Math.max(max, value)
  }, 0)

  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    return items.map((item) => ({ ...item, barWidthPercent: 0 }))
  }

  return items.map((item) => {
    const amount = Math.abs(Number(item?.magnitudeMinor ?? item?.amountMinor ?? 0) || 0)
    const ratio = amount > 0 ? (amount / maxAmount) * 100 : 0
    const barWidthPercent = amount > 0 ? Math.max(8, Math.min(100, ratio)) : 0
    return {
      ...item,
      barWidthPercent: Number(barWidthPercent.toFixed(2)),
    }
  })
}

function buildYearSeeds(transactions = []) {
  const years = Array.from(new Set(
    transactions
      .map((tx) => {
        const date = new Date(tx?.occurred_at ?? '')
        return Number.isNaN(date.getTime()) ? null : date.getFullYear()
      })
      .filter((value) => Number.isFinite(value)),
  )).sort((left, right) => left - right)

  if (!years.length) return []
  const first = years[0]
  const last = years[years.length - 1]
  const seed = []
  for (let year = first; year <= last; year += 1) {
    seed.push({
      id: String(year),
      label: String(year),
    })
  }
  return seed
}

function buildDaySeeds(monthKey) {
  const text = String(monthKey ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{2})$/)
  if (!match) return []
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return []
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    return {
      id: String(day).padStart(2, '0'),
      label: `${day}日`,
    }
  })
}

export function buildTimeBarRows({
  transactions = [],
  type,
  mode,
  year,
  monthKey,
  shouldIncludeTransaction = defaultShouldIncludeTransaction,
} = {}) {
  if (!Array.isArray(transactions) || !transactions.length) return []
  if (!['all', 'year', 'month'].includes(mode)) return []

  const bucketSeed = mode === 'year'
    ? Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1).padStart(2, '0'),
      label: `${index + 1}月`,
    }))
    : mode === 'month'
      ? buildDaySeeds(monthKey)
      : buildYearSeeds(transactions)

  if (!bucketSeed.length) return []

  const bucketMap = new Map(
    bucketSeed.map((item) => [item.id, { ...item, amountMinor: 0, count: 0 }]),
  )

  for (const tx of transactions) {
    if (!shouldIncludeTransaction(tx)) continue
    if (tx?.type !== type || tx?.origin_type === 'loan_payment') continue
    const effectiveAmountMinor = effectiveTransactionAmountMinor(tx)
    const amountMinor = type === 'expense' ? Math.abs(effectiveAmountMinor) : effectiveAmountMinor
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) continue

    const date = new Date(tx?.occurred_at ?? '')
    if (Number.isNaN(date.getTime())) continue

    const bucketId = mode === 'year'
      ? String(date.getMonth() + 1).padStart(2, '0')
      : mode === 'month'
        ? String(date.getDate()).padStart(2, '0')
        : String(date.getFullYear())
    const current = bucketMap.get(bucketId)
    if (!current) continue
    current.amountMinor += amountMinor
    current.count += 1
  }

  const rows = bucketSeed.map((item) => bucketMap.get(item.id) || { ...item, amountMinor: 0, count: 0 })
  const maxAmount = rows.reduce((max, item) => Math.max(max, item.amountMinor), 0)
  return rows.map((item) => ({
    ...item,
    year: mode === 'year' ? year : undefined,
    month: mode === 'month' ? monthKey : undefined,
    barHeightPercent: maxAmount > 0
      ? Number(Math.max(item.amountMinor > 0 ? 12 : 0, (item.amountMinor / maxAmount) * 100).toFixed(2))
      : 0,
  }))
}

export function resolveTimeBarSearchRange({
  mode,
  bucketId,
  year,
  monthKey,
}) {
  const normalizedBucketId = String(bucketId ?? '').trim()
  if (!normalizedBucketId) return null

  if (mode === 'all') {
    const targetYear = Number(normalizedBucketId)
    if (!Number.isFinite(targetYear)) return null
    return {
      startDay: `${targetYear}-01-01`,
      endDay: `${targetYear}-12-31`,
    }
  }

  if (mode === 'year') {
    const targetYear = Number(year)
    const month = Number(normalizedBucketId)
    if (!Number.isFinite(targetYear) || !Number.isFinite(month) || month < 1 || month > 12) return null
    const resolvedMonthKey = `${targetYear}-${String(month).padStart(2, '0')}`
    return {
      startDay: `${resolvedMonthKey}-01`,
      endDay: `${resolvedMonthKey}-${String(new Date(targetYear, month, 0).getDate()).padStart(2, '0')}`,
    }
  }

  if (mode === 'month') {
    const day = Number(normalizedBucketId)
    const match = String(monthKey ?? '').trim().match(/^(\d{4})-(\d{2})$/)
    if (!match || !Number.isFinite(day)) return null
    const dayKey = `${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`
    return {
      startDay: dayKey,
      endDay: dayKey,
    }
  }

  return null
}
