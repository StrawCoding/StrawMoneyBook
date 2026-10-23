import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')

export const NOTES_FILE_PATH = resolve(REPO_ROOT, 'release-notes.pending.md')
export const NOTES_HEADER = '# Pending Release Notes\n'
export const HISTORY_SEPARATOR = '---'
export const PLAY_CONSOLE_MAX_LENGTH = 500

function parseFile(filePath = NOTES_FILE_PATH) {
  if (!existsSync(filePath)) return { pending: '', history: '' }
  const content = readFileSync(filePath, 'utf8')
  const sepIndex = content.indexOf(`\n${HISTORY_SEPARATOR}\n`)
  if (sepIndex === -1) {
    return { pending: content, history: '' }
  }
  return {
    pending: content.slice(0, sepIndex),
    history: content.slice(sepIndex + 1),
  }
}

export function readValidNoteLines(filePath = NOTES_FILE_PATH) {
  const { pending } = parseFile(filePath)
  return pending
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (line.startsWith('#')) return false
      if (line.startsWith('<!--')) return false
      return true
    })
}

export function getReleaseNotesStatus(filePath = NOTES_FILE_PATH) {
  const content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const lineCount = readValidNoteLines(filePath).length
  const hasHistory = /(?:^|\n)## v\d/.test(content)
  const hasBareSeparator = /\n---\n/.test(content)
  const separatorTooEarly = lineCount === 0 && hasBareSeparator && !hasHistory

  return {
    exists: existsSync(filePath),
    lineCount,
    hasHistory,
    separatorTooEarly,
  }
}

export function validatePendingNotesStructure(filePath = NOTES_FILE_PATH, options = {}) {
  const requireHistory = Boolean(options.requireHistory)
  const exists = existsSync(filePath)
  const content = exists ? readFileSync(filePath, 'utf8') : ''
  const lineCount = exists ? readValidNoteLines(filePath).length : 0
  const hasVersionHistory = /(?:^|\n)## v\d/.test(content)
  const hasBareSeparator = /\n---\n/.test(content)

  if (!exists) {
    return {
      ok: false,
      exists: false,
      lineCount: 0,
      hasHistory: false,
      separatorTooEarly: false,
      message: 'release-notes.pending.md not found. Create the file before publishing.',
    }
  }

  if (lineCount === 0 && hasBareSeparator && !hasVersionHistory) {
    return {
      ok: false,
      exists: true,
      lineCount,
      hasHistory: false,
      separatorTooEarly: true,
      message: [
        'release-notes.pending.md has a --- separator but no pending bullet notes.',
        'Add `- ...` lines below the header and keep --- out of the file until gpr archives notes.',
      ].join(' '),
    }
  }

  if (requireHistory && !hasVersionHistory) {
    return {
      ok: false,
      exists: true,
      lineCount,
      hasHistory: false,
      separatorTooEarly: false,
      message: [
        'release-notes.pending.md is missing archived ## v* history.',
        'notes:clear / reset may only empty pending bullets; restore archived changelog from git.',
      ].join(' '),
    }
  }

  return {
    ok: true,
    exists: true,
    lineCount,
    hasHistory: hasVersionHistory,
    separatorTooEarly: false,
    message: lineCount === 0
      ? 'Pending release notes are empty (allowed, but consider documenting this release).'
      : `Found ${lineCount} pending release note line(s).`,
  }
}

export function formatForPlayConsole(lines, maxLength = PLAY_CONSOLE_MAX_LENGTH) {
  const joined = lines.join('\n')
  return joined.length <= maxLength ? joined : joined.slice(0, maxLength)
}

export function resetNotesFile(filePath = NOTES_FILE_PATH) {
  writeFileSync(filePath, NOTES_HEADER, 'utf8')
}

export function clearPendingNotesFile(filePath = NOTES_FILE_PATH) {
  const { history } = parseFile(filePath)
  writeFileSync(filePath, history ? `${NOTES_HEADER}\n${history.trimStart()}` : NOTES_HEADER, 'utf8')
}

export function archiveNotesFile(version, filePath = NOTES_FILE_PATH) {
  const lines = readValidNoteLines(filePath)
  const { history } = parseFile(filePath)

  if (lines.length === 0) {
    writeFileSync(filePath, history ? `${NOTES_HEADER}\n${history.trimStart()}` : NOTES_HEADER, 'utf8')
    return
  }

  const versionSection = `## v${version}\n${lines.map((l) => `- ${l.startsWith('- ') ? l.slice(2) : l}`).join('\n')}\n`

  const newHistory = history
    ? `${HISTORY_SEPARATOR}\n\n${versionSection}\n${history.slice(HISTORY_SEPARATOR.length + 1).trimStart()}`
    : `${HISTORY_SEPARATOR}\n\n${versionSection}`

  writeFileSync(filePath, `${NOTES_HEADER}\n${newHistory}`, 'utf8')
}

function runGit(args, repoRoot, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (allowFailure) return result
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(detail || `git ${args.join(' ')} failed`)
  }
  return result
}

function ensureMainBranch(repoRoot, gitRunner = runGit) {
  const result = gitRunner(['branch', '--show-current'], repoRoot)
  const branch = String(result.stdout ?? '').trim()
  if (branch !== 'main') {
    throw new Error(`Expected to run on main branch, got: ${branch || '(unknown)'}`)
  }
}

export function clearAndPushNotes({
  repoRoot = REPO_ROOT,
  notesFilePath = NOTES_FILE_PATH,
  gitRunner = runGit,
  ensureMainBranchFn = ensureMainBranch,
} = {}) {
  ensureMainBranchFn(repoRoot, gitRunner)
  clearPendingNotesFile(notesFilePath)
  gitRunner(['add', notesFilePath], repoRoot)

  const staged = String(
    gitRunner(['diff', '--cached', '--name-only'], repoRoot).stdout ?? '',
  ).trim()

  if (staged) {
    gitRunner(['commit', '-m', 'chore: reset pending release notes'], repoRoot)
  }

  gitRunner(['push', 'origin', 'main'], repoRoot)

  return { cleared: !!staged, pushed: true }
}

export function archiveAndPushNotes({
  version,
  repoRoot = REPO_ROOT,
  notesFilePath = NOTES_FILE_PATH,
  gitRunner = runGit,
  ensureMainBranchFn = ensureMainBranch,
} = {}) {
  if (!version) throw new Error('version is required for archiving notes')
  ensureMainBranchFn(repoRoot, gitRunner)
  archiveNotesFile(version, notesFilePath)
  gitRunner(['add', notesFilePath], repoRoot)

  const staged = String(
    gitRunner(['diff', '--cached', '--name-only'], repoRoot).stdout ?? '',
  ).trim()

  if (staged) {
    gitRunner(['commit', '-m', `chore: archive release notes for v${version}`], repoRoot)
  }

  gitRunner(['push', 'origin', 'main'], repoRoot)

  return { archived: !!staged, pushed: true }
}

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(resolve(FRONTEND_ROOT, 'package.json'), 'utf8'))
  return String(pkg.version ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node scripts/release-notes.mjs [--check | --archive | --clear]',
    '',
    '--check    Validate pending notes exist; empty pending is allowed when ## v* history is present',
    '--archive  Move pending notes into versioned history section (for patch releases)',
    '--clear    Clear pending bullets only; keep archived ## v* history',
  ].join('\n'))
}

function repoHasVersionTags(repoRoot = REPO_ROOT) {
  const result = spawnSync('git', ['tag', '--list', 'v*'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return Boolean(String(result.stdout || '').trim())
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  if (argv.includes('--check')) {
    console.log('[release-notes] Reading pending release notes...')
    const validation = validatePendingNotesStructure(NOTES_FILE_PATH, {
      requireHistory: repoHasVersionTags(),
    })
    if (!validation.ok) {
      console.error(`[release-notes] ERROR: ${validation.message}`)
      process.exitCode = 1
      return
    }
    if (validation.lineCount === 0) {
      console.warn(`[release-notes] WARNING: ${validation.message}`)
      return
    }
    console.log(`[release-notes] ${validation.message} Ready to publish.`)
    return
  }

  if (argv.includes('--archive')) {
    const version = readCurrentVersion()
    console.log(`[release-notes] Archiving pending release notes under v${version}...`)
    const result = archiveAndPushNotes({ version })
    if (result.archived) {
      console.log(`[release-notes] Archived and pushed release notes for v${version}.`)
    } else {
      console.log('[release-notes] Nothing to archive. Pushed without commit.')
    }
    return
  }

  if (argv.includes('--clear')) {
    console.log('[release-notes] Clearing pending release notes (keep archived history)...')
    const result = clearAndPushNotes()
    if (result.cleared) {
      console.log('[release-notes] Cleared and pushed release notes reset.')
    } else {
      console.log('[release-notes] File already empty. Pushed without commit.')
    }
    return
  }

  printHelp()
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === __filename

if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
