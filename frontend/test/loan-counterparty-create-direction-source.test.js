import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const counterpartySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanCounterpartyDetailPage.vue'),
  'utf8',
)
const loanDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanDetailPage.vue'),
  'utf8',
)

test('SMB-225 v1.2.51: counterparty detail exposes 新增該對象借出 / 借入 二顆獨立按鈕 in a dedicated row', () => {
  // The Tester reported (v1.2.50) that the two buttons did not show up at
  // all — they were hidden because they sat inside `header.row.page-head`,
  // and the global iOS-nav CSS (`header.row:has(.back-btn)` in
  // global.css around line 519) collapses every non-back-btn child into
  // one shared grid cell on mobile. v1.2.51 moves the two primary buttons
  // OUT of the header into a dedicated `.counterparty-create-actions`
  // row that lives between the header and the summary panel, so the
  // global iOS-nav grid never touches them.
  assert.match(counterpartySource, /openCreateSheet\('lend'\)/)
  assert.match(counterpartySource, /openCreateSheet\('borrow'\)/)
  assert.match(counterpartySource, /t\('loans\.add_lend_for_person'\)/)
  assert.match(counterpartySource, /t\('loans\.add_borrow_for_person'\)/)

  // The buttons must live in `.counterparty-create-actions`, which itself
  // must be a SIBLING of (not a child of) `header.row.page-head`. We assert
  // both the structural placement and that the two buttons are inside it.
  assert.match(
    counterpartySource,
    /<\/header>\s*\n\s*<div class="row counterparty-create-actions">[\s\S]*?openCreateSheet\('lend'\)[\s\S]*?t\('loans\.add_lend_for_person'\)[\s\S]*?openCreateSheet\('borrow'\)[\s\S]*?t\('loans\.add_borrow_for_person'\)[\s\S]*?<\/div>/,
  )

  // The two buttons must NOT live inside `head-actions` anymore (otherwise
  // the iOS-nav grid will hide them again on mobile). We extract the
  // head-actions block (between its opening div tag and the FIRST closing
  // </div>) and assert it contains only exportCsv + back-btn — definitely
  // not openCreateSheet.
  const headActionsMatch = counterpartySource.match(
    /<div class="row head-actions">([\s\S]*?)<\/div>/,
  )
  assert.ok(headActionsMatch, 'head-actions block must exist')
  assert.doesNotMatch(headActionsMatch[1], /openCreateSheet/)
  assert.match(headActionsMatch[1], /@click="exportCsv"/)
  assert.match(headActionsMatch[1], /class="btn back-btn"/)
})

test('SMB-225 v1.2.51: .counterparty-create-actions CSS keeps buttons visible (mobile column / desktop row)', () => {
  // Source-level assertion that the dedicated row actually has the CSS
  // needed to render two buttons side-by-side on desktop and stack them
  // on narrow mobile widths — preventing a future regression where the
  // row exists but gets collapsed by a stray flex / grid override.
  assert.match(counterpartySource, /\.counterparty-create-actions\s*\{[\s\S]*?display:\s*flex/)
  assert.match(counterpartySource, /\.counterparty-create-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/)
  assert.match(counterpartySource, /\.counterparty-create-actions \.btn\s*\{[\s\S]*?flex:\s*1 1 200px/)
  assert.match(
    counterpartySource,
    /@media \(max-width: 480px\)\s*\{[\s\S]*?\.counterparty-create-actions\s*\{[\s\S]*?flex-direction:\s*column/,
  )
  // In column mode the button's `flex: 1 1 200px` must be reset to
  // `flex: 0 0 auto`, otherwise each button stretches to ~200px tall
  // on the main (vertical) axis and the row looks comically oversized
  // (caught by the v1.2.51 Playwright mobile screenshot).
  assert.match(
    counterpartySource,
    /@media \(max-width: 480px\)[\s\S]*?\.counterparty-create-actions \.btn\s*\{[\s\S]*?flex:\s*0 0 auto/,
  )
})

test('SMB-225 v1.2.51: openCreateSheet accepts directionOverride and locks it onto createForm.direction', () => {
  // The handler must accept a directionOverride argument and apply it to
  // createForm.direction without consulting the active tab when the
  // override is a known value. The legacy tab-based fallback stays for
  // safety (so a future no-argument caller still behaves reasonably).
  assert.match(
    counterpartySource,
    /function openCreateSheet\(directionOverride\)\s*\{[\s\S]*?directionOverride === 'borrow'[\s\S]*?'borrow'[\s\S]*?directionOverride === 'lend'[\s\S]*?'lend'[\s\S]*?createForm\.direction = normalizedDirection/,
  )
})

test('SMB-225 v1.2.51: counterparty detail header no longer renders the generic 新增借貸 single button', () => {
  // The single generic button is fully replaced by two direction-locked
  // ones; if someone re-introduces it the header layout/UX regresses.
  assert.doesNotMatch(counterpartySource, /<button class="btn primary" @click="openCreateSheet">新增借貸<\/button>/)
})

test('SMB-225 v1.2.51: loan detail (single-loan) page does NOT expose the misplaced quick-create buttons', () => {
  // The v1.2.49 attempt placed the quick-create on LoanDetailPage; Tester
  // reported this as the wrong location ("使用錯位置了"). Make sure that
  // surface stays clean so we don't ship duplicate / misleading entries.
  assert.doesNotMatch(loanDetailSource, /openCreateForSameCounterparty/)
  assert.doesNotMatch(loanDetailSource, /新增同對象借出/)
  assert.doesNotMatch(loanDetailSource, /新增同對象借入/)
  assert.doesNotMatch(loanDetailSource, /counterparty-actions/)
})
