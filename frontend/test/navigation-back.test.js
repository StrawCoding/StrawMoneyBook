import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  goBackOrFallback,
  resolveBackAnchorFallback,
} from '../src/ui/services/navigation-back.service.js'

test('goBackOrFallback replaces to explicit target when history.back leaves route unchanged', async () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    history: {
      state: { back: '/settings', current: '/settings/account' },
    },
  }
  try {
    const router = {
      currentRoute: { value: { path: '/settings/account' } },
      async back() {
        // Simulate a no-op browser back despite state.back being set.
      },
      async replace(target) {
        this.lastReplace = target
        this.currentRoute.value = { path: String(target).split('?')[0] }
      },
    }

    const result = await goBackOrFallback(router, '/settings')
    assert.equal(result, 'fallback')
    assert.equal(router.lastReplace, '/settings')
    assert.equal(router.currentRoute.value.path, '/settings')
  } finally {
    globalThis.window = originalWindow
  }
})

test('resolveBackAnchorFallback reads RouterLink href pathname', () => {
  const anchor = {
    getAttribute(name) {
      if (name === 'href') return '/budget/settings'
      return null
    },
  }
  assert.equal(resolveBackAnchorFallback(anchor, '/budget'), '/budget/settings')
})

test('app shell back anchor handler uses goBackOrFallback with href fallback', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/ui/composables/useAppShellRuntime.js'),
    'utf8',
  )
  assert.match(source, /resolveBackAnchorFallback/)
  assert.match(source, /goBackOrFallback\(router, fallback\)/)
  assert.doesNotMatch(source, /if \(!canNavigateBackInApp\(route\.fullPath\)\) return/)
})
