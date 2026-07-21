export const ANALYSIS_CHART_SWATCHES = [
  '#ff6b6b',
  '#ffa94d',
  '#ffd43b',
  '#69db7c',
  '#38d9a9',
  '#4dabf7',
  '#748ffc',
  '#9775fa',
  '#cc5de8',
  '#f06595',
  '#a9e34b',
  '#66d9e8',
]

export function parseTagsJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
    }
  } catch {
    // fall through to delimited text
  }
  return raw
    .split(/[,，、|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function formatTagsLabel(value) {
  return parseTagsJson(value).join('、')
}

export function resolveReportMonthKey(options = {}) {
  const mode = String(options.mode ?? 'month')
  if (mode === 'month' && /^\d{4}-\d{2}$/.test(String(options.monthKey ?? ''))) {
    return String(options.monthKey)
  }
  if (mode === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(String(options.dayKey ?? ''))) {
    return String(options.dayKey).slice(0, 7)
  }
  if (mode === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(String(options.startDate ?? ''))) {
    return String(options.startDate).slice(0, 7)
  }
  if (mode === 'year' && /^\d{4}$/.test(String(options.yearKey ?? ''))) {
    return `${options.yearKey}-01`
  }
  const now = options.now instanceof Date ? options.now : new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function buildAnalysisReportPdfFilename(options = {}) {
  const monthKey = resolveReportMonthKey(options)
  return `交易報表_${monthKey}.pdf`
}

export function formatOccurredDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return text.slice(0, 10) || '-'
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatAmountMajorFromMinor(value) {
  const minor = Number(value ?? 0)
  if (!Number.isFinite(minor)) return '0'
  const major = minor / 100
  return major
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')
}

export function buildAnalysisDetailRows(records = [], {
  typeLabel = (type) => type,
  uncategorizedLabel = '未分類',
  unassignedAccountLabel = '未指定帳戶',
} = {}) {
  return (Array.isArray(records) ? records : []).map((tx, index) => {
    const categoryName = String(tx?.category_name ?? '').trim() || uncategorizedLabel
    const accountName = String(tx?.account_name ?? '').trim() || unassignedAccountLabel
    const tags = parseTagsJson(tx?.tags_json)
    return {
      id: String(tx?.id ?? `${index}-${tx?.occurred_at ?? ''}`),
      date: formatOccurredDate(tx?.occurred_at),
      type: typeLabel(tx?.type),
      typeKey: String(tx?.type ?? ''),
      categoryName,
      categoryIcon: String(tx?.category_icon ?? '').trim(),
      accountName,
      accountIcon: String(tx?.account_icon ?? '').trim(),
      amountMinor: Number(tx?.amount_minor ?? 0) || 0,
      amountText: formatAmountMajorFromMinor(tx?.amount_minor),
      note: String(tx?.note ?? '').trim(),
      tags,
      tagsText: tags.join('、'),
    }
  })
}

export function buildBudgetAchievementCards({
  items = [],
  containers = [],
  spentMap = {},
  categoryNameMap = new Map(),
  categoryIconMap = new Map(),
} = {}) {
  const cards = []

  for (const container of Array.isArray(containers) ? containers : []) {
    const budgetMinor = Math.max(0, Number(container?.budgetMinor ?? container?.amount_minor ?? 0) || 0)
    const spentMinor = Math.max(0, Number(container?.spentMinor ?? 0) || 0)
    const percent = budgetMinor > 0 ? Math.min(999, Math.round((spentMinor / budgetMinor) * 100)) : 0
    cards.push({
      id: `container:${container?.id ?? cards.length}`,
      name: String(container?.name ?? '').trim() || '共同預算池',
      icon: 'fa-solid fa-vault',
      budgetMinor,
      spentMinor,
      remainMinor: budgetMinor - spentMinor,
      percent,
      isOver: budgetMinor > 0 && spentMinor > budgetMinor,
    })
  }

  for (const item of Array.isArray(items) ? items : []) {
    if (String(item?.budget_container_id ?? '').trim()) continue
    const categoryId = String(item?.category_id ?? '').trim()
    const budgetMinor = Math.max(0, Number(item?.resolved_amount_minor ?? item?.amount_minor ?? 0) || 0)
    const spentMinor = Math.max(0, Number(spentMap?.[categoryId] ?? 0) || 0)
    const percent = budgetMinor > 0 ? Math.min(999, Math.round((spentMinor / budgetMinor) * 100)) : 0
    cards.push({
      id: `item:${item?.id ?? categoryId ?? cards.length}`,
      name: categoryNameMap.get(categoryId) || String(item?.name ?? '').trim() || categoryId || '預算項目',
      icon: categoryIconMap.get(categoryId) || 'fa-solid fa-piggy-bank',
      budgetMinor,
      spentMinor,
      remainMinor: budgetMinor - spentMinor,
      percent,
      isOver: budgetMinor > 0 && spentMinor > budgetMinor,
    })
  }

  return cards
}
