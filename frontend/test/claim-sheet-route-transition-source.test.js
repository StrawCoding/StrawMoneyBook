import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  assert.match(appSource, /function resolveRouteTransitionKey\(targetRoute\) \{/)
  assert.match(appSource, /const stableKey = String\(targetRoute\?\.meta\?\.transitionKey \?\? ''\)\.trim\(\)/)
  assert.match(appSource, /return stableKey \|\| String\(targetRoute\?\.fullPath \?\? ''\)/)
})

test('claim sheet list route uses a stable transition key', () => {
  assert.match(
    routerSource,
    /name: 'claim-sheets'[\s\S]*meta: \{ tab: 'home', transitionKey: 'claim-sheets' \}/,
  )
})
