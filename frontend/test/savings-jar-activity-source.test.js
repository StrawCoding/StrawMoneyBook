import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/savings-jars/SavingsJarListPage.vue'),
  'utf8',
)

test('savings jar page surfaces recent activity rows and routes them to a standalone transaction detail page', () => {
  assert.match(source, /import \{ listTransactionsByAccount \} from '@\/core\/repositories\/transaction\.repo'/)
  assert.match(source, /activityRows: jarActivityRowsById\.value\[String\(account\.id \?\? ''\)\] \?\? \[\]/)
  assert.match(source, /\.filter\(\(item\) => String\(item\.account_id \?\? ''\)\.trim\(\) === jarId\)/)
  assert.match(source, /void router\.push\(\{ name: 'transaction-about', params: \{ id: txId \} \}\)\.catch\(\(\) => \{\}\)/)
  assert.match(source, /t\('claim_sheet\.view'\)/)
  assert.match(source, /t\('savings_jar\.activity\.title'\)/)
})
