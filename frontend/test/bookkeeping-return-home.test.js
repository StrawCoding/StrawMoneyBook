import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath) {
  return readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
}

test('manual and QnA bookkeeping success return home instead of going back to edit', () => {
  const quickAdd = read('src/ui/views/QuickAddPage.vue')
  const qna = read('src/ui/views/QnaBookkeepingPage.vue')
  const ai = read('src/ui/views/AiAutoBookkeepingPage.vue')
  const nav = read('src/ui/services/navigation-back.service.js')

  assert.match(nav, /export const returnHomeAfterBookkeeping = returnHomeWithRememberedScroll/)
  assert.match(quickAdd, /returnHomeAfterBookkeeping\(router\)/)
  assert.match(qna, /returnHomeAfterBookkeeping\(router\)/)
  assert.match(ai, /returnHomeAfterBookkeeping\(router\)/)
  assert.doesNotMatch(ai, /name:\s*'transaction-edit'/)

  const quickAddSubmit = quickAdd.match(/async function submit\([\s\S]*?\n\}/)
  assert.ok(quickAddSubmit, 'QuickAdd submit must exist')
  assert.match(quickAddSubmit[0], /returnHomeAfterBookkeeping\(router\)/)
  assert.doesNotMatch(quickAddSubmit[0], /await closePage\(\)/)

  const qnaSubmit = qna.match(/async function submit\([\s\S]*?\n\}/)
  assert.ok(qnaSubmit, 'QnA submit must exist')
  assert.match(qnaSubmit[0], /returnHomeAfterBookkeeping\(router\)/)
  assert.doesNotMatch(qnaSubmit[0], /await closePage\(\)/)
})
