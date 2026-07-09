import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readFrontendVersion } from './commit-aab-release.mjs'
import { buildReleaseTag } from './create-release-tag.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(FRONTEND_ROOT, '..')

function runGit(args, repoRoot = REPO_ROOT, { allowFailure = false } = {}) {
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

export function listVersionTags(repoRoot = REPO_ROOT, gitRunner = runGit) {
  const output = String(
    gitRunner(['tag', '-l', 'v*', '--sort=-v:refname'], repoRoot).stdout ?? '',
  ).trim()
  return output ? output.split('\n').map((tag) => tag.trim()).filter(Boolean) : []
}

export function tagToVersion(tag) {
  return String(tag ?? '').trim().replace(/^v/, '')
}

export function readTaggedPackageVersion(tag, repoRoot = REPO_ROOT, gitRunner = runGit) {
  const output = String(
    gitRunner(['show', `${tag}:frontend/package.json`], repoRoot, { allowFailure: true }).stdout ?? '',
  ).trim()
  if (!output) return null
  const packageJson = JSON.parse(output)
  return String(packageJson.version ?? '').trim() || null
}

export function checkReleaseSync({
  repoRoot = REPO_ROOT,
  frontendRoot = FRONTEND_ROOT,
  gitRunner = runGit,
  versionReader = readFrontendVersion,
} = {}) {
  const packageVersion = versionReader(frontendRoot)
  const expectedTag = buildReleaseTag(packageVersion)
  const tags = listVersionTags(repoRoot, gitRunner)
  const latestTag = tags[0] ?? null
  const latestTagVersion = latestTag ? tagToVersion(latestTag) : null

  const tagExists = tags.includes(expectedTag)
  const taggedVersion = tagExists ? readTaggedPackageVersion(expectedTag, repoRoot, gitRunner) : null

  if (!latestTag) {
    return {
      ok: false,
      packageVersion,
      expectedTag,
      latestTag,
      message: 'No release tags found on main. Publish with: cd frontend && npm run gpr',
    }
  }

  if (packageVersion !== latestTagVersion) {
    return {
      ok: false,
      packageVersion,
      expectedTag,
      latestTag,
      message: [
        `frontend/package.json version (${packageVersion}) does not match latest git tag (${latestTag}).`,
        'Manual version bumps outside gpr leave GitHub Release / Play Store behind main.',
        'Fix: finish feature commits without touching version, then run: cd frontend && npm run gpr',
      ].join(' '),
    }
  }

  if (!tagExists) {
    return {
      ok: false,
      packageVersion,
      expectedTag,
      latestTag,
      message: `Missing git tag ${expectedTag} for package version ${packageVersion}. Run: cd frontend && npm run gpr`,
    }
  }

  if (taggedVersion !== packageVersion) {
    return {
      ok: false,
      packageVersion,
      expectedTag,
      latestTag,
      message: `Tag ${expectedTag} points to package.json version ${taggedVersion}, expected ${packageVersion}.`,
    }
  }

  return {
    ok: true,
    packageVersion,
    expectedTag,
    latestTag,
    message: `Release sync OK: package.json ${packageVersion} matches ${expectedTag}.`,
  }
}

function printHelp() {
  console.log([
    'Usage: node scripts/release-sync-check.mjs [--json]',
    '',
    'Ensures frontend/package.json version matches the latest v* git tag.',
    'Fails when version was bumped manually without npm run gpr.',
  ].join('\n'))
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  const result = checkReleaseSync()
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    console.log(`[release-sync] ${result.message}`)
  } else {
    console.error(`[release-sync] ERROR: ${result.message}`)
    process.exitCode = 1
  }
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
