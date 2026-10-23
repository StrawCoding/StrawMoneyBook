import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import {
  readValidNoteLines,
  getReleaseNotesStatus,
  validatePendingNotesStructure,
  formatForPlayConsole,
  resetNotesFile,
  clearAndPushNotes,
  clearPendingNotesFile,
  archiveNotesFile,
  archiveAndPushNotes,
  NOTES_HEADER,
  HISTORY_SEPARATOR,
  PLAY_CONSOLE_MAX_LENGTH,
} from '../scripts/release-notes.mjs'

function tempFile(content = '') {
  const dir = mkdtempSync(join(tmpdir(), 'strawmoneybook-notes-'))
  const filePath = join(dir, 'release-notes.pending.md')
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

test('readValidNoteLines returns empty array for missing file', () => {
  const result = readValidNoteLines('/nonexistent/release-notes.pending.md')
  assert.deepEqual(result, [])
})

test('readValidNoteLines returns empty array when file has only header', () => {
  const filePath = tempFile('# Pending Release Notes\n')
  assert.deepEqual(readValidNoteLines(filePath), [])
})

test('readValidNoteLines returns empty array when file is blank', () => {
  const filePath = tempFile('\n\n\n')
  assert.deepEqual(readValidNoteLines(filePath), [])
})

test('getReleaseNotesStatus allows an existing file with no pending note lines', () => {
  const filePath = tempFile('# Pending Release Notes\n')
  assert.deepEqual(getReleaseNotesStatus(filePath), {
    exists: true,
    lineCount: 0,
    hasHistory: false,
    separatorTooEarly: false,
  })
})

test('validatePendingNotesStructure rejects --- separator with no pending notes and no history', () => {
  const filePath = tempFile('# Pending Release Notes\n\n---\n')
  const validation = validatePendingNotesStructure(filePath)
  assert.equal(validation.ok, false)
  assert.match(validation.message, /Add `- \.\.\.` lines below the header/)
})

test('validatePendingNotesStructure rejects header-only file when history is required', () => {
  const filePath = tempFile('# Pending Release Notes\n')
  const validation = validatePendingNotesStructure(filePath, { requireHistory: true })
  assert.equal(validation.ok, false)
  assert.match(validation.message, /missing archived ## v\* history/)
})

test('validatePendingNotesStructure allows archived history with empty pending section', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '---',
    '',
    '## v1.3.50',
    '- archived note',
    '',
  ].join('\n'))
  const validation = validatePendingNotesStructure(filePath)
  assert.equal(validation.ok, true)
  assert.equal(validation.lineCount, 0)
  assert.equal(validation.hasHistory, true)
})

test('readValidNoteLines strips header lines and blank lines, returns content', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- 修正載具同步流程異常問題',
    '- 優化每日花費圖表分析顯示',
    '',
  ].join('\n'))

  assert.deepEqual(readValidNoteLines(filePath), [
    '- 修正載具同步流程異常問題',
    '- 優化每日花費圖表分析顯示',
  ])
})

test('formatForPlayConsole joins lines with newline', () => {
  const lines = ['- fix A', '- fix B']
  assert.equal(formatForPlayConsole(lines), '- fix A\n- fix B')
})

test('formatForPlayConsole truncates to PLAY_CONSOLE_MAX_LENGTH', () => {
  const long = Array.from({ length: 60 }, (_, i) => `- fix item ${i}`).join('\n')
  const lines = [long]
  const result = formatForPlayConsole(lines)
  assert.ok(result.length <= PLAY_CONSOLE_MAX_LENGTH)
})

test('formatForPlayConsole does not truncate content within limit', () => {
  const lines = ['- short note']
  assert.equal(formatForPlayConsole(lines), '- short note')
})

test('resetNotesFile writes header only', () => {
  const filePath = tempFile('# Pending Release Notes\n\n- old content\n')
  resetNotesFile(filePath)
  assert.equal(readFileSync(filePath, 'utf8'), NOTES_HEADER)
})

test('clearPendingNotesFile keeps archived history and only drops pending bullets', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- pending change',
    '',
    '---',
    '',
    '## v1.5.0',
    '- archived note',
    '',
  ].join('\n'))
  clearPendingNotesFile(filePath)
  const content = readFileSync(filePath, 'utf8')
  assert.deepEqual(readValidNoteLines(filePath), [])
  assert.match(content, /## v1\.5\.0/)
  assert.match(content, /- archived note/)
})

test('clearAndPushNotes resets pending bullets, stages, commits, and pushes', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- some change',
    '',
    '---',
    '',
    '## v1.5.0',
    '- archived note',
    '',
  ].join('\n'))
  const calls = []

  const gitRunner = (args) => {
    calls.push([...args])
    const cmd = args.join(' ')
    if (cmd === `add ${filePath}`) return { stdout: '' }
    if (cmd === 'diff --cached --name-only') return { stdout: filePath }
    if (cmd === 'commit -m chore: reset pending release notes') return { stdout: '' }
    if (cmd === 'push origin main') return { stdout: '' }
    throw new Error(`Unexpected git call: ${cmd}`)
  }

  const result = clearAndPushNotes({
    repoRoot: '/repo',
    notesFilePath: filePath,
    gitRunner,
    ensureMainBranchFn: () => {},
  })

  const content = readFileSync(filePath, 'utf8')
  assert.deepEqual(readValidNoteLines(filePath), [])
  assert.match(content, /## v1\.5\.0/)
  assert.deepEqual(result, { cleared: true, pushed: true })
  assert.deepEqual(calls, [
    ['add', filePath],
    ['diff', '--cached', '--name-only'],
    ['commit', '-m', 'chore: reset pending release notes'],
    ['push', 'origin', 'main'],
  ])
})

test('archiveNotesFile moves pending notes into history section', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- 修正載具同步',
    '- 優化圖表顯示',
    '',
  ].join('\n'))

  archiveNotesFile('1.1.7', filePath)

  const content = readFileSync(filePath, 'utf8')
  assert.ok(content.includes('## v1.1.7'))
  assert.ok(content.includes('- 修正載具同步'))
  assert.ok(content.includes('- 優化圖表顯示'))
  assert.ok(content.includes(HISTORY_SEPARATOR))
  // pending 區應該清空
  assert.deepEqual(readValidNoteLines(filePath), [])
})

test('archiveNotesFile accumulates multiple versions in history', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- v1.1.8 的改動',
    '',
    '---',
    '',
    '## v1.1.7',
    '- v1.1.7 的改動',
    '',
  ].join('\n'))

  archiveNotesFile('1.1.8', filePath)

  const content = readFileSync(filePath, 'utf8')
  assert.ok(content.includes('## v1.1.8'))
  assert.ok(content.includes('## v1.1.7'))
  // v1.1.8 應在 v1.1.7 之前（較新的在上方）
  assert.ok(content.indexOf('## v1.1.8') < content.indexOf('## v1.1.7'))
  assert.deepEqual(readValidNoteLines(filePath), [])
})

test('archiveNotesFile does not create an empty version section when pending notes are empty', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '---',
    '',
    '## v1.1.7',
    '- v1.1.7 的改動',
    '',
  ].join('\n'))

  archiveNotesFile('1.1.8', filePath)

  const content = readFileSync(filePath, 'utf8')
  assert.ok(!content.includes('## v1.1.8'))
  assert.ok(content.includes('## v1.1.7'))
  assert.deepEqual(readValidNoteLines(filePath), [])
})

test('archiveAndPushNotes stages, commits, and pushes', () => {
  const filePath = tempFile([
    '# Pending Release Notes',
    '',
    '- some fix',
    '',
  ].join('\n'))
  const calls = []

  const gitRunner = (args) => {
    calls.push([...args])
    const cmd = args.join(' ')
    if (cmd === `add ${filePath}`) return { stdout: '' }
    if (cmd === 'diff --cached --name-only') return { stdout: filePath }
    if (cmd === 'commit -m chore: archive release notes for v1.1.7') return { stdout: '' }
    if (cmd === 'push origin main') return { stdout: '' }
    throw new Error(`Unexpected git call: ${cmd}`)
  }

  const result = archiveAndPushNotes({
    version: '1.1.7',
    repoRoot: '/repo',
    notesFilePath: filePath,
    gitRunner,
    ensureMainBranchFn: () => {},
  })

  assert.deepEqual(result, { archived: true, pushed: true })
  assert.deepEqual(calls, [
    ['add', filePath],
    ['diff', '--cached', '--name-only'],
    ['commit', '-m', 'chore: archive release notes for v1.1.7'],
    ['push', 'origin', 'main'],
  ])
})

test('clearAndPushNotes skips commit when file was already empty', () => {
  const filePath = tempFile(NOTES_HEADER)
  const calls = []

  const gitRunner = (args) => {
    calls.push([...args])
    const cmd = args.join(' ')
    if (cmd === `add ${filePath}`) return { stdout: '' }
    if (cmd === 'diff --cached --name-only') return { stdout: '' }
    if (cmd === 'push origin main') return { stdout: '' }
    throw new Error(`Unexpected git call: ${cmd}`)
  }

  const result = clearAndPushNotes({
    repoRoot: '/repo',
    notesFilePath: filePath,
    gitRunner,
    ensureMainBranchFn: () => {},
  })

  assert.deepEqual(result, { cleared: false, pushed: true })
  assert.deepEqual(calls, [
    ['add', filePath],
    ['diff', '--cached', '--name-only'],
    ['push', 'origin', 'main'],
  ])
})
