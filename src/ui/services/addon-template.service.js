import { getSetting, setSetting } from '@/core/repositories/settings.repo'

const ADDON_TEMPLATE_KEY = 'transaction.addon_templates'
const LEDGER_SEED_LOCALE_KEY = 'app.seed_locale'
const SUPPORTED_SEED_LOCALES = ['zh-TW', 'en']

const DEFAULT_TEMPLATES_BY_LOCALE = {
  'zh-TW': [
    { id: 'discount', label: '優惠', defaultDirection: 'minus' },
    { id: 'fee', label: '手續費', defaultDirection: 'plus' },
    { id: 'shipping', label: '運費', defaultDirection: 'plus' },
    { id: 'tax', label: '稅金', defaultDirection: 'plus' },
    { id: 'rounding', label: '四捨五入調整', defaultDirection: 'plus' },
    { id: 'coupon', label: '折價券', defaultDirection: 'minus' },
  ],
  en: [
    { id: 'discount', label: 'Discount', defaultDirection: 'minus' },
    { id: 'fee', label: 'Fee', defaultDirection: 'plus' },
    { id: 'shipping', label: 'Shipping', defaultDirection: 'plus' },
    { id: 'tax', label: 'Tax', defaultDirection: 'plus' },
    { id: 'rounding', label: 'Rounding', defaultDirection: 'plus' },
    { id: 'coupon', label: 'Coupon', defaultDirection: 'minus' },
  ],
}

function normalizeSeedLocale(value) {
  const raw = String(value ?? '').trim()
  if (SUPPORTED_SEED_LOCALES.includes(raw)) return raw
  return 'zh-TW'
}

function normalizeTemplate(item, index, fallbackLabel = '附加項目') {
  const id = String(item?.id || `addon-${index + 1}`).trim()
  const label = String(item?.label || fallbackLabel).trim() || fallbackLabel
  const defaultDirection = item?.defaultDirection === 'minus' ? 'minus' : 'plus'
  return { id, label, defaultDirection }
}

export function getDefaultAddonTemplates(locale = 'zh-TW') {
  const seedLocale = normalizeSeedLocale(locale)
  const defaults = DEFAULT_TEMPLATES_BY_LOCALE[seedLocale] ?? DEFAULT_TEMPLATES_BY_LOCALE['zh-TW']
  return defaults.map((item) => ({ ...item }))
}

function normalizeTemplates(input, locale = 'zh-TW') {
  const source = Array.isArray(input) ? input : []
  const fallbackLabel = normalizeSeedLocale(locale) === 'en' ? 'Addon item' : '附加項目'
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
  if (!ledgerId) throw new Error('找不到當前帳本')
  const normalized = normalizeTemplates(templates)
  await setSetting(ledgerId, ADDON_TEMPLATE_KEY, normalized)
  return normalized
}
