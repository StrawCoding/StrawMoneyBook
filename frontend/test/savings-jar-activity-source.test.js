import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/savings-jars/SavingsJarListPage.vue'),
  'utf8',
)

test('savings jar page surfaces recent activity rows and routes them to a standalone transaction detail page', () => {
  assert.doesNotMatch(source, /activityRows: jarActivityRowsById\.value\[String\(account\.id \?\? ''\)\] \?\? \[\]/)
  assert.doesNotMatch(source, /class="activity-section"/)
  assert.match(source, /function openSavingsJarDetail\(accountId\) \{/)
  assert.match(source, /void router\.push\(\{ name: 'account-detail', params: \{ id: normalizedAccountId \} \}\)\.catch\(\(\) => \{\}\)/)
  assert.match(source, /t\('savings_jar\.activity\.title'\)/)
})
