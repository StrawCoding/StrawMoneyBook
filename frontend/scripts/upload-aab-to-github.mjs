import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FRONTEND_ROOT = resolve(__dirname, '..')

export function parseVersionCode(buildGradleSource) {
  const source = String(buildGradleSource ?? '')
  const directMatch = source.match(/versionCode\s+(\d+)/)
  if (directMatch) {
    const value = Number.parseInt(directMatch[1], 10)
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid versionCode: ${directMatch[1]}`)
    }

    return value
  }

  const fallbackMatch = source.match(/def\s+appVersionCode\s*=\s*resolveVersionCode\([^,]+,\s*(\d+)\)/)
  if (!fallbackMatch) {
    throw new Error('Cannot find `versionCode` in android/app/build.gradle')
  }

  const value = Number.parseInt(fallbackMatch[1], 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid versionCode: ${fallbackMatch[1]}`)
  }

  return value
}

export function buildGithubReleaseInfo({ version, versionCode, appName = 'StrawMoneyBook' }) {
  const normalizedVersion = String(version ?? '').trim()
  if (!normalizedVersion) {
    throw new Error('Package version is required')
  }

  const normalizedVersionCode = Number.parseInt(String(versionCode ?? ''), 10)
  if (!Number.isInteger(normalizedVersionCode) || normalizedVersionCode <= 0) {
    throw new Error('Android versionCode is required')
  }

  return {
    tag: `v${normalizedVersion}`,
    title: `v${normalizedVersion}`,
    assetFilename: `${appName}-v${normalizedVersion}-${normalizedVersionCode}.aab`,
    notes: [
      `Android AAB build for v${normalizedVersion}`,
      '',
      `- Version: ${normalizedVersion}`,
      `- VersionCode: ${normalizedVersionCode}`,
    ].join('\n'),
  }
}

export function findAabArtifact(rootDir = FRONTEND_ROOT) {
  const candidates = [
    resolve(rootDir, 'android/app/build/outputs/bundle/release/app-release.aab'),
    resolve(rootDir, 'android/app/build/outputs/bundle/release/app.aab'),
  ]

  const artifactPath = candidates.find((candidate) => existsSync(candidate))
  if (!artifactPath) {
    throw new Error('Cannot find built AAB artifact. Run `npm run aab:build` first.')
  }

  return artifactPath
}

export function prepareGithubAabUpload(rootDir = FRONTEND_ROOT) {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
  const buildGradleSource = readFileSync(resolve(rootDir, 'android/app/build.gradle'), 'utf8')
  const version = String(packageJson.version ?? '').trim()
  const versionCode = parseVersionCode(buildGradleSource)
  const release = buildGithubReleaseInfo({ version, versionCode })
  const artifactPath = findAabArtifact(rootDir)

  return {
    rootDir,
    version,
    versionCode,
    artifactPath,
    release,
  }
}

function runGh(args, rootDir, { allowFailure = false } = {}) {
  const result = spawnSync('gh', args, {
    cwd: rootDir,
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
    throw new Error(detail || `gh ${args.join(' ')} failed`)
  }

  return result
}

function ensureGhReady(rootDir) {
  runGh(['--version'], rootDir)
  const auth = runGh(['auth', 'status'], rootDir, { allowFailure: true })
  if (auth.error) {
    throw auth.error
  }
  if (auth.status !== 0) {
    const detail = String(auth.stderr || auth.stdout || '').trim()
    throw new Error(detail || 'GitHub CLI is not authenticated. Run `gh auth login` first.')
  }
}

export function uploadAabToGithubRelease(rootDir = FRONTEND_ROOT) {
  const context = prepareGithubAabUpload(rootDir)
  ensureGhReady(rootDir)

  const tempDir = mkdtempSync(join(tmpdir(), 'strawmoneybook-aab-'))
  const uploadPath = join(tempDir, context.release.assetFilename)

  try {
    copyFileSync(context.artifactPath, uploadPath)

    const releaseView = runGh(['release', 'view', context.release.tag], rootDir, { allowFailure: true })
    const releaseExists = !releaseView.error && releaseView.status === 0

    if (!releaseExists) {
      runGh([
        'release',
        'create',
        context.release.tag,
        uploadPath,
        '--title',
        context.release.title,
        '--notes',
        context.release.notes,
      ], rootDir)
      return context
    }

    runGh([
      'release',
      'upload',
      context.release.tag,
      uploadPath,
      '--clobber',
    ], rootDir)

    runGh([
      'release',
      'edit',
      context.release.tag,
      '--title',
      context.release.title,
      '--notes',
      context.release.notes,
    ], rootDir)

    return context
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function printHelp() {
  console.log([
    'Usage: node scripts/upload-aab-to-github.mjs [--dry-run]',
    '',
    'Reads the frontend package version and Android versionCode,',
    'then uploads the built release AAB to the matching GitHub release tag.',
  ].join('\n'))
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  if (argv.includes('--dry-run')) {
    const context = prepareGithubAabUpload(FRONTEND_ROOT)
    console.log(JSON.stringify({
      version: context.version,
      versionCode: context.versionCode,
      artifactPath: context.artifactPath,
      release: context.release,
    }, null, 2))
    return
  }

  const context = uploadAabToGithubRelease(FRONTEND_ROOT)
  console.log(`Uploaded ${context.release.assetFilename} to GitHub release ${context.release.tag}`)
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
