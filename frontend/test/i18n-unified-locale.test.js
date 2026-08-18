import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MESSAGES_ZH_TW } from '../src/ui/services/i18n/messages-zh-TW.js'
import { MESSAGES_EN } from '../src/ui/services/i18n/messages-en.js'
import { MESSAGES_JA } from '../src/ui/services/i18n/messages-ja.js'
import {
  getLanguageEndonym,
  getSupportedLocales,
  resolveIntlLocale,
  setLocale,
  translateMessage,
  useI18n,
} from '../src/ui/services/i18n.service.js'

test('supported locales stay zh-TW / en / ja and language buttons use endonyms', () => {
  assert.deepEqual(getSupportedLocales(), ['zh-TW', 'en', 'ja'])
  assert.equal(getLanguageEndonym('zh-TW'), '繁體中文')
  assert.equal(getLanguageEndonym('en'), 'English')
  assert.equal(getLanguageEndonym('ja'), '日本語')

  for (const locale of getSupportedLocales()) {
    setLocale(locale)
    const { localeOptions } = useI18n()
    assert.deepEqual(
      localeOptions.value.map((item) => item.label),
      ['繁體中文', 'English', '日本語'],
    )
    assert.equal(translateMessage('language.zh-TW'), '繁體中文')
    assert.equal(translateMessage('language.en'), 'English')
    assert.equal(translateMessage('language.ja'), '日本語')
  }
  setLocale('zh-TW')
})

test('zh-TW / en / ja dictionaries have identical keys', () => {
  const zhKeys = Object.keys(MESSAGES_ZH_TW).sort()
  const enKeys = Object.keys(MESSAGES_EN).sort()
  const jaKeys = Object.keys(MESSAGES_JA).sort()
  const missingEn = zhKeys.filter((key) => !Object.hasOwn(MESSAGES_EN, key))
  const missingJa = zhKeys.filter((key) => !Object.hasOwn(MESSAGES_JA, key))
  const extraEn = enKeys.filter((key) => !Object.hasOwn(MESSAGES_ZH_TW, key))
  const extraJa = jaKeys.filter((key) => !Object.hasOwn(MESSAGES_ZH_TW, key))
  assert.deepEqual(missingEn, [])
  assert.deepEqual(missingJa, [])
  assert.deepEqual(extraEn, [])
  assert.deepEqual(extraJa, [])
})

test('resolveIntlLocale maps app locales to Intl locales', () => {
  assert.equal(resolveIntlLocale('zh-TW'), 'zh-TW')
  assert.equal(resolveIntlLocale('en'), 'en-US')
  assert.equal(resolveIntlLocale('ja'), 'ja-JP')
  assert.equal(resolveIntlLocale('fr'), 'zh-TW')
})

test('common chrome components no longer hardcode CJK defaults', () => {
  const files = [
    'src/ui/components/common/AppDialog.vue',
    'src/ui/components/common/InputBottomSheet.vue',
    'src/ui/components/common/CustomSelect.vue',
    'src/ui/components/common/DateTimePickerField.vue',
    'src/ui/components/common/TimePickerField.vue',
    'src/ui/components/common/LedgerSwitcher.vue',
  ]
  for (const relativePath of files) {
    const source = readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
    assert.match(source, /useI18n\(/)
    assert.doesNotMatch(source, /default: '取消'/)
    assert.doesNotMatch(source, /default: '關閉'/)
    assert.doesNotMatch(source, /default: '請選擇'/)
    assert.doesNotMatch(source, />關閉</)
    assert.doesNotMatch(source, /title="選擇日期"/)
    assert.doesNotMatch(source, /title="選擇帳本"/)
  }
})
