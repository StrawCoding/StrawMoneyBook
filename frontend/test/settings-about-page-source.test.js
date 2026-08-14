import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const aboutPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAboutPage.vue'),
  'utf8',
)

const i18nSource = readI18nBundleSource()

const runtimeJaSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/runtime-ja-messages.generated.js'),
  'utf8',
)

test('settings about page exposes Instagram and Threads contact links', () => {
  assert.match(aboutPageSource, /key: 'facebook'[\s\S]*icon: 'fa-brands fa-facebook'/)
  assert.match(aboutPageSource, /key: 'instagram'/)
  assert.match(aboutPageSource, /icon: 'fa-brands fa-instagram'/)
  assert.match(aboutPageSource, /https:\/\/www\.instagram\.com\/strawmoneybook\//)
  assert.match(aboutPageSource, /key: 'threads'/)
  assert.match(aboutPageSource, /icon: 'fa-brands fa-threads'/)
  assert.match(aboutPageSource, /https:\/\/www\.threads\.com\/@strawmoneybook/)
})

test('settings about translations include Instagram and Threads in supported locales', () => {
  assert.match(i18nSource, /'settings_about\.instagram': 'Instagram'/)
  assert.match(i18nSource, /'settings_about\.instagram_value': '@strawmoneybook'/)
  assert.match(i18nSource, /'settings_about\.threads': 'Threads'/)
  assert.match(i18nSource, /'settings_about\.threads_value': '@strawmoneybook'/)
  assert.match(runtimeJaSource, /"settings_about\.instagram": "Instagram"/)
  assert.match(runtimeJaSource, /"settings_about\.threads": "Threads"/)
})
