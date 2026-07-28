import {
  compactText,
  escapeRegExp,
  normalizeText,
  parseAmountWithUnit,
  round2,
  stripExplicitNoteLabeledSegments,
  stripTextSegments,
} from './ai-bookkeeping-text.js'

const ADDON_NOTE_PREFIX = '【附加項目】'

export function stripAddonSummaryFromStoredNote(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(ADDON_NOTE_PREFIX))
    .join('\n')
}

export function parseAddonItemsFromStoredNote(note) {
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
      const [, label, , amountText] = matched
      const deltaMajor = round2(Math.abs(Number(amountText)))
      if (!label || deltaMajor <= 0) return null
      return {
        label: label.trim(),
        deltaMajor,
      }
    })
    .filter(Boolean)
}

export function extractAddonItems(text) {
  const items = []
  const ranges = []
  const pushItem = ({ label, direction, amountMajor, start, end }) => {
    const normalizedLabel = String(label ?? '').trim()
    const deltaMajor = round2(Math.abs(Number(amountMajor ?? 0)))
    if (!normalizedLabel || !(deltaMajor > 0)) return
    items.push({
      label: normalizedLabel,
      direction: direction === 'minus' ? 'minus' : 'plus',
      deltaMajor,
    })
    ranges.push({ start, end })
  }
  const addonPatterns = [
    {
      defaultDirection: 'plus',
      regex: /(附加項目|附加費|手續費|服務費|運費|稅金|稅費|匯費|利息|加價|加收|fee|fees|service fee|shipping|tax|surcharge|interest|手数料|配送料|送料|税金)\s*([+-]?)\s*((?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi,
    },
    {
      defaultDirection: 'minus',
      regex: /(折扣|優惠|回饋|減免|折讓|discount|coupon|rebate|cashback|値引き|割引|クーポン|キャッシュバック)\s*([+-]?)\s*((?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi,
    },
  ]

  for (const pattern of addonPatterns) {
    let matched = pattern.regex.exec(text)
    while (matched) {
      const keyword = String(matched[1] ?? '').trim() || '附加項目'
      const amountMajor = parseAmountWithUnit(matched[3], matched[4])
      if (Number.isFinite(amountMajor) && amountMajor > 0) {
        pushItem({
          label: keyword,
          direction: pattern.defaultDirection,
          amountMajor,
          start: matched.index,
          end: matched.index + String(matched[0] ?? '').length,
        })
      }
      matched = pattern.regex.exec(text)
    }
  }

  return {
    items,
    strippedText: stripTextSegments(text, ranges),
  }
}

export function extractAddonItemsByTemplates(text, templates = []) {
  const source = String(text ?? '')
  const normalizedTemplates = (templates ?? [])
    .map((item) => ({
      label: String(item?.label ?? '').trim(),
      defaultDirection: item?.defaultDirection === 'minus' ? 'minus' : 'plus',
    }))
    .filter((item) => item.label)
    .sort((a, b) => b.label.length - a.label.length)

  const items = []
  const ranges = []
  const occupiedRanges = []
  const amountPattern = '((?:\\d{1,3}(?:[,\\s]\\d{3})+|\\d+)(?:\\.\\d+)?)\\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\\$|\\$|¥|￥)?'

  const overlaps = (start, end) => occupiedRanges.some((range) => start < range.end && end > range.start)

  for (const template of normalizedTemplates) {
    const pattern = new RegExp(`${escapeRegExp(template.label)}\\s*([+-]?)\\s*${amountPattern}`, 'gi')
    let matched = pattern.exec(source)
    while (matched) {
      const start = matched.index
      const end = matched.index + String(matched[0] ?? '').length
      if (!overlaps(start, end)) {
        const amountMajor = parseAmountWithUnit(matched[2], matched[3])
        if (Number.isFinite(amountMajor) && amountMajor > 0) {
          const sign = String(matched[1] ?? '').trim()
          items.push({
            label: template.label,
            direction: sign === '-' ? 'minus' : sign === '+' ? 'plus' : template.defaultDirection,
            deltaMajor: amountMajor,
          })
          ranges.push({ start, end })
          occupiedRanges.push({ start, end })
        }
      }
      matched = pattern.exec(source)
    }
  }

  return {
    items,
    strippedText: stripTextSegments(source, ranges),
  }
}

export function mergeUniqueAddonItems(baseItems, extraItems) {
  const merged = []
  const keys = new Set()

  const pushItem = (item) => {
    const label = String(item?.label ?? '').trim()
    const deltaMajor = round2(Math.abs(Number(item?.deltaMajor ?? item?.amountMajor ?? 0)))
    if (!label || deltaMajor <= 0) return
    const key = `${compactText(label)}:${deltaMajor}`
    if (keys.has(key)) return
    keys.add(key)
    merged.push({
      label,
      deltaMajor,
    })
  }

  for (const item of baseItems ?? []) pushItem(item)
  for (const item of extraItems ?? []) pushItem(item)
  return merged
}

function collectDuplicateAccountGroupNames(accounts) {
  const duplicateNameCount = new Map()
  const result = new Set()

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey || (duplicateNameCount.get(nameKey) ?? 0) <= 1) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    if (!groupName) continue
    result.add(groupName)
  }

  return Array.from(result)
}

function collectReservedKeywords(context = {}) {
  const keywords = []
  const pushKeyword = (value) => {
    const keyword = String(value ?? '').trim()
    if (!keyword) return
    if (keywords.some((item) => compactText(item) === compactText(keyword))) return
    keywords.push(keyword)
  }

  for (const item of context.reservedKeywords ?? []) pushKeyword(item)
  for (const item of context.matchedAutoFillKeywords ?? []) pushKeyword(item)

  const autoFillKeyword = String(context.matchedAutoFillKeyword ?? context.autoFillKeyword ?? '').trim()
  if (autoFillKeyword) {
    const orPattern = /\s*(?:\bor\b|\|\||\||或者|或)\s*/i
    const andPattern = /\s*(?:\band\b|&&|&|且|並且|并且|和|與)\s*/i
    for (const group of autoFillKeyword.split(orPattern)) {
      for (const token of group.split(andPattern)) pushKeyword(token)
    }
  }

  return keywords.sort((a, b) => b.length - a.length)
}

function detachExplicitNoteSegments(text, categoryNames = []) {
  const source = String(text ?? '')
  const bodies = []
  const labelPattern = /(?:備註|备注|註記|注記|\bmemo\b|\bremark\b|\bnote\b)\s*[:：]\s*/gi
  const sortedCategoryNames = [...(categoryNames ?? [])]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const trailingAmountTail = String.raw`[+-]?(?:(?:\d+(?:\.\d+)?\s*(?:萬|w|千|k|百)?\s*[+\-×÷*/xX]\s*)*\d+(?:\.\d+)?\s*(?:萬|w|千|k|百|元|塊|塊錢)?)`

  let matched = labelPattern.exec(source)
  while (matched) {
    const labelStart = matched.index
    const bodyStart = labelStart + String(matched[0] ?? '').length
    let bodyEnd = source.length
    const afterLabel = source.slice(bodyStart)

    for (const categoryName of sortedCategoryNames) {
      const boundary = new RegExp(
        `(?:^|[\\s，,])${escapeRegExp(categoryName)}\\s*${trailingAmountTail}`,
        'i',
      )
      const found = afterLabel.search(boundary)
      if (found >= 0) {
        bodyEnd = bodyStart + found
        break
      }
    }

    if (bodyEnd === source.length) {
      const genericBoundary = afterLabel.search(
        new RegExp(`(?:^|[\\s，,])[\\u4e00-\\u9fffA-Za-z]{1,12}\\s*${trailingAmountTail}\\s*$`, 'i'),
      )
      if (genericBoundary >= 0) {
        bodyEnd = bodyStart + genericBoundary
      }
    }

    const body = source.slice(bodyStart, bodyEnd).trim()
    if (body) bodies.push(body)
    matched = labelPattern.exec(source)
  }

  return {
    bodies,
    remainder: stripExplicitNoteLabeledSegments(source, categoryNames),
  }
}

export function extractSmartNoteText(text, context = {}) {
  const categoryNames = (context.categories ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)
  const selectedCategoryName = String(context.selectedCategoryName ?? '').trim()
  const allCategoryNames = selectedCategoryName
    ? [selectedCategoryName, ...categoryNames.filter((name) => name !== selectedCategoryName)]
    : categoryNames

  const { bodies: explicitNoteBodies, remainder } = detachExplicitNoteSegments(text, allCategoryNames)
  let note = remainder
  const accountNames = (context.accounts ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)
  const duplicateAccountGroupNames = collectDuplicateAccountGroupNames(context.accounts)
  const reservedKeywords = collectReservedKeywords(context)

  if (selectedCategoryName) {
    note = note.replace(new RegExp(escapeRegExp(selectedCategoryName), 'gi'), ' ')
  }
  for (const categoryName of categoryNames) {
    if (!categoryName || categoryName === selectedCategoryName) continue
    note = note.replace(new RegExp(escapeRegExp(categoryName), 'gi'), ' ')
  }

  for (const accountName of accountNames) {
    note = note.replace(new RegExp(escapeRegExp(accountName), 'gi'), ' ')
  }
  for (const groupName of duplicateAccountGroupNames) {
    note = note.replace(new RegExp(escapeRegExp(groupName), 'gi'), ' ')
  }
  for (const keyword of reservedKeywords) {
    note = note.replace(new RegExp(escapeRegExp(keyword), 'gi'), ' ')
  }

  const stripPatterns = [
    /(?:[+-]?(?:\d+(?:\.\d+)?)\s*(?:萬|w|千|k|百)?\s*[+\-×÷*/xX]\s*)+[+-]?(?:\d+(?:\.\d+)?)\s*(?:萬|w|千|k|百)?\s*(元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi,
    /\d{4}\s*(?:[./-]|年)\s*\d{1,2}\s*(?:[./-]|月)\s*\d{1,2}(?:日)?/g,
    /\d{1,2}\s*(?:[./-]|月)\s*\d{1,2}(?:日)?/g,
    /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.|午前|午後)?/gi,
    /(凌晨|早上|上午|中午|下午|晚上|午前|午後|morning|afternoon|evening|night)?\s*\d{1,2}\s*(點|时|時|o'clock|oclock)?(?:\s*\d{1,2}\s*(分|min|minutes?)?)?\s*(am|pm|a\.m\.|p\.m\.)?/gi,
    /[+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    /[+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?/g,
    /(昨天|今天|明天|前天|剛剛|剛才|方才|剛|昨日|今日|明日|おととい|yesterday|today|tomorrow|just now)/gi,
    /(刷卡|現金|轉帳|转账|轉出|转出|轉入|转入|轉給|转给|轉到|转到|匯款|汇款|匯入|汇入|匯出|汇出|打款|打錢|打钱|撥款|拨款|調撥|调拨|挪款|挪錢|挪钱|搬錢|搬钱|移轉|互轉|過戶|过户|付款|支付|扣款|入帳|報[銷修]|報帳|請款|紀錄|記帳|新增|幫我|請幫我|pay|paid|payment|spent|spend|expense|income|transfer|from|to|deposit|withdraw|record|log|create|add|reimburse|reimbursable|返済|入金|出金|振込|送金|記録|追加|精算)/gi,
    /(收入|支出|轉出|转出|轉入|转入|匯出|汇出|匯入|汇入|income|expense|transfer|収入|支出|振替)/gi,
    /(計入預算|不計入預算|計入收支|不計入收支|算進預算|算進分析|include in budget|exclude from budget|include in analysis|exclude from analysis|予算に含める|予算に含めない|分析に含める|分析に含めない)/gi,
    /(早餐|午餐|晚餐|宵夜|餐費|餐飲|伙食|飲料|咖啡|交通|車資|通勤|捷運|地鐵|公車|客運|高鐵|台鐵|火車|計程車|uber|油錢|停車費|房租|租金|水費|電費|瓦斯|網路費|電信費|醫療|藥費|娛樂|旅遊|學費|教材|服飾|美妝|薪水|薪資|獎金|利息|股息|退款|退費|breakfast|lunch|dinner|meal|food|drink|transport|rent|utility|medical|travel|education|salary|bonus|interest|refund|朝食|昼食|夕食|食費|交通費|家賃|光熱費|医療|旅行|学費|給与|返金)/gi,
    /(錢包|信用卡|簽帳卡|金融卡|帳戶|wallet|card|account|bank|口座|カード|財布)/gi,
  ]

  for (const pattern of stripPatterns) {
    note = note.replace(pattern, ' ')
  }

  note = note
    .replace(/[，。；、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const preservedExplicit = explicitNoteBodies
    .map((body) => normalizeText(body))
    .filter(Boolean)
    .join(' ')
  if (preservedExplicit) {
    note = `${note} ${preservedExplicit}`.trim()
  }

  if (note.length > 36) {
    note = note.slice(0, 36).trim()
  }
  return note
}
