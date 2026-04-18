import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveRouteTransitionKey } from '../src/ui/composables/app-shell-runtime.helpers.js'

const appSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/App.vue'),
  'utf8',
)

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)

test('app supports stable route transition keys for same-page state switches', () => {
  assert.match(appSource, /<component :is="Component" :key="resolveRouteTransitionKey\(route\)" \/>/)
  assert.equal(
    resolveRouteTransitionKey({
      meta: { transitionKey: 'loans' },
      fullPath: '/loans?status=closed',
    }),
    'loans',
  )
  assert.equal(
    resolveRouteTransitionKey({
      meta: { transitionKey: '' },
      fullPath: '/claim-sheets?status=draft',
    }),
    '/claim-sheets?status=draft',
  )
})

test('claim sheet list route uses a stable transition key', () => {
  assert.match(
    routerSource,
    /name: 'claim-sheets'[\s\S]*meta: \{ tab: 'home', transitionKey: 'claim-sheets' \}/,
  )
})

test('loan routes use stable transition keys for in-page query state switches', () => {
  assert.match(
    routerSource,
    /name: 'loans'[\s\S]*meta: \{ tab: 'home', transitionKey: 'loans' \}/,
  )
  assert.match(
    routerSource,
    /name: 'loan-counterparty-detail'[\s\S]*meta: \{ tab: 'home', transitionKey: 'loan-counterparty-detail' \}/,
  )
})
