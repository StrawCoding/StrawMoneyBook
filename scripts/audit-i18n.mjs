import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { RUNTIME_JA_MESSAGES_GENERATED } from '../src/ui/services/runtime-ja-messages.generated.js'

const I18N_FILE = path.resolve('src/ui/services/i18n.service.js')
const BASE_LOCALE = 'zh-TW'

function loadMessagesFromSource() {
  const source = fs.readFileSync(I18N_FILE, 'utf8')
  const start = source.indexOf('const MESSAGES =')
  const end = source.indexOf('\nconst localeRef', start)
  if (start < 0 || end < 0) {
    throw new Error('找不到 MESSAGES 定義區段')
  }

  const snippet = source.slice(start, end)
  const context = {
    RUNTIME_JA_MESSAGES_GENERATED,
  }
  vm.createContext(context)
  vm.runInContext(`${snippet}\nthis.__MESSAGES__ = MESSAGES`, context, { filename: I18N_FILE })
  return context.__MESSAGES__
}

function main() {
  const messages = loadMessagesFromSource()
  if (!messages || typeof messages !== 'object') {
    throw new Error('MESSAGES 解析失敗')
  }

  const locales = Object.keys(messages).sort()
  if (!locales.includes(BASE_LOCALE)) {
    throw new Error(`缺少基準語言 ${BASE_LOCALE}`)
  }

  const baseKeys = Object.keys(messages[BASE_LOCALE] ?? {}).sort()
  const baseKeySet = new Set(baseKeys)
  let hasMissing = false

  console.log(`i18n audit: base=${BASE_LOCALE}, baseKeys=${baseKeys.length}, locales=${locales.join(', ')}`)
  for (const locale of locales) {
    const dictionary = messages[locale] ?? {}
    const localeKeys = Object.keys(dictionary)
    const missing = baseKeys.filter((key) => !(key in dictionary))
    const extra = localeKeys.filter((key) => !baseKeySet.has(key))

    const status = missing.length ? 'FAIL' : 'OK'
    console.log(`[${status}] ${locale} keys=${localeKeys.length} missing=${missing.length} extra=${extra.length}`)

    if (missing.length) {
      hasMissing = true
      console.log(`  missing sample: ${missing.slice(0, 20).join(', ')}`)
    }
    if (extra.length) {
      console.log(`  extra sample: ${extra.slice(0, 20).join(', ')}`)
    }
  }

  if (hasMissing) {
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
