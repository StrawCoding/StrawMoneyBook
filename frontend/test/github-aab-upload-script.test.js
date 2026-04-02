import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildGithubReleaseInfo,
  parseVersionCode,
} from '../scripts/upload-aab-to-github.mjs'
import {
  RELEASE_COMMIT_FILES,
  buildReleaseCommitMessage,
  commitAndPushAabRelease,
  findUnexpectedStagedFiles,
} from '../scripts/commit-aab-release.mjs'

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
)

test('aab script builds first and then uploads the artifact to GitHub', () => {
  assert.equal(
    packageJson.scripts['upload:aab:github'],
    'node scripts/upload-aab-to-github.mjs',
  )
  assert.equal(
    packageJson.scripts['release:git'],
    'node scripts/commit-aab-release.mjs',
  )
  assert.equal(
    packageJson.scripts['aab:build'],
    'npm run sync:app-update-manifest && npx vite build && npx cap sync android && cd android && ./gradlew bundleRelease && cd ..',
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

test('release git step uses the package version in the commit message and stages only release files', () => {
  assert.equal(buildReleaseCommitMessage('0.24.5'), 'chore(release): v0.24.5')
  assert.deepEqual(RELEASE_COMMIT_FILES, [
    'frontend/package.json',
    'frontend/package-lock.json',
    'frontend/android/app/build.gradle',
    'frontend/public/app-update.json',
  ])
  assert.deepEqual(
    findUnexpectedStagedFiles([
      'frontend/package.json',
      'frontend/src/ui/App.vue',
    ]),
    ['frontend/src/ui/App.vue'],
  )
})

test('release git step blocks unrelated staged files before creating the release commit', () => {
  const calls = []
  const gitRunner = (args) => {
    calls.push(args)
    if (args.join(' ') === 'diff --cached --name-only') {
      return { stdout: 'frontend/src/ui/App.vue\n' }
    }

    throw new Error(`Unexpected git call: ${args.join(' ')}`)
  }

  assert.throws(
    () => commitAndPushAabRelease({
      repoRoot: '/repo',
      frontendRoot: '/repo/frontend',
      gitRunner,
      ensureMainBranchFn: () => {},
      versionReader: () => '0.24.6',
    }),
    /Found staged changes outside release files: frontend\/src\/ui\/App\.vue/,
  )
  assert.deepEqual(calls, [['diff', '--cached', '--name-only']])
})

test('release git step commits only the release files and then pushes main', () => {
  const calls = []
  let diffAllCount = 0
  const gitRunner = (args) => {
    calls.push(args)
    const command = args.join(' ')
    if (command === 'diff --cached --name-only') {
      diffAllCount += 1
      if (diffAllCount === 1) {
        return { stdout: '' }
      }
      return {
        stdout: [
          'frontend/package.json',
          'frontend/public/app-update.json',
        ].join('\n'),
      }
    }
    if (command === `add -- ${RELEASE_COMMIT_FILES.join(' ')}`) {
      return { stdout: '' }
    }
    if (command === `diff --cached --name-only -- ${RELEASE_COMMIT_FILES.join(' ')}`) {
      return {
        stdout: [
          'frontend/package.json',
          'frontend/public/app-update.json',
        ].join('\n'),
      }
    }
    if (command === `commit -m chore(release): v0.24.6 -- ${RELEASE_COMMIT_FILES.join(' ')}`) {
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
      'frontend/public/app-update.json',
    ],
  })
  assert.deepEqual(calls, [
    ['diff', '--cached', '--name-only'],
    ['add', '--', ...RELEASE_COMMIT_FILES],
    ['diff', '--cached', '--name-only', '--', ...RELEASE_COMMIT_FILES],
    ['diff', '--cached', '--name-only'],
    ['commit', '-m', 'chore(release): v0.24.6', '--', ...RELEASE_COMMIT_FILES],
    ['push', 'origin', 'main'],
  ])
})
