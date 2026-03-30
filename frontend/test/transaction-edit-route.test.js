import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)
const aboutSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionAboutPage.vue'),
  'utf8',
)
const editSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionEditPage.vue'),
  'utf8',
)

test('transaction edit page is routed as a standalone screen', () => {
  assert.match(routerSource, /name: 'transaction-edit'/)
  assert.match(routerSource, /path: '\/transactions\/:id\/edit'/)
  assert.match(aboutSource, /router\.push\(\{ name: 'transaction-edit', params: \{ id: tx\.id \} \}\)/)
})

test('transaction edit page reuses quick-add style structure for extra info and grouped selectors', () => {
  assert.match(editSource, /t\('common\.extra_info'\)/)
  assert.match(editSource, /t\('quick_add\.extra\.title'\)/)
  assert.match(editSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(editSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
  assert.match(editSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(editSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
})
