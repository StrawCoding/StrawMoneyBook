import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/subscriptions/SubscriptionListPage.vue'),
  'utf8',
)

test('subscription list page uses custom date picker and custom pause checkbox UI', () => {
  assert.match(source, /<DateTimePickerField[\s\S]*:show-time="false"/)
  assert.match(source, /v-if="form\.intervalUnit === 'month'"/)
  assert.match(source, /subscription_page\.charge_day/)
  assert.match(source, /v-model\.trim="form\.note"/)
  assert.match(source, /subscription_page\.note_placeholder/)
  assert.match(source, /v-if="item\.note"/)
  assert.match(source, /class="switch-row subscription-toggle"/)
  assert.match(source, /role="checkbox"/)
  assert.match(source, /@click="form\.paused = !form\.paused"/)
  assert.match(source, /resolveSubscriptionNextChargeDate/)
})

test('subscription list page no longer exposes manual mark-paid actions', () => {
  assert.doesNotMatch(source, /@click="markPaid\(/)
  assert.doesNotMatch(source, /subscription_page\.mark_paid/)
  assert.match(source, /statusLabel\(item\)/)
  assert.match(source, /nextChargeLabel\(item\)/)
})
