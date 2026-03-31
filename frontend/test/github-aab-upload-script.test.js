import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildGithubReleaseInfo,
  parseVersionCode,
} from '../scripts/upload-aab-to-github.mjs'

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
)

test('aab script builds first and then uploads the artifact to GitHub', () => {
  assert.equal(
    packageJson.scripts['upload:aab:github'],
    'node scripts/upload-aab-to-github.mjs',
  )
  assert.equal(
    packageJson.scripts['aab:build'],
    'npm run sync:app-update-manifest && npx vite build && npx cap sync android && cd android && ./gradlew bundleRelease && cd ..',
  )
  assert.equal(
    packageJson.scripts.aab,
    'npm run aab:build && npm run upload:aab:github',
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
