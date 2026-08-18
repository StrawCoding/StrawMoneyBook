import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  convertAmountMinorByRate,
  convertBalanceToTargetCurrency,
  normalizeFxCurrencyCode,
  resolveCrossExchangeRate,
} from '../src/core/utils/fx-convert.js'
import { buildGroupSummaries } from '../src/ui/utils/account-group-summary.js'

test('normalizeFxCurrencyCode aliases NTD/RMB and keeps ISO codes', () => {
  assert.equal(normalizeFxCurrencyCode('ntd'), 'TWD')
  assert.equal(normalizeFxCurrencyCode('RMB'), 'CNY')
  assert.equal(normalizeFxCurrencyCode('CHF'), 'CHF')
  assert.equal(normalizeFxCurrencyCode('nope', 'USD'), 'USD')
})

test('resolveCrossExchangeRate converts via USD-quoted map', () => {
  const rates = { USD: 1, TWD: 32, JPY: 150 }
  assert.equal(resolveCrossExchangeRate(rates, 'TWD', 'TWD'), 1)
  assert.equal(resolveCrossExchangeRate(rates, 'USD', 'TWD'), 32)
  assert.equal(resolveCrossExchangeRate(rates, 'TWD', 'USD'), 1 / 32)
  assert.equal(resolveCrossExchangeRate(rates, 'USD', 'JPY'), 150)
  assert.equal(resolveCrossExchangeRate(rates, 'EUR', 'TWD'), null)
})

test('convertAmountMinorByRate rounds magnitude and rejects invalid rates', () => {
  assert.equal(convertAmountMinorByRate(10000, 32), 320000)
  assert.equal(convertAmountMinorByRate(-10000, 32), 320000)
  assert.equal(convertAmountMinorByRate(10000, 0), 0)
  assert.equal(convertAmountMinorByRate(10000, Number.NaN), 0)
  assert.equal(convertAmountMinorByRate(0, 32), 0)
})

test('convertBalanceToTargetCurrency preserves sign and falls back when rate missing', () => {
  const usdAccount = { currency_code: 'USD' }
  assert.equal(
    convertBalanceToTargetCurrency(10000, usdAccount, 'TWD', { USD: 1, TWD: 32 }),
    320000,
  )
  assert.equal(
    convertBalanceToTargetCurrency(-10000, usdAccount, 'TWD', { USD: 1, TWD: 32 }),
    -320000,
  )
  assert.equal(
    convertBalanceToTargetCurrency(10000, usdAccount, 'TWD', { USD: 1 }),
    10000,
  )
})

test('transaction input conversion matches group summary conversion', () => {
  const rates = { USD: 1, TWD: 32, CHF: 0.8 }
  const converted = convertAmountMinorByRate(
    2500,
    resolveCrossExchangeRate(rates, 'USD', 'TWD'),
  )
  const summary = buildGroupSummaries(
    [{ id: 'g', name: 'cash' }],
    [{
      id: 'a',
      group_id: 'g',
      currency_code: 'USD',
      include_in_group_statistics: 1,
    }],
    [{ id: 'a', balance_minor: 2500 }],
    { targetCurrencyCode: 'TWD', rates },
  )
  assert.equal(converted, 80000)
  assert.equal(summary[0].totalMinor, converted)
})

test('exchange-rate service re-exports the shared fx helpers', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/exchange-rate.service.js'),
    'utf8',
  )
  assert.match(source, /from '@\/core\/utils\/fx-convert\.js'/)
  assert.match(source, /export \{ convertAmountMinorByRate, resolveCrossExchangeRate \}/)
})

test('account-group-summary does not keep a private copy of fx conversion', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/ui/utils/account-group-summary.js'),
    'utf8',
  )
  assert.match(source, /from '\.\/fx-convert\.js'/)
  assert.doesNotMatch(source, /function resolveCrossExchangeRate/)
  assert.doesNotMatch(source, /function convertAmountMinorByRate/)
})
