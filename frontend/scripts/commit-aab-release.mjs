import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')

export const RELEASE_COMMIT_FILES = [
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/android/app/build.gradle',
  'frontend/public/app-update.json',
]

export function readFrontendVersion(frontendRoot = FRONTEND_ROOT) {
  const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
  const version = String(packageJson.version ?? '').trim()
  if (!version) {
    throw new Error('Package version is required')
  }

  return version
}

export function buildReleaseCommitMessage(version) {
  const normalizedVersion = String(version ?? '').trim()
  if (!normalizedVersion) {
    throw new Error('Package version is required')
  }

  return `chore(release): v${normalizedVersion}`
}

export function parseGitFileList(output) {
  return String(output ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function findUnexpectedStagedFiles(stagedFiles, releaseFiles = RELEASE_COMMIT_FILES) {
  const releaseFileSet = new Set(releaseFiles)
  return stagedFiles.filter((file) => !releaseFileSet.has(file))
}

function runGit(args, repoRoot, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (allowFailure) {
    return result
  }

  if (result.error) {
    throw result.error
  }

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

export function commitAndPushAabRelease({
  repoRoot = REPO_ROOT,
  frontendRoot = FRONTEND_ROOT,
  gitRunner = runGit,
  ensureMainBranchFn = ensureMainBranch,
  versionReader = readFrontendVersion,
} = {}) {
  const version = versionReader(frontendRoot)
  const commitMessage = buildReleaseCommitMessage(version)

  ensureMainBranchFn(repoRoot, gitRunner)

  const stagedBeforeAdd = parseGitFileList(
    gitRunner(['diff', '--cached', '--name-only'], repoRoot).stdout,
  )
  const unexpectedStagedBeforeAdd = findUnexpectedStagedFiles(stagedBeforeAdd)
  if (unexpectedStagedBeforeAdd.length > 0) {
    throw new Error(
      `Found staged changes outside release files: ${unexpectedStagedBeforeAdd.join(', ')}`,
    )
  }

  gitRunner(['add', '--', ...RELEASE_COMMIT_FILES], repoRoot)

  const stagedFiles = parseGitFileList(
    gitRunner(['diff', '--cached', '--name-only', '--', ...RELEASE_COMMIT_FILES], repoRoot).stdout,
  )
  const stagedAfterAdd = parseGitFileList(
    gitRunner(['diff', '--cached', '--name-only'], repoRoot).stdout,
  )
  const unexpectedStagedAfterAdd = findUnexpectedStagedFiles(stagedAfterAdd)
  if (unexpectedStagedAfterAdd.length > 0) {
    throw new Error(
      `Found staged changes outside release files: ${unexpectedStagedAfterAdd.join(', ')}`,
    )
  }

  if (stagedFiles.length > 0) {
    gitRunner(['commit', '-m', commitMessage, '--', ...RELEASE_COMMIT_FILES], repoRoot)
  }

  gitRunner(['push', 'origin', 'main'], repoRoot)

  return {
    version,
    commitMessage,
    committed: stagedFiles.length > 0,
    pushed: true,
    stagedFiles,
  }
}

function printHelp() {
  console.log([
    'Usage: node scripts/commit-aab-release.mjs [--dry-run]',
    '',
    'Stages the release version files, creates a versioned commit on main,',
    'then pushes to origin/main.',
  ].join('\n'))
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  if (argv.includes('--dry-run')) {
    const version = readFrontendVersion(FRONTEND_ROOT)
    console.log(JSON.stringify({
      version,
      commitMessage: buildReleaseCommitMessage(version),
      files: RELEASE_COMMIT_FILES.map((file) => relative(REPO_ROOT, resolve(REPO_ROOT, file))),
    }, null, 2))
    return
  }

  const result = commitAndPushAabRelease()
  console.log(JSON.stringify(result, null, 2))
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
