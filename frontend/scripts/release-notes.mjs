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
export const PLAY_CONSOLE_MAX_LENGTH = 500

export function readValidNoteLines(filePath = NOTES_FILE_PATH) {
  if (!existsSync(filePath)) return []
  const content = readFileSync(filePath, 'utf8')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

export function formatForPlayConsole(lines, maxLength = PLAY_CONSOLE_MAX_LENGTH) {
  const joined = lines.join('\n')
  return joined.length <= maxLength ? joined : joined.slice(0, maxLength)
}

export function resetNotesFile(filePath = NOTES_FILE_PATH) {
  writeFileSync(filePath, NOTES_HEADER, 'utf8')
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
  resetNotesFile(notesFilePath)
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

function printHelp() {
  console.log([
    'Usage: node scripts/release-notes.mjs [--check | --clear]',
    '',
    '--check  Validate that release-notes.pending.md has content; exit 1 if empty',
    '--clear  Reset the file to header only and push the change',
  ].join('\n'))
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  if (argv.includes('--check')) {
    console.log('[release-notes] Reading pending release notes...')
    if (!existsSync(NOTES_FILE_PATH)) {
      console.error('[release-notes] ERROR: release-notes.pending.md not found. Create the file and add release notes before publishing.')
      process.exitCode = 1
      return
    }
    const lines = readValidNoteLines(NOTES_FILE_PATH)
    if (lines.length === 0) {
      console.error('[release-notes] WARNING: release-notes.pending.md is empty. Add release notes before publishing.')
      process.exitCode = 1
      return
    }
    console.log(`[release-notes] Found ${lines.length} release note line(s). Ready to publish.`)
    return
  }

  if (argv.includes('--clear')) {
    console.log('[release-notes] Clearing pending release notes after successful publish...')
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
