import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/reimbursements/ReimbursementAdvanceManagementPage.vue'),
  'utf8',
)

test('advance management keeps partially used advances visible while blocking deletion', () => {
  assert.match(pageSource, /const visibleAdvances = computed\(\(\) => \{/)
  assert.match(pageSource, /Number\(item\?\.available_minor \?\? 0\)[\s\S]*> 0/)
  assert.match(pageSource, /:disabled="deletingAdvanceId === advance\.id \|\| !canDeleteAdvance\(advance\)"/)
  assert.match(pageSource, /function canDeleteAdvance\(advance\) \{[\s\S]*Number\(advance\?\.used_minor \?\? 0\)[\s\S]*<= 0/)
  assert.doesNotMatch(pageSource, /deletableAdvances/)
})
