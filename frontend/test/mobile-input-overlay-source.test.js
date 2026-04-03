import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const globalCssSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/global.css'),
  'utf8',
)

const inputBottomSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/InputBottomSheet.vue'),
  'utf8',
)

const customSelectSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/CustomSelect.vue'),
  'utf8',
)

const dateTimePickerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/DateTimePickerField.vue'),
  'utf8',
)

const timePickerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/TimePickerField.vue'),
  'utf8',
)

const ledgerSwitcherSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/LedgerSwitcher.vue'),
  'utf8',
)

const homeRangePickerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/HomeRangePicker.vue'),
  'utf8',
)

test('global css exposes shared mobile overlay sheet primitives', () => {
  assert.match(globalCssSource, /\.app-overlay-sheet-mask \{/)
  assert.match(globalCssSource, /\.app-overlay-sheet-card \{/)
  assert.match(globalCssSource, /\.app-overlay-sheet-head \{/)
})

test('shared input bottom sheet owns overlay close logic and common primitives', () => {
  assert.match(inputBottomSheetSource, /class="app-overlay-sheet-mask"/)
  assert.match(inputBottomSheetSource, /class="card sheet app-bottom-sheet app-overlay-sheet-card"/)
  assert.match(inputBottomSheetSource, /class="row app-overlay-sheet-head"/)
  assert.match(inputBottomSheetSource, /class="app-bottom-sheet-body"/)
  assert.match(inputBottomSheetSource, /app:request-close-overlay/)
})

test('shared pickers and selectors now delegate to the shared bottom sheet only', () => {
  for (const source of [customSelectSource, dateTimePickerSource, timePickerSource, ledgerSwitcherSource, homeRangePickerSource]) {
    assert.match(source, /<InputBottomSheet/)
    assert.doesNotMatch(source, /popover-fade/)
    assert.doesNotMatch(source, /getBoundingClientRect/)
  }
})
