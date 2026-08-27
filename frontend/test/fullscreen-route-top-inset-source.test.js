import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const appSource = read('src/ui/App.vue')
const routerSource = read('src/ui/router/index.js')
const bookkeepingSource = read('src/ui/views/BookkeepingPage.vue')
const playwrightSource = read('scripts/playwright-ui-layout.mjs')

function routeMetaBlock(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = routerSource.match(
    new RegExp(`path:\\s*'${escaped}'[\\s\\S]*?meta:\\s*\\{([^}]+)\\}`),
  )
  assert.ok(match, `router must declare ${path}`)
  return match[1]
}

test('fullscreen hideAppChrome keeps status-bar top inset on the app shell', () => {
  const fullScreenBlock = appSource.match(/\.app-shell\.full-screen-route\s*\{[\s\S]*?\}/)
  assert.ok(fullScreenBlock, 'App.vue must style .app-shell.full-screen-route')
  assert.match(
    fullScreenBlock[0],
    /padding-top:\s*calc\(10px \+ var\(--status-bar-height\)\)/,
    'fullscreen routes must keep the same top inset as chrome pages',
  )
  assert.match(fullScreenBlock[0], /padding-bottom:\s*0/)
  assert.doesNotMatch(
    fullScreenBlock[0],
    /padding-top:\s*0/,
    'must not zero padding-top on fullscreen routes (that eats the status-bar / notch reserved space)',
  )

  assert.match(appSource, /hideAppChrome/)
  assert.match(appSource, /v-if="hasLedgers && !isBooting && !showGuidedFlow && !hideAppChrome"/)
  assert.match(appSource, /<header v-if="!isBooting && !showGuidedFlow && !hideAppChrome" class="top-bar">/)
})

test('bookkeeping modes and related fullscreen pages hide chrome via route meta', () => {
  for (const path of [
    '/transactions/quick-add',
    '/transactions/qna',
    '/ai-auto-bookkeeping',
    '/transactions/:id/edit',
  ]) {
    assert.match(routeMetaBlock(path), /hideAppChrome:\s*true/, `${path} must hide app chrome`)
  }

  assert.match(bookkeepingSource, /data-testid="bookkeeping-page-header"/)
  assert.match(bookkeepingSource, /data-testid="bookkeeping-mode-toggle"/)
  assert.match(bookkeepingSource, /AiAutoBookkeepingPage/)
  assert.match(bookkeepingSource, /QnaBookkeepingPage/)
  assert.match(bookkeepingSource, /QuickAddPage/)
})

test('playwright ui-layout measures bookkeeping top inset from home FAB', () => {
  assert.match(playwrightSource, /assertFullscreenBookkeepingTopInset/)
  assert.match(playwrightSource, /data-testid=home-fab/)
  assert.match(playwrightSource, /--status-bar-height/)
  assert.match(playwrightSource, /bookkeeping-page-header/)
  assert.match(playwrightSource, /bookkeeping-mode-ai/)
  assert.match(playwrightSource, /bookkeeping-manual-qna/)
  assert.match(playwrightSource, /\/ai-auto-bookkeeping/)
  assert.match(playwrightSource, /\/transactions\/qna/)
  assert.match(playwrightSource, /transaction-edit-header/)
  assert.match(playwrightSource, /hiddenByStatusBar/)
})
