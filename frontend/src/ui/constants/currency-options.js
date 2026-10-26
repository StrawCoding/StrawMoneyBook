const CURRENCY_OPTION_LIST = [
  ['TWD', 'NT$'],
  ['USD', '$'],
  ['EUR', '€'],
  ['JPY', '¥'],
  ['CNY', '¥'],
  ['HKD', 'HK$'],
  ['KRW', '₩'],
  ['SGD', 'S$'],
  ['MYR', 'RM'],
  ['THB', '฿'],
  ['VND', '₫'],
  ['GBP', '£'],
  ['AUD', 'A$'],
  ['CAD', 'C$'],
]

/** ISO 4217 → ISO 3166-1 alpha-2 for regional-indicator flag emoji. */
const CURRENCY_TO_REGION = {
  TWD: 'TW',
  USD: 'US',
  EUR: 'EU',
  JPY: 'JP',
  CNY: 'CN',
  HKD: 'HK',
  KRW: 'KR',
  SGD: 'SG',
  MYR: 'MY',
  THB: 'TH',
  VND: 'VN',
  GBP: 'GB',
  AUD: 'AU',
  CAD: 'CA',
}

const VALID_CURRENCY_CODES = new Set(CURRENCY_OPTION_LIST.map(([code]) => code))

export function regionCodeToFlagEmoji(regionCode) {
  const code = String(regionCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''
  const base = 0x1f1e6
  return [...code].map((char) => String.fromCodePoint(base + char.charCodeAt(0) - 65)).join('')
}

export function getCurrencyFlagEmoji(currencyCode) {
  const normalized = String(currencyCode ?? '').trim().toUpperCase()
  const region = CURRENCY_TO_REGION[normalized]
  return region ? regionCodeToFlagEmoji(region) : ''
}

export function normalizeCurrencyCode(value, fallback = 'TWD') {
  const raw = String(value ?? '').trim().toUpperCase()
  if (VALID_CURRENCY_CODES.has(raw)) return raw
  return fallback
}

export const currencyOptions = CURRENCY_OPTION_LIST.map(([code, symbol]) => ({
  value: code,
  label: `${code} (${symbol})`,
  flag: getCurrencyFlagEmoji(code),
}))

export function getCurrencyOption(currencyCode) {
  const code = normalizeCurrencyCode(currencyCode, '')
  if (!code) return null
  return currencyOptions.find((item) => item.value === code) ?? {
    value: code,
    label: code,
    flag: getCurrencyFlagEmoji(code),
  }
}
