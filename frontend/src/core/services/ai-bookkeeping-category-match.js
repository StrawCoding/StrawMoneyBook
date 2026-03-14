function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function includesAny(text, patterns) {
  return (patterns ?? []).some((pattern) => {
    const cloned = new RegExp(pattern.source, pattern.flags)
    return cloned.test(text)
  })
}

function findAllPositions(text, needle) {
  const source = String(text ?? '')
  const target = String(needle ?? '').trim()
  if (!source || !target) return []
  const positions = []
  let index = source.indexOf(target)
  while (index >= 0) {
    positions.push(index)
    index = source.indexOf(target, index + 1)
  }
  return positions
}

function buildCompactIndexMap(text) {
  const source = String(text ?? '')
  const indexMap = []
  let compact = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (/\s/.test(char)) continue
    compact += char.toLowerCase()
    indexMap.push(index)
  }
  return { compact, indexMap }
}

function mapCompactRange(indexMap, start, length, sourceLength) {
  if (!indexMap.length) return { start: 0, end: 0 }
  const safeStart = Math.max(0, Math.min(start, indexMap.length - 1))
  const safeEnd = Math.max(safeStart, Math.min(start + length - 1, indexMap.length - 1))
  return {
    start: indexMap[safeStart],
    end: Math.min(sourceLength, indexMap[safeEnd] + 1),
  }
}

function isCjkText(value) {
  return /^[\u3400-\u9fff]+$/.test(String(value ?? ''))
}

function isGenericCategoryName(name) {
  return /^(其他|雜項|未分類|misc|other|その他)$/i.test(String(name ?? '').trim())
}

function pushAlias(aliases, seen, alias, matchType, baseConfidence) {
  const normalizedAlias = compactText(alias)
  if (!normalizedAlias) return
  if (matchType !== 'exact') {
    if (normalizedAlias.length < 2 && !(matchType === 'prefix' && isCjkText(normalizedAlias))) {
      return
    }
  }
  const key = `${matchType}:${normalizedAlias}`
  if (seen.has(key)) return
  seen.add(key)
  aliases.push({
    alias: normalizedAlias,
    matchType,
    baseConfidence,
  })
}

function buildCategoryAliases(name) {
  const target = compactText(name)
  if (!target) return []

  const aliases = []
  const seen = new Set()
  pushAlias(aliases, seen, target, 'exact', 0.92)

  const rawSegments = Array.from(
    new Set(
      String(name ?? '')
        .replace(/[()（）[\]【】]/g, ' ')
        .split(/[\s\-_/,.，。:：]+/)
        .map((item) => compactText(item))
        .filter(Boolean),
    ),
  )
  const segments = Array.from(new Set([target, ...rawSegments]))

  for (const segment of segments) {
    if (segment !== target) {
      pushAlias(aliases, seen, segment, 'segment', 0.82)
    }

    if (isCjkText(segment)) {
      if (segment.length <= 2) {
        pushAlias(aliases, seen, segment.slice(0, 1), 'prefix', 0.68)
        continue
      }

      for (let length = Math.min(3, segment.length - 1); length >= 2; length -= 1) {
        pushAlias(aliases, seen, segment.slice(0, length), 'prefix', 0.74)
        pushAlias(aliases, seen, segment.slice(segment.length - length), 'suffix', 0.7)
        for (let index = 1; index + length < segment.length; index += 1) {
          pushAlias(aliases, seen, segment.slice(index, index + length), 'inner', 0.66)
        }
      }

      pushAlias(aliases, seen, segment.slice(0, 1), 'prefix', 0.6)
      continue
    }

    for (let length = Math.min(5, segment.length - 1); length >= 3; length -= 1) {
      pushAlias(aliases, seen, segment.slice(0, length), 'prefix', 0.7)
      if (segment.length > length + 1) {
        pushAlias(aliases, seen, segment.slice(segment.length - length), 'suffix', 0.66)
      }
    }
  }

  return aliases
}

function buildAliasCountMap(categories) {
  const counts = new Map()
  for (const category of categories ?? []) {
    const name = String(category?.name ?? '').trim()
    if (!name) continue
    for (const entry of buildCategoryAliases(name)) {
      counts.set(entry.alias, (counts.get(entry.alias) ?? 0) + 1)
    }
  }
  return counts
}

function isBetterCandidate(next, current) {
  if (!current) return true
  if (Number(next?.confidence ?? 0) !== Number(current?.confidence ?? 0)) {
    return Number(next?.confidence ?? 0) > Number(current?.confidence ?? 0)
  }
  if (Number(next?.start ?? 0) !== Number(current?.start ?? 0)) {
    return Number(next?.start ?? 0) < Number(current?.start ?? 0)
  }
  return String(next?.alias ?? '').length > String(current?.alias ?? '').length
}

function compareCandidates(a, b) {
  if (Number(b?.confidence ?? 0) !== Number(a?.confidence ?? 0)) {
    return Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0)
  }
  if (Number(a?.start ?? 0) !== Number(b?.start ?? 0)) {
    return Number(a?.start ?? 0) - Number(b?.start ?? 0)
  }
  return String(b?.alias ?? '').length - String(a?.alias ?? '').length
}

function resolveAliasConfidence(aliasEntry, target, hasContext, isGeneric) {
  let confidence = Number(aliasEntry?.baseConfidence ?? 0.7)
  confidence += Math.min(String(aliasEntry?.alias ?? '').length, 4) * 0.025
  if (aliasEntry?.matchType === 'exact') {
    confidence += 0.03
  }
  if (hasContext) {
    confidence += 0.08
  }
  if (aliasEntry?.matchType === 'prefix' && String(aliasEntry?.alias ?? '').length === 1 && String(target ?? '').length > 2) {
    confidence -= 0.05
  }
  if (isGeneric) {
    confidence -= aliasEntry?.matchType === 'exact' ? 0.05 : 0.12
  }
  return clamp01(confidence)
}

export function collectCategoryTextMatchCandidates(text, categories, { contextPatterns = [] } = {}) {
  const sourceText = normalizeText(text)
  if (!sourceText) return []

  const { compact, indexMap } = buildCompactIndexMap(sourceText)
  if (!compact || !indexMap.length) return []

  const aliasCounts = buildAliasCountMap(categories)
  const bestByCategory = new Map()

  for (const category of categories ?? []) {
    const categoryId = String(category?.id ?? '').trim()
    const categoryName = String(category?.name ?? '').trim()
    if (!categoryName) continue

    const target = compactText(categoryName)
    const generic = isGenericCategoryName(categoryName)
    const bestKey = categoryId || target

    for (const aliasEntry of buildCategoryAliases(categoryName)) {
      if (aliasEntry.matchType !== 'exact' && Number(aliasCounts.get(aliasEntry.alias) ?? 0) !== 1) {
        continue
      }
      if (aliasEntry.alias.length === 1 && (!isCjkText(aliasEntry.alias) || generic)) {
        continue
      }

      const positions = findAllPositions(compact, aliasEntry.alias)
      for (const compactStart of positions) {
        const range = mapCompactRange(indexMap, compactStart, aliasEntry.alias.length, sourceText.length)
        const around = sourceText.slice(Math.max(0, range.start - 10), Math.min(sourceText.length, range.end + 10))
        const hasContext = includesAny(around, contextPatterns)
        const candidate = {
          category,
          categoryId,
          categoryName,
          alias: aliasEntry.alias,
          matchType: aliasEntry.matchType,
          start: range.start,
          end: range.end,
          confidence: resolveAliasConfidence(aliasEntry, target, hasContext, generic),
          hasContext,
        }

        const current = bestByCategory.get(bestKey)
        if (isBetterCandidate(candidate, current)) {
          bestByCategory.set(bestKey, candidate)
        }
      }
    }
  }

  return [...bestByCategory.values()].sort(compareCandidates)
}

export function pickBestCategoryTextMatch(text, categories, options = {}) {
  return collectCategoryTextMatchCandidates(text, categories, options)[0] ?? null
}
