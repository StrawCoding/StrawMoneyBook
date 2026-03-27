import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const aiSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)
const quickAddSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/QuickAddPage.vue'),
  'utf8',
)
const customSelectSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/CustomSelect.vue'),
  'utf8',
)

test('AI bookkeeping and quick add use grouped account selectors', () => {
  assert.match(aiSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(aiSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(aiSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(aiSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)

  assert.match(quickAddSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(quickAddSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
  assert.match(quickAddSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(quickAddSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
})

test('CustomSelect keeps selected option group context visible', () => {
  assert.match(customSelectSource, /selectedOption\?\.groupName/)
  assert.match(customSelectSource, /normalizeOptions\(group\.options \?\? group\.categories \?\? \[\], groupName\)/)
})
