import { MESSAGES_ZH_TW } from '../src/ui/services/i18n/messages-zh-TW.js'
import { MESSAGES_EN } from '../src/ui/services/i18n/messages-en.js'
import { MESSAGES_JA } from '../src/ui/services/i18n/messages-ja.js'

const BASE_LOCALE = 'zh-TW'
const MESSAGES = {
  'zh-TW': MESSAGES_ZH_TW,
  en: MESSAGES_EN,
  ja: MESSAGES_JA,
}

function main() {
  const locales = Object.keys(MESSAGES).sort()
  if (!locales.includes(BASE_LOCALE)) {
    throw new Error(`缺少基準語言 ${BASE_LOCALE}`)
  }

  const baseKeys = Object.keys(MESSAGES[BASE_LOCALE] ?? {}).sort()
  const baseKeySet = new Set(baseKeys)
  let hasProblem = false

  console.log(`i18n audit: base=${BASE_LOCALE}, baseKeys=${baseKeys.length}, locales=${locales.join(', ')}`)
  for (const locale of locales) {
    const dictionary = MESSAGES[locale] ?? {}
    const localeKeys = Object.keys(dictionary)
    const missing = baseKeys.filter((key) => !(key in dictionary))
    const extra = localeKeys.filter((key) => !baseKeySet.has(key))
    const empty = localeKeys.filter((key) => String(dictionary[key] ?? '').trim() === '')

    const status = missing.length || extra.length || empty.length ? 'FAIL' : 'OK'
    console.log(`[${status}] ${locale} keys=${localeKeys.length} missing=${missing.length} extra=${extra.length} empty=${empty.length}`)

    if (missing.length) {
      hasProblem = true
      console.log(`  missing sample: ${missing.slice(0, 20).join(', ')}`)
    }
    if (extra.length) {
      hasProblem = true
      console.log(`  extra sample: ${extra.slice(0, 20).join(', ')}`)
    }
    if (empty.length) {
      hasProblem = true
      console.log(`  empty sample: ${empty.slice(0, 20).join(', ')}`)
    }
  }

  if (hasProblem) {
    process.exitCode = 1
    return
  }
  console.log('i18n audit passed')
}

try {
  main()
} catch (error) {
  console.error(`i18n audit failed: ${error?.message ?? error}`)
  process.exitCode = 1
}
