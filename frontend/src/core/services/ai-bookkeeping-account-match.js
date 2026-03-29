import {
  compactText,
  escapeRegExp,
  includesAny,
} from './ai-bookkeeping-text.js'

const ACCOUNT_NAME_GENERIC_TARGETS = new Set([
  '銀行',
  'bank',
  'account',
  'acct',
  'card',
  'wallet',
  '帳戶',
  '帐户',
  '帳號',
  '账号',
  '戶頭',
  '户头',
  '活存',
  '定存',
  '存款',
  '信用卡',
  '簽帳卡',
  '金融卡',
  '口座',
  'カード',
  'money',
])

function stripAccountNameSuffix(value) {
  let name = String(value ?? '').trim()
  if (!name) return ''
  const suffixPatterns = [
    /(銀行|bank)$/i,
    /(帳戶|帐户|帳號|账号|戶頭|户头)$/i,
    /(account|acct)$/i,
    /(活存|定存|存款)$/i,
    /(信用卡|簽帳卡|金融卡|card|wallet)$/i,
    /(口座|カード|ウォレット)$/i,
    /(台幣|臺幣|人民幣|美元|日圓|日元|歐元|日幣|円|yen|twd|cny|usd|jpy|eur)$/i,
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const pattern of suffixPatterns) {
      const next = name.replace(pattern, '').trim()
      if (next && next !== name) {
        name = next
        changed = true
      }
    }
  }

  return name
}

function buildAccountMatchTargets(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []

  const targets = []
  const seen = new Set()
  const pushTarget = (value, bonus = 0) => {
    const target = compactText(value)
    if (target.length < 2) return
    if (/^\d+$/.test(target)) return
    if (ACCOUNT_NAME_GENERIC_TARGETS.has(target)) return
    if (seen.has(target)) return
    seen.add(target)
    targets.push({ target, bonus })
  }

  pushTarget(raw, 12)
  const strippedRaw = stripAccountNameSuffix(raw)
  if (strippedRaw && strippedRaw !== raw) {
    pushTarget(strippedRaw, 8)
  }

  const normalized = raw.replace(/[()（）[\]【】]/g, ' ')
  const parts = normalized
    .split(/[\s\-_/,.，。:：]+/)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)

  for (const part of parts) {
    pushTarget(part, 4)
    const strippedPart = stripAccountNameSuffix(part)
    if (strippedPart && strippedPart !== part) {
      pushTarget(strippedPart, 2)
    }
  }

  return targets
}

export function findAccountMatchEntries(text, accounts) {
  const compact = compactText(text)
  const matches = []
  const duplicateNameCount = new Map()

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    const compactName = compactText(name)
    const compactGroupName = compactText(groupName)
    const hasDuplicateName = (duplicateNameCount.get(compactName) ?? 0) > 1
    const targets = buildAccountMatchTargets(name)
    for (const { target, bonus } of targets) {
      const index = compact.indexOf(target)
      if (index < 0) continue
      let score = target.length + bonus

      if (hasDuplicateName && compactGroupName) {
        const groupIndex = compact.indexOf(compactGroupName)
        if (groupIndex >= 0) {
          score += 500
          if (
            compact.includes(`${compactGroupName}${target}`)
            || compact.includes(`${target}${compactGroupName}`)
          ) {
            score += 300
          }
        }
      }

      matches.push({ account, index, score, target })
    }
  }

  matches.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return b.score - a.score
  })

  const deduped = []
  const seen = new Set()
  for (const item of matches) {
    const accountId = String(item?.account?.id ?? '').trim()
    const uniqueKey = accountId || `${item.target}:${item.index}`
    if (seen.has(uniqueKey)) continue
    seen.add(uniqueKey)
    deduped.push(item)
  }
  return deduped
}

function findAccountMatches(text, accounts) {
  return findAccountMatchEntries(text, accounts).map((item) => item.account)
}

function countSubsequenceHits(source, target) {
  if (!source || !target) return 0
  let sourceIndex = 0
  let hits = 0
  for (let i = 0; i < target.length; i += 1) {
    const char = target[i]
    const foundAt = source.indexOf(char, sourceIndex)
    if (foundAt < 0) continue
    hits += 1
    sourceIndex = foundAt + 1
  }
  return hits
}

function fuzzyAccountScore(textCompact, accountNameCompact) {
  if (!textCompact || !accountNameCompact) return 0
  if (textCompact.includes(accountNameCompact)) return 1000 + accountNameCompact.length
  if (accountNameCompact.includes(textCompact) && textCompact.length >= 2) return 700 + textCompact.length

  let overlap = 0
  for (const char of accountNameCompact) {
    if (textCompact.includes(char)) overlap += 1
  }
  const subseq = countSubsequenceHits(textCompact, accountNameCompact)
  const coverage = overlap / Math.max(accountNameCompact.length, 1)
  const subseqCoverage = subseq / Math.max(accountNameCompact.length, 1)
  return coverage * 100 + subseqCoverage * 120
}

export function pickClosestAccount(text, accounts) {
  const compact = compactText(text)
  if (!compact) return null

  const strict = findAccountMatches(text, accounts)
  if (strict.length > 0) return strict[0]

  const duplicateNameCount = new Map()
  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  let best = null
  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    const compactName = compactText(name)
    const compactGroupName = compactText(groupName)
    let score = fuzzyAccountScore(compact, compactName)

    if ((duplicateNameCount.get(compactName) ?? 0) > 1 && compactGroupName) {
      const comboScore = fuzzyAccountScore(compact, `${compactGroupName}${compactName}`)
      const reverseComboScore = fuzzyAccountScore(compact, `${compactName}${compactGroupName}`)
      score = Math.max(score, comboScore + 120, reverseComboScore + 120)
      if (compact.includes(compactGroupName)) {
        score += 220
      }
    }

    if (!best || score > best.score) {
      best = { account, score }
    }
  }

  if (!best || best.score < 90) return null
  return best.account
}

function findAccountByKeyword(text, accounts, keywords) {
  const source = String(text ?? '')
  const lowerSource = source.toLowerCase()
  for (const keyword of keywords) {
    const normalizedKeyword = String(keyword ?? '')
    if (!normalizedKeyword) continue
    const keywordIndex = lowerSource.indexOf(normalizedKeyword.toLowerCase())
    const textAfterKeyword = keywordIndex >= 0 ? source.slice(keywordIndex + normalizedKeyword.length) : ''

    for (const account of accounts ?? []) {
      const name = String(account?.name ?? '').trim()
      if (!name) continue
      const keywordPattern = new RegExp(`${escapeRegExp(normalizedKeyword)}\\s*${escapeRegExp(name)}`, 'i')
      if (keywordPattern.test(source)) return account
    }

    const fuzzy = pickClosestAccount(textAfterKeyword, accounts)
    if (fuzzy) return fuzzy
  }
  return null
}

export function pickTransferAccounts(text, accounts) {
  const matched = findAccountMatches(text, accounts)

  const fromByKeyword = findAccountByKeyword(
    text,
    accounts,
    ['從', '由', '自', '用', '刷', '扣', '轉出', '匯出', '拨出', '撥出', 'from', 'via', 'using', 'out of', 'から', 'より'],
  )
  const toByKeyword = findAccountByKeyword(
    text,
    accounts,
    ['到', '至', '給', '轉入', '匯入', '存入', '打到', '撥入', '拨入', 'to', 'into', 'deposit to', 'pay to', 'へ'],
  )

  let from = fromByKeyword ?? matched[0] ?? null
  let to = toByKeyword ?? matched.find((item) => item.id !== from?.id) ?? null

  if (from && to && from.id === to.id) {
    to = matched.find((item) => item.id !== from.id) ?? null
  }

  return {
    fromAccountId: from?.id ?? '',
    toAccountId: to?.id ?? '',
  }
}

export function shouldTreatAsTransfer(text, accounts) {
  const source = String(text ?? '')
  const compact = compactText(source)
  const matchedEntries = findAccountMatchEntries(source, accounts)
  const uniqueMatchedAccountIds = [...new Set(matchedEntries.map((item) => item?.account?.id).filter(Boolean))]
  const transferAccounts = pickTransferAccounts(source, accounts)
  const hasTwoDistinctAccounts = uniqueMatchedAccountIds.length >= 2
    || Boolean(
      transferAccounts.fromAccountId
      && transferAccounts.toAccountId
      && transferAccounts.fromAccountId !== transferAccounts.toAccountId,
    )
  if (!hasTwoDistinctAccounts) return false

  const hasDirectionalPhrase = includesAny(source, [
    /(從|由|自)\s*\S{0,16}\s*(到|至|給)/,
    /(由)\s*\S{0,16}\s*(轉給|轉到|匯給|匯到)/,
    /(轉|轉錢|轉款|匯|汇|挪|撥|拨|搬|移)\s*\S{0,18}\s*(到|至|給|入)/,
    /(到|至|給)\s*\S{0,18}\s*(轉|轉錢|轉款|匯|汇|挪|撥|拨|搬|移)/,
    /(帳戶|账户)\s*\S{0,18}\s*(互轉|互转)/,
    /\bfrom\b\s+\S{0,20}\s+\bto\b/i,
    /\btransfer\b\s+\S{0,20}\s+\bto\b/i,
    /\bmove\b\s+\S{0,20}\s+\bto\b/i,
    /から\s*\S{0,16}\s*へ/,
    /口座.*(振替|送金)/,
    /→|->|=>|➡/,
  ])
  const hasTransferAction = includesAny(source, [
    /轉帳|转账/,
    /轉給|转给/,
    /轉去|转去/,
    /轉到|转到/,
    /轉入|转入/,
    /轉出|转出/,
    /轉錢|转钱/,
    /轉款|转款/,
    /匯給|汇给/,
    /匯到|汇到/,
    /匯入|汇入/,
    /匯出|汇出/,
    /匯款|汇款/,
    /打款|打錢|打钱/,
    /轉來|转来/,
    /挪到|挪去|挪錢|挪钱|挪款/,
    /撥款|拨款|撥轉|拨转|調撥|调拨/,
    /搬錢|搬钱|搬款/,
    /移轉|过户|過戶/,
    /內轉|内转|互轉|互转/,
    /帳戶互轉|账户互转/,
    /\btransfer\b/i,
    /\bwire\b/i,
    /\bmove money\b/i,
    /\bsend money\b/i,
    /振込|送金|振替|口座間移動/,
  ])

  let hasBridgeBetweenMatchedAccounts = false
  if (matchedEntries.length >= 2) {
    for (let index = 0; index < matchedEntries.length - 1; index += 1) {
      const left = matchedEntries[index]
      const right = matchedEntries.find(
        (item, rightIndex) => rightIndex > index && item?.account?.id !== left?.account?.id,
      )
      if (!left || !right) continue

      const leftEnd = Number(left.index) + String(left.target ?? '').length
      const rightStart = Number(right.index)
      if (!Number.isFinite(leftEnd) || !Number.isFinite(rightStart) || rightStart <= leftEnd) continue

      const bridge = compact.slice(leftEnd, rightStart)
      if (/轉|匯|汇|到|至|給|→|->|=>|➡|挪|撥|拨|移|搬|to|from|transfer|wire|send|move|へ|から|振込|送金|振替/i.test(bridge)) {
        hasBridgeBetweenMatchedAccounts = true
        break
      }
    }
  }

  return hasDirectionalPhrase || hasTransferAction || hasBridgeBetweenMatchedAccounts
}
