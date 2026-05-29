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

test('SMB-225 v1.2.50: counterparty detail header exposes 新增該對象借出 / 借入 二顆獨立按鈕', () => {
  // The header (the one with the export CSV button) now exposes two
  // dedicated buttons that pre-fill direction. The Tester explicitly asked
  // for this surface, not the single-loan detail page.
  assert.match(counterpartySource, /openCreateSheet\('lend'\)/)
  assert.match(counterpartySource, /openCreateSheet\('borrow'\)/)
  assert.match(counterpartySource, /新增該對象借出/)
  assert.match(counterpartySource, /新增該對象借入/)
  // Must still ship beside the existing 匯出 CSV button (same header row).
  assert.match(
    counterpartySource,
    /<button class="btn primary" @click="openCreateSheet\('lend'\)">新增該對象借出<\/button>[\s\S]{0,200}<button class="btn primary" @click="openCreateSheet\('borrow'\)">新增該對象借入<\/button>[\s\S]{0,200}@click="exportCsv"/,
  )
})

test('SMB-225 v1.2.50: openCreateSheet accepts directionOverride and locks it onto createForm.direction', () => {
  // The handler must accept a directionOverride argument and apply it to
  // createForm.direction without consulting the active tab when the
  // override is a known value. The legacy tab-based fallback stays for
  // safety (so a future no-argument caller still behaves reasonably).
  assert.match(
    counterpartySource,
    /function openCreateSheet\(directionOverride\)\s*\{[\s\S]*?directionOverride === 'borrow'[\s\S]*?'borrow'[\s\S]*?directionOverride === 'lend'[\s\S]*?'lend'[\s\S]*?createForm\.direction = normalizedDirection/,
  )
})

test('SMB-225 v1.2.50: counterparty detail header no longer renders the generic 新增借貸 single button', () => {
  // The single generic button is fully replaced by two direction-locked
  // ones; if someone re-introduces it the header layout/UX regresses.
  assert.doesNotMatch(counterpartySource, /<button class="btn primary" @click="openCreateSheet">新增借貸<\/button>/)
})

test('SMB-225 v1.2.50: loan detail (single-loan) page does NOT expose the misplaced quick-create buttons', () => {
  // The v1.2.49 attempt placed the quick-create on LoanDetailPage; Tester
  // reported this as the wrong location ("使用錯位置了"). Make sure that
  // surface stays clean so we don't ship duplicate / misleading entries.
  assert.doesNotMatch(loanDetailSource, /openCreateForSameCounterparty/)
  assert.doesNotMatch(loanDetailSource, /新增同對象借出/)
  assert.doesNotMatch(loanDetailSource, /新增同對象借入/)
  assert.doesNotMatch(loanDetailSource, /counterparty-actions/)
})
