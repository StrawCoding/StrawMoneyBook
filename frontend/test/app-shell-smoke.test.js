import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('app boot waits for account store readiness when ledgers already exist', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/ui/App.vue'), 'utf8')

  assert.match(source, /hasLedgers\.value && !accountStore\.ready/)
  assert.match(source, /const isBooting = computed/)
})
