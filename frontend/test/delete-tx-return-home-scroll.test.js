import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  clampScrollPosition,
  clearRememberedHomeScrollPosition,
  getRememberedHomeScrollPosition,
  normalizeScrollPosition,
  queueDeferredScrollRestore,
  rememberHomeScrollPosition,
  resetRouteScrollStateForTests,
  setNextScrollRestore,
} from '../src/ui/services/route-scroll.service.js'
import {
  isHomeRoute,
  isTransactionDetailOrEditPath,
  returnHomeAfterBookkeeping,
  returnHomeAfterTransactionDelete,
  returnHomeWithRememberedScroll,
} from '../src/ui/services/navigation-back.service.js'

test('scroll helpers normalize and clamp positions', () => {
  assert.deepEqual(normalizeScrollPosition({ left: -4, top: 120.7 }), { left: 0, top: 120.7 })
  assert.equal(normalizeScrollPosition(null), null)
  assert.deepEqual(clampScrollPosition({ left: 40, top: 900 }, 30, 400), { left: 30, top: 400 })
  assert.deepEqual(clampScrollPosition({ left: 10, top: 20 }, 100, 200), { left: 10, top: 20 })
})

test('home scroll memory and forced restore win over default top', () => {
  resetRouteScrollStateForTests()
  rememberHomeScrollPosition({ left: 0, top: 640 })
  assert.deepEqual(getRememberedHomeScrollPosition(), { left: 0, top: 640 })

  setNextScrollRestore(getRememberedHomeScrollPosition())
  const queued = queueDeferredScrollRestore({ left: 0, top: 0 })
  assert.deepEqual(queued, { left: 0, top: 640 })

  clearRememberedHomeScrollPosition()
  assert.equal(getRememberedHomeScrollPosition(), null)
  resetRouteScrollStateForTests()
})

test('transaction detail/edit path detection excludes tool routes', () => {
  assert.equal(isTransactionDetailOrEditPath('/transactions/abc'), true)
  assert.equal(isTransactionDetailOrEditPath('/transactions/abc/edit'), true)
  assert.equal(isTransactionDetailOrEditPath('/transactions/search'), false)
  assert.equal(isTransactionDetailOrEditPath('/transactions/quick-add'), false)
  assert.equal(isTransactionDetailOrEditPath('/transactions/calendar'), false)
  assert.equal(isTransactionDetailOrEditPath('/'), false)
  assert.equal(isHomeRoute('/'), true)
  assert.equal(isHomeRoute({ name: 'home', path: '/' }), true)
  assert.equal(isHomeRoute({ name: 'transaction-edit', path: '/transactions/x/edit' }), false)
})

test('returnHomeAfterTransactionDelete always replaces to home with scroll restore', async () => {
  resetRouteScrollStateForTests()
  rememberHomeScrollPosition({ left: 0, top: 512 })

  const calls = []
  const router = {
    currentRoute: { value: { name: 'transaction-edit', path: '/transactions/tx-1/edit' } },
    async replace(target) {
      calls.push(['replace', target])
      this.currentRoute.value = { name: 'home', path: '/' }
    },
    async back() {
      calls.push(['back'])
    },
  }

  const result = await returnHomeAfterTransactionDelete(router)
  assert.equal(result, 'replaced')
  assert.deepEqual(calls, [['replace', { name: 'home' }]])
  // Forced restore consumed by scrollBehavior-compatible queue.
  assert.deepEqual(queueDeferredScrollRestore({ left: 0, top: 0 }), { left: 0, top: 512 })
  resetRouteScrollStateForTests()
})

test('returnHomeAfterBookkeeping shares the home-with-scroll restore path', async () => {
  resetRouteScrollStateForTests()
  rememberHomeScrollPosition({ left: 0, top: 88 })
  const calls = []
  const router = {
    currentRoute: { value: { name: 'ai-auto-bookkeeping', path: '/ai-auto-bookkeeping' } },
    async replace(target) {
      calls.push(['replace', target])
      this.currentRoute.value = { name: 'home', path: '/' }
    },
    async back() {
      calls.push(['back'])
    },
  }
  const result = await returnHomeAfterBookkeeping(router)
  assert.equal(result, 'replaced')
  assert.deepEqual(calls, [['replace', { name: 'home' }]])
  assert.equal(returnHomeAfterBookkeeping, returnHomeWithRememberedScroll)
  assert.equal(returnHomeAfterTransactionDelete, returnHomeWithRememberedScroll)
  resetRouteScrollStateForTests()
})

test('returnHomeAfterTransactionDelete is a no-navigate restore when already home', async () => {
  resetRouteScrollStateForTests()
  rememberHomeScrollPosition({ left: 0, top: 220 })
  const calls = []
  const router = {
    currentRoute: { value: { name: 'home', path: '/' } },
    async replace(target) {
      calls.push(['replace', target])
    },
  }
  const result = await returnHomeAfterTransactionDelete(router)
  assert.equal(result, 'home')
  assert.deepEqual(calls, [])
  resetRouteScrollStateForTests()
})

test('transaction edit delete flow sources return home with scroll restore (smb292)', () => {
  const editSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/TransactionEditPage.vue'),
    'utf8',
  )
  const aboutSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/TransactionAboutPage.vue'),
    'utf8',
  )
  const feedSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionFeed.vue'),
    'utf8',
  )
  const sheetSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionEditSheet.vue'),
    'utf8',
  )
  const routerSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/router/index.js'),
    'utf8',
  )

  const confirmRemoveMatch = editSource.match(/async function confirmRemove\(\) \{[\s\S]*?\n\}/)
  assert.ok(confirmRemoveMatch, 'confirmRemove must exist')
  assert.match(confirmRemoveMatch[0], /returnHomeAfterTransactionDelete\(router\)/)
  assert.doesNotMatch(confirmRemoveMatch[0], /goBackOrFallback/)
  assert.match(editSource, /data-testid="transaction-edit-delete"/)
  assert.match(aboutSource, /returnHomeAfterTransactionDelete\(router\)/)
  assert.match(feedSource, /rememberHomeScrollPosition\(\)/)
  assert.match(sheetSource, /returnHomeAfterTransactionDelete\(router\)/)
  assert.match(routerSource, /rememberHomeScrollPosition\(\)/)
  assert.match(routerSource, /isHomeRoute\(from\) && !isHomeRoute\(to\)/)
})
