import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const cardSource = readFileSync(resolve(root, 'src/ui/components/home/HomeAssetSummaryCard.vue'), 'utf8')
const themeSource = readFileSync(resolve(root, 'src/ui/services/theme.service.js'), 'utf8')
const personalizationSource = readFileSync(
  resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'),
  'utf8',
)
const playwrightSource = readFileSync(resolve(root, 'scripts/playwright-ui-layout.mjs'), 'utf8')

test('home income/expense split cards use theme tokens instead of hard-coded dark backgrounds', () => {
  assert.match(cardSource, /data-testid="home-income-block"/)
  assert.match(cardSource, /data-testid="home-expense-block"/)
  assert.match(cardSource, /background:\s*var\(--home-income-card-bg\)/)
  assert.match(cardSource, /background:\s*var\(--home-expense-card-bg\)/)
  assert.doesNotMatch(cardSource, /#0a2015|#1f0a0a/)
  assert.match(cardSource, /var\(--home-income-card-value\)/)
  assert.match(cardSource, /var\(--home-expense-card-value\)/)
})

test('theme service sets distinct light and dark home income/expense card tokens', () => {
  assert.match(themeSource, /palette\.mode === 'light'/)
  assert.match(themeSource, /--home-income-card-bg',\s*'linear-gradient\(135deg, #DCFCE7/)
  assert.match(themeSource, /--home-expense-card-bg',\s*'linear-gradient\(135deg, #FEE2E2/)
  assert.match(themeSource, /--home-income-card-value',\s*'#2E7D32'/)
  assert.match(themeSource, /--home-expense-card-value',\s*'#C62828'/)
  assert.match(themeSource, /--home-income-card-bg',\s*'#1B2E1D'/)
  assert.match(themeSource, /--home-expense-card-bg',\s*'#321F1F'/)
})

test('personalization exposes theme scheme and save test ids for Playwright', () => {
  assert.match(personalizationSource, /data-testid="`theme-scheme-\$\{scheme\.id\}`"|theme-scheme-\$\{scheme\.id\}/)
  assert.match(personalizationSource, /data-testid="theme-save"/)
})

test('ui-layout Playwright asserts light and dark home income/expense blocks', () => {
  assert.match(playwrightSource, /assertHomeIncomeExpenseLightAndDark/)
  assert.match(playwrightSource, /morning-dew/)
  assert.match(playwrightSource, /home-income-block/)
  assert.match(playwrightSource, /home-expense-block/)
  assert.match(playwrightSource, /usesHardcodedDark/)
})
