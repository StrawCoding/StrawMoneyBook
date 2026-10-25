import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { translateMessage } from '@/ui/services/i18n.service.js'

const ADDON_TEMPLATE_KEY = 'transaction.addon_templates'
const LEDGER_SEED_LOCALE_KEY = 'app.seed_locale'
const SUPPORTED_SEED_LOCALES = ['zh-TW', 'en']

const DEFAULT_TEMPLATE_DEFS = [
  { id: 'discount', key: 'addon.discount', fallback: '優惠', defaultDirection: 'minus' },
  { id: 'fee', key: 'addon.fee', fallback: '手續費', defaultDirection: 'plus' },
  { id: 'shipping', key: 'addon.shipping', fallback: '運費', defaultDirection: 'plus' },
  { id: 'tax', key: 'addon.tax', fallback: '稅金', defaultDirection: 'plus' },
  { id: 'rounding', key: 'addon.rounding', fallback: '四捨五入調整', defaultDirection: 'plus' },
  { id: 'coupon', key: 'addon.coupon', fallback: '折價券', defaultDirection: 'minus' },
]

function normalizeSeedLocale(value) {
  const raw = String(value ?? '').trim()
  if (SUPPORTED_SEED_LOCALES.includes(raw)) return raw
  return 'zh-TW'
}

function normalizeTemplate(item, index, fallbackLabel = translateMessage('common.addon_item', '附加項目')) {
  const id = String(item?.id || `addon-${index + 1}`).trim()
  const label = String(item?.label || fallbackLabel).trim() || fallbackLabel
  const defaultDirection = item?.defaultDirection === 'minus' ? 'minus' : 'plus'
  return { id, label, defaultDirection }
}

export function getDefaultAddonTemplates(locale = 'zh-TW') {
  normalizeSeedLocale(locale)
  return DEFAULT_TEMPLATE_DEFS.map((item) => ({
    id: item.id,
    label: translateMessage(item.key, item.fallback),
    defaultDirection: item.defaultDirection,
  }))
}

function normalizeTemplates(input, locale = 'zh-TW') {
  const source = Array.isArray(input) ? input : []
  const fallbackLabel = translateMessage('common.addon_item', '附加項目')
  const next = source
    .map((item, index) => normalizeTemplate(item, index, fallbackLabel))
    .filter((item, index, arr) => arr.findIndex((target) => target.id === item.id) === index)

  if (next.length) return next
  return getDefaultAddonTemplates(locale)
}

export async function loadAddonTemplates(ledgerId) {
  if (!ledgerId) return getDefaultAddonTemplates()
  const seedLocale = normalizeSeedLocale(await getSetting(ledgerId, LEDGER_SEED_LOCALE_KEY))
  const stored = await getSetting(ledgerId, ADDON_TEMPLATE_KEY)
  if (stored == null) {
    const defaults = getDefaultAddonTemplates(seedLocale)
    await setSetting(ledgerId, ADDON_TEMPLATE_KEY, defaults)
    return defaults
  }
  return normalizeTemplates(stored, seedLocale)
}

export async function getDefaultAddonTemplatesByLedger(ledgerId) {
  if (!ledgerId) return getDefaultAddonTemplates()
  const seedLocale = normalizeSeedLocale(await getSetting(ledgerId, LEDGER_SEED_LOCALE_KEY))
  return getDefaultAddonTemplates(seedLocale)
}

export async function saveAddonTemplates(ledgerId, templates) {
  if (!ledgerId) throw new Error(translateMessage('analysis_print.toast.no_ledger', '找不到當前帳本'))
  const normalized = normalizeTemplates(templates)
  await setSetting(ledgerId, ADDON_TEMPLATE_KEY, normalized)
  return normalized
}
