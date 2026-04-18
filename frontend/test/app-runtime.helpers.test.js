import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAndroidBackDecision } from '../src/ui/services/app-runtime.helpers.js'

test('android back helper prefers in-app back, then fallback, then exit confirmation', () => {
  assert.deepEqual(
    resolveAndroidBackDecision({
      currentPath: '/transactions/search',
      canNavigateBack: () => true,
      resolveFallback: () => '/',
      shouldConfirmExit: () => false,
    }),
    { type: 'back' },
  )

  assert.deepEqual(
    resolveAndroidBackDecision({
      currentPath: '/transactions/search',
      canNavigateBack: () => false,
      resolveFallback: () => '/',
      shouldConfirmExit: () => false,
    }),
    { type: 'replace', path: '/' },
  )

  assert.deepEqual(
    resolveAndroidBackDecision({
      currentPath: '/',
      now: 5_000,
      lastBackPressedAt: 0,
      canNavigateBack: () => false,
      resolveFallback: () => '/',
      shouldConfirmExit: () => true,
    }),
    { type: 'confirm_exit', nextLastBackPressedAt: 5_000 },
  )

  assert.deepEqual(
    resolveAndroidBackDecision({
      currentPath: '/',
      now: 6_000,
      lastBackPressedAt: 5_000,
      canNavigateBack: () => false,
      resolveFallback: () => '/',
      shouldConfirmExit: () => true,
    }),
    { type: 'exit' },
  )
})
