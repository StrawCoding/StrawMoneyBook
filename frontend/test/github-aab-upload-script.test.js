import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildGithubReleaseInfo,
  parseVersionCode,
} from '../scripts/upload-aab-to-github.mjs'
import { stripUnusedFlatDirRepositories } from '../scripts/patch-android-flatdir-warning.mjs'
import {
  buildReleaseCommitMessage,
  commitAndPushAabRelease,
} from '../scripts/commit-aab-release.mjs'
import {
  buildReleaseTag,
  createAndPushReleaseTag,
} from '../scripts/create-release-tag.mjs'

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
)
const playReleaseWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/play-release.yml'),
  'utf8',
)
const ciWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/ci.yml'),
  'utf8',
)

test('aab script builds first and then uploads the artifact to GitHub', () => {
  assert.equal(
    packageJson.scripts.postinstall,
    'node scripts/patch-capacitor-sqlite-plugin.mjs && node scripts/patch-android-flatdir-warning.mjs',
  )
  assert.equal(
    packageJson.scripts['sync:android'],
    'npx cap sync android && node scripts/patch-android-flatdir-warning.mjs',
  )
  assert.equal(
    packageJson.scripts.gpr,
    'npm run bump:patch && npm run sync:app-update-manifest && npm run release:git && npm run release:tag',
  )
  assert.equal(
    packageJson.scripts['upload:aab:github'],
    'node scripts/upload-aab-to-github.mjs',
  )
  assert.equal(
    packageJson.scripts['release:git'],
    'node scripts/commit-aab-release.mjs',
  )
  assert.equal(
    packageJson.scripts['release:tag'],
    'node scripts/create-release-tag.mjs',
  )
  assert.equal(
    packageJson.scripts['aab:build'],
    'npm run sync:app-update-manifest && npx vite build && npm run sync:android && cd android && ./gradlew bundleRelease && cd ..',
  )
  assert.equal(
    packageJson.scripts.aab,
    'npm run aab:build && npm run upload:aab:github && npm run release:git',
  )
})

test('GitHub release metadata is derived from package version and Android versionCode', () => {
  const release = buildGithubReleaseInfo({ version: '0.23.7', versionCode: 170 })

  assert.equal(release.tag, 'v0.23.7')
  assert.equal(release.title, 'v0.23.7')
  assert.equal(release.assetFilename, 'StrawMoneyBook-v0.23.7-170.aab')
  assert.match(release.notes, /Android AAB build for v0\.23\.7/)
  assert.match(release.notes, /VersionCode: 170/)
})

test('parseVersionCode extracts Android versionCode from build.gradle', () => {
  assert.equal(parseVersionCode('versionCode 321\nversionName appVersionName'), 321)
})

test('parseVersionCode falls back to the configured appVersionCode default', () => {
  assert.equal(
    parseVersionCode('def appVersionCode = resolveVersionCode(ciVersionCode, 186)\nversionCode appVersionCode'),
    186,
  )
})

test('play release workflow creates a GitHub release after the Play upload', () => {
  assert.match(playReleaseWorkflow, /uses: actions\/checkout@v6/)
  assert.match(playReleaseWorkflow, /uses: actions\/setup-java@v5/)
  assert.match(playReleaseWorkflow, /uses: actions\/setup-node@v6/)
  assert.match(playReleaseWorkflow, /name: Setup Node 22/)
  assert.match(playReleaseWorkflow, /node-version:\s*"22"/)
  assert.match(playReleaseWorkflow, /permissions:\s*\n\s*contents:\s*write/)
  assert.match(playReleaseWorkflow, /name: Sync Capacitor Android/)
  assert.match(playReleaseWorkflow, /run: npm run sync:android/)
  assert.match(playReleaseWorkflow, /name: Prepare release paths/)
  assert.match(playReleaseWorkflow, /PLAY_JSON_KEY_PATH=\$RUNNER_TEMP\/play-service-account\.json/)
  assert.match(playReleaseWorkflow, /ANDROID_KEYSTORE_FILE=\$RUNNER_TEMP\/release-keystore\.jks/)
  assert.match(playReleaseWorkflow, /name: Resolve built AAB path/)
  assert.match(playReleaseWorkflow, /find app\/build\/outputs\/bundle -type f -name '\*\.aab'/)
  assert.match(playReleaseWorkflow, /echo "AAB_PATH=\$RESOLVED_AAB_PATH" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseWorkflow, /name: Publish GitHub Release/)
  assert.match(playReleaseWorkflow, /uses: softprops\/action-gh-release@v2/)
  assert.match(playReleaseWorkflow, /files:\s*\|?\s*\n\s*\$\{\{ github\.workspace \}\}\/frontend\/android\/\$\{\{ env\.AAB_PATH \}\}/)
})

test('android flatDir patch removes unused flatDir repositories but keeps other repos', () => {
  const source = `
repositories {
    google()
    mavenCentral()
    flatDir{
        dirs 'src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(dir: 'src/main/libs', include: ['*.jar'])
}
`

  const result = stripUnusedFlatDirRepositories(source)

  assert.doesNotMatch(result, /flatDir/)
  assert.match(result, /google\(\)/)
  assert.match(result, /mavenCentral\(\)/)
  assert.match(result, /implementation fileTree/)
})

test('ci workflow uses Node 24 compatible GitHub actions runtimes', () => {
  assert.match(ciWorkflow, /uses: actions\/checkout@v6/)
  assert.match(ciWorkflow, /uses: actions\/setup-node@v6/)
  assert.doesNotMatch(ciWorkflow, /actions\/checkout@v4/)
  assert.doesNotMatch(ciWorkflow, /actions\/setup-node@v4/)
})

test('release git step uses the package version in the commit message', () => {
  assert.equal(buildReleaseCommitMessage('0.24.5'), 'chore(release): v0.24.5')
})

test('release tag step uses the package version in the tag name', () => {
  assert.equal(buildReleaseTag('0.24.5'), 'v0.24.5')
})

test('release git step stages the whole repo, commits once, and then pushes main', () => {
  const calls = []
  let diffCount = 0
  const gitRunner = (args) => {
    calls.push(args)
    const command = args.join(' ')
    if (command === 'add -A') {
      return { stdout: '' }
    }
    if (command === 'diff --cached --name-only') {
      diffCount += 1
      if (diffCount === 1) {
        return {
          stdout: [
            'frontend/package.json',
            'frontend/scripts/commit-aab-release.mjs',
            'package.json',
          ].join('\n'),
        }
      }
      return {
        stdout: '',
      }
    }
    if (command === 'commit -m chore(release): v0.24.6') {
      return { stdout: '' }
    }
    if (command === 'push origin main') {
      return { stdout: '' }
    }

    throw new Error(`Unexpected git call: ${command}`)
  }

  const result = commitAndPushAabRelease({
    repoRoot: '/repo',
    frontendRoot: '/repo/frontend',
    gitRunner,
    ensureMainBranchFn: () => {},
    versionReader: () => '0.24.6',
  })

  assert.deepEqual(result, {
    version: '0.24.6',
    commitMessage: 'chore(release): v0.24.6',
    committed: true,
    pushed: true,
    stagedFiles: [
      'frontend/package.json',
      'frontend/scripts/commit-aab-release.mjs',
      'package.json',
    ],
  })
  assert.deepEqual(calls, [
    ['add', '-A'],
    ['diff', '--cached', '--name-only'],
    ['commit', '-m', 'chore(release): v0.24.6'],
    ['push', 'origin', 'main'],
  ])
})

test('release git step skips commit when the repo is already clean but still pushes main', () => {
  const calls = []
  const gitRunner = (args) => {
    calls.push(args)
    const command = args.join(' ')
    if (command === 'add -A' || command === 'push origin main') {
      return { stdout: '' }
    }
    if (command === 'diff --cached --name-only') {
      return { stdout: '' }
    }

    throw new Error(`Unexpected git call: ${command}`)
  }

  const result = commitAndPushAabRelease({
    repoRoot: '/repo',
    frontendRoot: '/repo/frontend',
    gitRunner,
    ensureMainBranchFn: () => {},
    versionReader: () => '0.24.6',
  })

  assert.deepEqual(result, {
    version: '0.24.6',
    commitMessage: 'chore(release): v0.24.6',
    committed: false,
    pushed: true,
    stagedFiles: [],
  })
  assert.deepEqual(calls, [
    ['add', '-A'],
    ['diff', '--cached', '--name-only'],
    ['push', 'origin', 'main'],
  ])
})

test('release tag step creates and pushes the matching version tag', () => {
  const calls = []
  const gitRunner = (args) => {
    calls.push(args)
    const command = args.join(' ')
    if (command === 'tag --list v0.24.6') {
      return { stdout: '' }
    }
    if (command === 'tag v0.24.6' || command === 'push origin v0.24.6') {
      return { stdout: '' }
    }

    throw new Error(`Unexpected git call: ${command}`)
  }

  const result = createAndPushReleaseTag({
    repoRoot: '/repo',
    frontendRoot: '/repo/frontend',
    gitRunner,
    ensureMainBranchFn: () => {},
    versionReader: () => '0.24.6',
  })

  assert.deepEqual(result, {
    version: '0.24.6',
    tag: 'v0.24.6',
    pushed: true,
  })
  assert.deepEqual(calls, [
    ['tag', '--list', 'v0.24.6'],
    ['tag', 'v0.24.6'],
    ['push', 'origin', 'v0.24.6'],
  ])
})

test('release tag step fails when the version tag already exists', () => {
  assert.throws(
    () =>
      createAndPushReleaseTag({
        repoRoot: '/repo',
        frontendRoot: '/repo/frontend',
        gitRunner: (args) => {
          if (args.join(' ') === 'tag --list v0.24.6') {
            return { stdout: 'v0.24.6\n' }
          }
          throw new Error(`Unexpected git call: ${args.join(' ')}`)
        },
        ensureMainBranchFn: () => {},
        versionReader: () => '0.24.6',
      }),
    /Tag already exists: v0\.24\.6/,
  )
})
