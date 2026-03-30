import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoFillRulesPage.vue'),
  'utf8',
)

test('auto fill rule list uses whole-row navigation without edit/delete buttons', () => {
  assert.match(source, /<button type="button" class="rule-link" @click="goToEditPage\(rule\.id\)">/)
  assert.doesNotMatch(source, /removeRule\(/)
  assert.doesNotMatch(source, /t\('common\.edit'\)/)
  assert.doesNotMatch(source, /t\('common\.delete'\)/)
  assert.match(source, /name: 'settings-auto-fill-rule-edit'/)
})
