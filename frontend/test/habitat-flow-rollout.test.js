import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const frontendRoot = resolve(import.meta.dirname, '..')
const srcRoot = resolve(frontendRoot, 'src')
const habitatCss = readFileSync(resolve(srcRoot, 'ui/assets/css/habitat-ui.css'), 'utf8')

const featureRolloutPages = [
  'ui/views/loans/LoanListPage.vue',
  'ui/views/reimbursements/ReimbursementListPage.vue',
  'ui/views/claims/ClaimSheetListPage.vue',
]

const referencePages = [
  'ui/views/home.vue',
  'ui/views/analysis.vue',
  'ui/views/BudgetDisplayPage.vue',
  'ui/views/FeatureListPage.vue',
  'ui/views/settings.vue',
]

test('modern habitat CSS defines shared flow-section and subpage card flatten', () => {
  assert.match(habitatCss, /\.habitat-flow-section/)
  assert.match(habitatCss, /budget-display-page/)
  assert.match(habitatCss, /settings-page/)
  assert.match(habitatCss, /assets-page/)
})

test('feature hub list pages use habitat-flow-section instead of card panel blocks', () => {
  for (const rel of featureRolloutPages) {
    const source = readFileSync(resolve(srcRoot, rel), 'utf8')
    assert.match(source, /habitat-flow-section/, rel)
    assert.doesNotMatch(source, /class="card panel"/, rel)
  }
})

test('reference hub pages were not converted to habitat-flow-section markup', () => {
  for (const rel of referencePages) {
    const source = readFileSync(resolve(srcRoot, rel), 'utf8')
    assert.doesNotMatch(source, /habitat-flow-section/, rel)
  }
})
