import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const globalCssSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/global.css'),
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

test('global css exposes shared mobile overlay sheet primitives', () => {
  assert.match(globalCssSource, /\.app-overlay-sheet-mask \{/)
  assert.match(globalCssSource, /\.app-overlay-sheet-card \{/)
  assert.match(globalCssSource, /\.app-overlay-sheet-head \{/)
})

test('custom select switches to bottom sheet presentation on narrow viewports', () => {
  assert.match(customSelectSource, /const SHEET_VIEWPORT_MAX_WIDTH = 720/)
  assert.match(customSelectSource, /const useSheetPresentation = computed\(\(\) => viewportWidth\.value > 0 && viewportWidth\.value <= SHEET_VIEWPORT_MAX_WIDTH\)/)
  assert.match(customSelectSource, /<transition :name="useSheetPresentation \? 'overlay-fade' : 'popover-fade'">/)
  assert.match(customSelectSource, /class="app-overlay-sheet-mask"/)
  assert.match(customSelectSource, /class="menu card sheet app-bottom-sheet app-overlay-sheet-card menu-sheet"/)
  assert.match(customSelectSource, /class="app-bottom-sheet-body menu-sheet-body"/)
})

test('date time picker switches to bottom sheet presentation on narrow viewports', () => {
  assert.match(dateTimePickerSource, /const SHEET_VIEWPORT_MAX_WIDTH = 720/)
  assert.match(dateTimePickerSource, /const useSheetPresentation = computed\(\(\) => viewportWidth\.value > 0 && viewportWidth\.value <= SHEET_VIEWPORT_MAX_WIDTH\)/)
  assert.match(dateTimePickerSource, /<transition :name="useSheetPresentation \? 'overlay-fade' : 'popover-fade'">/)
  assert.match(dateTimePickerSource, /class="app-overlay-sheet-mask"/)
  assert.match(dateTimePickerSource, /class="panel card sheet app-bottom-sheet app-overlay-sheet-card panel-sheet"/)
  assert.match(dateTimePickerSource, /class="app-bottom-sheet-body panel-sheet-body"/)
})
