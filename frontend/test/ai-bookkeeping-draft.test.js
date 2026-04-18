import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAiBookkeepingNoteValue } from '../src/ui/services/ai-bookkeeping-draft.js'

test('resolveAiBookkeepingNoteValue keeps the parsed note when AI extracted one', () => {
  assert.equal(
    resolveAiBookkeepingNoteValue('原本備註', '朋友聚餐', {
      preserveCurrentWhenParsedEmpty: true,
    }),
    '朋友聚餐',
  )
})

test('resolveAiBookkeepingNoteValue preserves the current note during speech reparse when AI note is empty', () => {
  assert.equal(
    resolveAiBookkeepingNoteValue('原本備註', '', {
      preserveCurrentWhenParsedEmpty: true,
    }),
    '原本備註',
  )
})

test('resolveAiBookkeepingNoteValue clears the note when parsed note is empty outside preserve mode', () => {
  assert.equal(
    resolveAiBookkeepingNoteValue('原本備註', '', {
      preserveCurrentWhenParsedEmpty: false,
    }),
    '',
  )
})
