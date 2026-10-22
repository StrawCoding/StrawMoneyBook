import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (rel) => readFileSync(resolve(root, rel), 'utf8')

test('QuickAddPage blocks unset zero amount while preserving addon net-zero', () => {
  const source = read('src/ui/views/QuickAddPage.vue')
  assert.match(source, /settledAmountMinorRaw === 0/)
  assert.match(source, /baseAmountMinor <= 0/)
  assert.match(source, /appliedAddonItems\.some/)
  assert.match(source, /settledAmountMinorRaw < 0/)
  assert.match(source, /resolveBookkeepingSubmitErrorMessage/)
})

test('QuickAddPage exposes save buttons for Playwright', () => {
  const source = read('src/ui/views/QuickAddPage.vue')
  assert.match(source, /data-testid="quick-add-create"/)
  assert.match(source, /data-testid="quick-add-save-and-add"/)
})

test('AmountCalculatorInput highlights empty amount', () => {
  const source = read('src/ui/components/common/AmountCalculatorInput.vue')
  assert.match(source, /calc-trigger-empty/)
  assert.match(source, /hasPositiveAmount/)
})
