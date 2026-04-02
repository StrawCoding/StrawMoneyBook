import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readFrontendVersion } from './commit-aab-release.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')

export function buildReleaseTag(version) {
  const normalizedVersion = String(version ?? '').trim()
  if (!normalizedVersion) {
    throw new Error('Package version is required')
  }

  return `v${normalizedVersion}`
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

export function createAndPushReleaseTag({
  repoRoot = REPO_ROOT,
  frontendRoot = FRONTEND_ROOT,
  gitRunner = runGit,
  ensureMainBranchFn = ensureMainBranch,
  versionReader = readFrontendVersion,
} = {}) {
  const version = versionReader(frontendRoot)
  const tag = buildReleaseTag(version)

  ensureMainBranchFn(repoRoot, gitRunner)

  const existingTag = String(
    gitRunner(['tag', '--list', tag], repoRoot).stdout ?? '',
  ).trim()
  if (existingTag === tag) {
    throw new Error(`Tag already exists: ${tag}`)
  }

  gitRunner(['tag', tag], repoRoot)
  gitRunner(['push', 'origin', tag], repoRoot)

  return {
    version,
    tag,
    pushed: true,
  }
}

function printHelp() {
  console.log([
    'Usage: node scripts/create-release-tag.mjs [--dry-run]',
    '',
    'Reads the frontend package version, creates the matching git tag,',
    'then pushes the tag to origin so GitHub Actions can publish the release build.',
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
      tag: buildReleaseTag(version),
      repoRoot: relative(REPO_ROOT, REPO_ROOT) || '.',
    }, null, 2))
    return
  }

  const result = createAndPushReleaseTag()
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
