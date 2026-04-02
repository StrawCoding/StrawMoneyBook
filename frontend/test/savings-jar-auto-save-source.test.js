import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/savings-jars/SavingsJarListPage.vue'),
  'utf8',
)

test('savings jar page exposes auto save summary and editor controls', () => {
  assert.match(source, /import DateTimePickerField from '@\/ui\/components\/common\/DateTimePickerField\.vue'/)
  assert.match(source, /import \{ createSavingsJar, deleteSavingsJar, deleteSavingsJarAutoSave, updateSavingsJar \} from '@\/core\/services\/savings-jar\.service'/)
  assert.match(source, /t\('savings_jar\.auto_save\.title'\)/)
  assert.match(source, /jarForm\.autoSaveEnabled/)
  assert.match(source, /jarForm\.autoSavePaused = !jarForm\.autoSavePaused/)
  assert.match(source, /await deleteSavingsJarAutoSave\(ledgerId, accountId\)/)
  assert.match(source, /autoSaveNextDueLabel/)
})
