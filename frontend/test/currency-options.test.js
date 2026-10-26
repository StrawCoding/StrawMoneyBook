import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  currencyOptions,
  getCurrencyFlagEmoji,
  getCurrencyOption,
  regionCodeToFlagEmoji,
} from '../src/ui/constants/currency-options.js'

test('currency options include a flag emoji for each supported code', () => {
  assert.equal(currencyOptions.length, 14)
  for (const item of currencyOptions) {
    assert.match(item.flag, /\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/, item.value)
  }
  assert.equal(getCurrencyFlagEmoji('TWD'), regionCodeToFlagEmoji('TW'))
  assert.equal(getCurrencyFlagEmoji('USD'), regionCodeToFlagEmoji('US'))
  assert.equal(getCurrencyOption('JPY')?.label, 'JPY (¥)')
})

test('CustomSelect renders currency flags beside labels', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/ui/components/common/CustomSelect.vue'),
    'utf8',
  )
  assert.match(source, /option\.flag/)
  assert.match(source, /currency-flag/)
  assert.match(source, /flag: item\.flag/)
})
