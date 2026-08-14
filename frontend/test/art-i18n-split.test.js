import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { translateMessage, setLocale, getCurrentLocale } from '../src/ui/services/i18n.service.js'
import { MESSAGES_ZH_TW } from '../src/ui/services/i18n/messages-zh-TW.js'
import { MESSAGES_EN } from '../src/ui/services/i18n/messages-en.js'
import { MESSAGES_JA } from '../src/ui/services/i18n/messages-ja.js'
import { I18N_BUNDLE_RELATIVE_PATHS, readI18nBundleSource } from './helpers/i18n-source.js'

const servicesRoot = resolve(import.meta.dirname, '../src/ui/services')
const serviceSource = readFileSync(resolve(servicesRoot, 'i18n.service.js'), 'utf8')

test('ART-i18n-SPLIT: i18n.service stays a thin facade over locale modules', () => {
  assert.match(serviceSource, /from '\.\/i18n\/messages-zh-TW\.js'/)
  assert.match(serviceSource, /from '\.\/i18n\/messages-en\.js'/)
  assert.match(serviceSource, /from '\.\/i18n\/messages-ja\.js'/)
  assert.match(serviceSource, /from '\.\/i18n\/runtime-en-text\.js'/)
  assert.ok(statSync(resolve(servicesRoot, 'i18n.service.js')).size < 40_000)
  assert.doesNotMatch(serviceSource, /'common\.back': '返回'/)
  assert.ok(Object.keys(MESSAGES_ZH_TW).length > 500)
  assert.ok(Object.keys(MESSAGES_EN).length > 500)
  assert.ok(Object.keys(MESSAGES_JA).length > 500)
  assert.equal(MESSAGES_ZH_TW['common.back'], '返回')
  assert.equal(MESSAGES_EN['common.back'], 'Back')
})

test('ART-i18n-SPLIT: translateMessage still resolves zh-TW / en / ja', () => {
  setLocale('zh-TW')
  assert.equal(getCurrentLocale(), 'zh-TW')
  assert.equal(translateMessage('common.back'), '返回')
  setLocale('en')
  assert.equal(translateMessage('common.back'), 'Back')
  setLocale('ja')
  assert.ok(String(translateMessage('common.back')).length > 0)
  setLocale('zh-TW')
})

test('ART-i18n-SPLIT: source-gate helper concatenates locale modules', () => {
  const bundle = readI18nBundleSource()
  for (const relativePath of I18N_BUNDLE_RELATIVE_PATHS) {
    assert.ok(relativePath.includes('i18n'))
  }
  assert.match(bundle, /'common\.back': '返回'/)
  assert.match(bundle, /'common\.back': 'Back'/)
})
