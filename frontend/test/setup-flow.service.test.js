import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldShowWelcomePage } from '../src/ui/services/setup-flow.service.js'

test('shows welcome page when setup is incomplete on normal routes', () => {
  assert.equal(shouldShowWelcomePage({
    ready: true,
    allowWithoutSetup: false,
    hasLedgers: true,
    hasAccounts: false,
    routeName: 'home',
  }), true)
})

test('does not show welcome page on post-setup intro route', () => {
  assert.equal(shouldShowWelcomePage({
    ready: true,
    allowWithoutSetup: false,
    hasLedgers: true,
    hasAccounts: false,
    routeName: 'post-setup-intro',
  }), false)
})

test('does not show welcome page on routes explicitly allowed before setup', () => {
  assert.equal(shouldShowWelcomePage({
    ready: true,
    allowWithoutSetup: true,
    hasLedgers: false,
    hasAccounts: false,
    routeName: 'settings-account',
  }), false)
})
