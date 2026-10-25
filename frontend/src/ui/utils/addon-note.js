import { translateMessage } from '@/ui/services/i18n.service.js'

export const ADDON_NOTE_PREFIX = '【附加項目】'

function resolveAddonNotePrefix() {
  return translateMessage('common.addon_section', ADDON_NOTE_PREFIX)
}

function addonPrefixOf(line) {
  const translated = resolveAddonNotePrefix()
  if (translated && line.startsWith(translated)) return translated
  if (line.startsWith(ADDON_NOTE_PREFIX)) return ADDON_NOTE_PREFIX
  return ''
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function formatAmount(value) {
  const rounded = round2(value)
  if (!Number.isFinite(rounded)) return '0'
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function normalizeDirection(direction) {
  return direction === 'minus' ? 'minus' : 'plus'
}

function parseSummaryLine(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => Boolean(addonPrefixOf(line)))
}

export function addonSummaryTextFromNote(note) {
  const rawLine = parseSummaryLine(note)
  if (!rawLine) return ''
  const prefix = addonPrefixOf(rawLine)
  return rawLine.slice(prefix.length).trim()
}

export function stripAddonSummaryFromNote(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !addonPrefixOf(line))
    .join('\n')
}

export function parseAddonItemsFromNote(note) {
  const summaryText = addonSummaryTextFromNote(note)
  if (!summaryText) return []

  return summaryText
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((segment) => {
      const matched = segment.match(/^(.+?)([+-])(\d+(?:\.\d+)?)$/)
      if (!matched) return null
      const [, label, sign, amountText] = matched
      const deltaMajor = round2(Math.abs(Number(amountText)))
      if (!deltaMajor) return null
      return {
        label: label.trim() || translateMessage('common.addon_item', '附加項目'),
        direction: sign === '-' ? 'minus' : 'plus',
        deltaMajor,
      }
    })
    .filter(Boolean)
}

export function addonDeltaMajorFromNote(note) {
  const items = parseAddonItemsFromNote(note)
  return round2(
    items.reduce((total, item) => {
      return total + (item.direction === 'minus' ? -item.deltaMajor : item.deltaMajor)
    }, 0),
  )
}

export function mergeAddonItemsToNote(currentNote, items) {
  const lines = String(currentNote ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !addonPrefixOf(line))

  const addonItemLabel = translateMessage('common.addon_item', '附加項目')
  const normalizedItems = (items ?? [])
    .map((item) => ({
      label: String(item.label ?? addonItemLabel).trim() || addonItemLabel,
      direction: normalizeDirection(item.direction),
      deltaMajor: round2(Math.abs(Number(item.deltaMajor ?? item.delta ?? 0))),
    }))
    .filter((item) => item.deltaMajor > 0)

  if (!normalizedItems.length) return lines.join('\n')

  const summary = normalizedItems
    .map((item) => `${item.label}${item.direction === 'minus' ? '-' : '+'}${formatAmount(item.deltaMajor)}`)
    .join('、')

  lines.push(`${resolveAddonNotePrefix()}${summary}`)
  return lines.join('\n')
}

export function addonDeltaTagText(note) {
  const deltaMajor = addonDeltaMajorFromNote(note)
  if (!deltaMajor) return ''
  return `${deltaMajor > 0 ? '+' : '-'}${formatAmount(Math.abs(deltaMajor))}`
}
