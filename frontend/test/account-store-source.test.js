import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/account.store.js'),
  'utf8',
)

test('account store ignores stale concurrent load results', () => {
  assert.match(source, /loadRequestSeq: 0/)
  assert.match(source, /const requestSeq = this\.loadRequestSeq \+ 1/)
  assert.match(source, /this\.loadRequestSeq = requestSeq/)
  assert.match(source, /if \(this\.loadRequestSeq !== requestSeq \|\| useLedgerStore\(\)\.activeLedgerId !== ledgerId\)/)
  assert.match(source, /if \(this\.loadRequestSeq === requestSeq\) \{[\s\S]*this\.loading = false/)
})
