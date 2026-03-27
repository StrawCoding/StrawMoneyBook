import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/export.service.js'),
  'utf8',
)

test('loan export filename supports an optional scoped counterparty segment', () => {
  assert.match(source, /const safeScopeName = sanitizeFilenameSegment\(options\.scopeName \?\? ''\)/)
  assert.match(source, /const scopeSegment = safeScopeName \? `_\$\{safeScopeName\}` : ''/)
  assert.match(source, /filename: `\$\{safeLedgerName\}_loans\$\{scopeSegment\}_\$\{normalizedTab\}_\$\{normalizedScope\}_\$\{timestamp\}\.csv`/)
})
