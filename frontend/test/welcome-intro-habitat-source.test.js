import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = resolve(import.meta.dirname, '..')
const welcomeSource = readFileSync(resolve(root, 'src/ui/views/WelcomePage.vue'), 'utf8')
const introSource = readFileSync(resolve(root, 'src/ui/views/PostSetupIntroPage.vue'), 'utf8')
const habitatCssSource = readFileSync(resolve(root, 'src/ui/assets/css/habitat-ui.css'), 'utf8')
const i18nSource = readI18nBundleSource()

test('welcome and post-setup intro use modern Habitat flow sections (no outer setup card)', () => {
  assert.match(welcomeSource, /hello-test-id="welcome-hello-block"/)
  assert.match(welcomeSource, /welcome\.habitat_hello/)
  assert.match(welcomeSource, /habitat-flow-section welcome-progress-section/)
  assert.match(welcomeSource, /habitat-flow-section welcome-step-section/)
  assert.doesNotMatch(welcomeSource, /class="card welcome-card"/)

  assert.match(introSource, /hello-test-id="post-setup-intro-hello"/)
  assert.match(introSource, /post_setup_intro\.habitat_hello/)
  assert.match(introSource, /habitat-flow-section intro-progress-section/)
  assert.match(introSource, /habitat-flow-section intro-slide-section/)
  assert.doesNotMatch(introSource, /class="card intro-card"/)
  assert.doesNotMatch(introSource, /radial-gradient/)

  assert.match(habitatCssSource, /\.welcome-modern \.habitat-flow-section/)
  assert.match(habitatCssSource, /\.intro-modern \.habitat-flow-section/)
  assert.match(i18nSource, /'welcome\.habitat_hello'/)
  assert.match(i18nSource, /'post_setup_intro\.habitat_hello'/)
})
