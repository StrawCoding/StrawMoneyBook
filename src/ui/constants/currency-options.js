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

const VALID_CURRENCY_CODES = new Set(CURRENCY_OPTION_LIST.map(([code]) => code))

export const currencyOptions = CURRENCY_OPTION_LIST.map(([code, symbol]) => ({
  value: code,
  label: `${code} (${symbol})`,
}))

export function normalizeCurrencyCode(value, fallback = 'TWD') {
  const raw = String(value ?? '').trim().toUpperCase()
  if (VALID_CURRENCY_CODES.has(raw)) return raw
  return fallback
}
