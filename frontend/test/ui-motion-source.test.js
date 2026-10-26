import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const uiRoot = resolve(import.meta.dirname, '../src/ui')
const read = (rel) => readFileSync(resolve(uiRoot, rel), 'utf8')

test('global motion-list and nested sheet overlay tokens exist', () => {
  const globalCss = readFileSync(resolve(import.meta.dirname, '../src/ui/assets/css/global.css'), 'utf8')
  assert.match(globalCss, /\.motion-list-enter-from/)
  assert.match(globalCss, /\.app-overlay-sheet-mask-nested/)
  assert.match(globalCss, /scale\(0\.97\)/)
  assert.match(globalCss, /\.app-overlay-sheet-card/)
})

test('InputBottomSheet uses appear on overlay transition', () => {
  const sheet = read('components/common/InputBottomSheet.vue')
  assert.match(sheet, /transition name="overlay-fade" appear/)
})

test('BottomNav active tab pop animation', () => {
  const nav = read('components/layout/BottomNav.vue')
  assert.match(nav, /nav-tab-pop/)
  assert.match(nav, /animation: nav-tab-pop/)
})

test('claim and reimbursement lists use motion-list TransitionGroup', () => {
  const claim = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
    'utf8',
  )
  const reimb = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/reimbursements/ReimbursementListPage.vue'),
    'utf8',
  )
  assert.match(claim, /TransitionGroup name="motion-list"/)
  assert.match(reimb, /TransitionGroup name="motion-list"/)
})

test('ToastHost leave uses distinct motion from enter', () => {
  const toast = read('components/common/ToastHost.vue')
  assert.match(toast, /\.toast-leave-to/)
  assert.match(toast, /translate3d\(0, 8px/)
})
