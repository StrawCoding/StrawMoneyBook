import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

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
import {
  REQUIRED_ANDROID_GENERATED_FILES,
  resolveAndroidPrepareMode,
} from '../scripts/prepare-android-release.mjs'
import { deriveVersionCodeFromVersionName } from '../scripts/android-versioning.mjs'

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
)
const playReleaseWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/play-release.yml'),
  'utf8',
)
const playReleaseFromGithubReleaseWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/play-release-from-github-release.yml'),
  'utf8',
)
const playProductionReleaseWorkflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/play-production-release.yml'),
  'utf8',
)
const fastlaneFastfile = readFileSync(
  resolve(import.meta.dirname, '../android/fastlane/Fastfile'),
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
    packageJson.scripts['prepare:android:release'],
    'node scripts/prepare-android-release.mjs',
  )
  assert.equal(
    packageJson.scripts['copy:android'],
    'npx cap copy android && node scripts/patch-android-flatdir-warning.mjs',
  )
  assert.equal(
    packageJson.scripts['sync:android'],
    'npx cap sync android && node scripts/patch-android-flatdir-warning.mjs',
  )
  assert.equal(
    packageJson.scripts['notes:check'],
    'node scripts/release-notes.mjs --check',
  )
  assert.equal(
    packageJson.scripts['notes:clear'],
    'node scripts/release-notes.mjs --clear',
  )
  assert.equal(
    packageJson.scripts['notes:archive'],
    'node scripts/release-notes.mjs --archive',
  )
  assert.equal(
    packageJson.scripts['release:sync-check'],
    'node scripts/release-sync-check.mjs',
  )
  assert.equal(
    packageJson.scripts['closeout:pre'],
    'npm run notes:check && npm run release:sync-check',
  )
  assert.equal(
    packageJson.scripts['closeout:verify'],
    'npm run test:node && npm run build:web && npm run closeout:pre',
  )
  assert.equal(
    packageJson.scripts.gpr,
    'npm run notes:check && npm run bump:patch && npm run sync:app-update-manifest && npm run sync:official-site-app-update:push && npm run release:git && npm run release:tag && npm run notes:archive',
  )
  assert.equal(
    packageJson.scripts['gpr:minor'],
    'npm run notes:check && npm run bump:minor && npm run sync:app-update-manifest && npm run sync:official-site-app-update:push && npm run release:git && npm run release:tag && npm run notes:clear',
  )
  assert.equal(packageJson.scripts['bump:android:versionCode'], undefined)
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
    packageJson.scripts.preaab,
    'npm run bump:patch && npm run sync:app-update-manifest',
  )
  assert.equal(
    packageJson.scripts['aab:build'],
    'npm run sync:app-update-manifest && npx vite build && npm run prepare:android:release && cd android && ./gradlew bundleRelease && cd ..',
  )
  assert.equal(
    packageJson.scripts['aab:build:prepared'],
    'npx vite build && npm run prepare:android:release && cd android && ./gradlew bundleRelease && cd ..',
  )
  assert.equal(
    packageJson.scripts.aab,
    'npm run aab:build:prepared && npm run release:git && npm run upload:aab:github',
  )
})

test('android release prep uses copy when generated capacitor files already exist', () => {
  const frontendRoot = mkdtempSync(join(tmpdir(), 'strawmoneybook-android-release-'))

  for (const relativePath of REQUIRED_ANDROID_GENERATED_FILES) {
    const absolutePath = resolve(frontendRoot, relativePath)
    mkdirSync(resolve(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, '// generated for test\n')
  }

  const mode = resolveAndroidPrepareMode(frontendRoot)

  assert.equal(mode.mode, 'copy')
  assert.deepEqual(mode.missingFiles, [])
})

test('android release prep falls back to sync when generated capacitor files are missing', () => {
  const mode = resolveAndroidPrepareMode('/tmp/does-not-have-generated-capacitor-files')

  assert.equal(mode.mode, 'sync')
  assert.deepEqual(
    mode.missingFiles,
    REQUIRED_ANDROID_GENERATED_FILES,
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

test('deriveVersionCodeFromVersionName maps semver to a monotonic Play versionCode', () => {
  assert.equal(deriveVersionCodeFromVersionName('0.24.32'), 1024032)
  assert.equal(deriveVersionCodeFromVersionName('1.2.3-beta.1'), 2002003)
})

test('parseVersionCode derives Android versionCode from versionName when build.gradle uses the shared strategy', () => {
  assert.equal(
    parseVersionCode(
      'def defaultVersionCode = deriveVersionCodeFromVersionName(appVersionName, 1)\ndef appVersionCode = resolveVersionCode(ciVersionCode, defaultVersionCode)\nversionCode appVersionCode',
      '0.24.32',
    ),
    1024032,
  )
})

test('parseVersionCode keeps supporting explicit fallback numbers for older build.gradle sources', () => {
  assert.equal(
    parseVersionCode('def appVersionCode = resolveVersionCode(ciVersionCode, 187)\nversionCode appVersionCode'),
    187,
  )
})

test('play release workflow builds the AAB, publishes the GitHub release, and publishes Google Play closed testing', () => {
  assert.match(playReleaseWorkflow, /name: Play Closed Testing Release/)
  assert.match(playReleaseWorkflow, /concurrency:\s*\n\s*group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/)
  assert.match(playReleaseWorkflow, /cancel-in-progress:\s*true/)
  assert.match(playReleaseWorkflow, /uses: actions\/checkout@v6/)
  assert.match(playReleaseWorkflow, /uses: ruby\/setup-ruby@v1/)
  assert.match(playReleaseWorkflow, /uses: actions\/setup-java@v5/)
  assert.match(playReleaseWorkflow, /uses: actions\/setup-node@v6/)
  assert.match(playReleaseWorkflow, /uses: gradle\/actions\/setup-gradle@v5/)
  assert.match(playReleaseWorkflow, /name: Setup Node 22/)
  assert.match(playReleaseWorkflow, /NODE_VERSION:\s*"22"/)
  assert.match(playReleaseWorkflow, /JAVA_VERSION:\s*"21"/)
  assert.match(playReleaseWorkflow, /RUBY_VERSION:\s*"3\.2"/)
  assert.match(playReleaseWorkflow, /ANDROID_PACKAGE_NAME:\s*\$\{\{ secrets\.ANDROID_PACKAGE_NAME \}\}/)
  assert.match(playReleaseWorkflow, /PLAY_CLOSED_TESTING_TRACK:\s*\$\{\{ vars\.PLAY_CLOSED_TESTING_TRACK \|\| 'alpha' \}\}/)
  assert.match(playReleaseWorkflow, /PLAY_WEAR_CLOSED_TESTING_TRACK:\s*\$\{\{ vars\.PLAY_WEAR_CLOSED_TESTING_TRACK \|\| 'wear:alpha' \}\}/)
  assert.match(playReleaseWorkflow, /node-version:\s*\$\{\{ env\.NODE_VERSION \}\}/)
  assert.match(playReleaseWorkflow, /java-version:\s*\$\{\{ env\.JAVA_VERSION \}\}/)
  assert.match(playReleaseWorkflow, /ruby-version:\s*\$\{\{ env\.RUBY_VERSION \}\}/)
  assert.match(playReleaseWorkflow, /cache-encryption-key:\s*\$\{\{ secrets\.GRADLE_ENCRYPTION_KEY \}\}/)
  assert.match(playReleaseWorkflow, /cache-read-only:\s*true/)
  assert.match(playReleaseWorkflow, /permissions:\s*\n\s*contents:\s*write/)
  assert.match(playReleaseWorkflow, /name: Prepare Capacitor Android release files/)
  assert.match(playReleaseWorkflow, /run: npm run prepare:android:release/)
  assert.match(playReleaseWorkflow, /name: Prepare release paths/)
  assert.match(playReleaseWorkflow, /ANDROID_KEYSTORE_FILE=\$RUNNER_TEMP\/release-keystore\.jks/)
  assert.match(playReleaseWorkflow, /name: Compute Android version name from tag/)
  assert.match(playReleaseWorkflow, /CI_VERSION_NAME=\$\{GITHUB_REF_NAME#v\}/)
  assert.doesNotMatch(playReleaseWorkflow, /CI_VERSION_CODE=/)
  assert.match(playReleaseWorkflow, /name: Build release AABs \(phone \+ wear\)/)
  assert.match(playReleaseWorkflow, /run: \.\/gradlew :app:bundleRelease :wear:bundleRelease --configuration-cache --build-cache/)
  assert.match(playReleaseWorkflow, /name: Resolve built AAB paths/)
  assert.match(playReleaseWorkflow, /find "\$PWD\/app\/build\/outputs\/bundle" -type f -name '\*\.aab'/)
  assert.match(playReleaseWorkflow, /find "\$PWD\/wear\/build\/outputs\/bundle" -type f -name '\*\.aab'/)
  assert.match(playReleaseWorkflow, /echo "AAB_PATH=\$RESOLVED_AAB_PATH" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseWorkflow, /echo "WEAR_AAB_PATH=\$RESOLVED_WEAR_AAB" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseWorkflow, /name: Resolve Play deobfuscation mapping path/)
  assert.match(playReleaseWorkflow, /find "\$PWD\/app\/build\/outputs\/mapping" -type f -name 'mapping\.txt'/)
  assert.match(playReleaseWorkflow, /echo "PLAY_MAPPING_PATH=\$RESOLVED_MAPPING_PATH" >> "\$GITHUB_ENV"/)
  assert.doesNotMatch(playReleaseWorkflow, /cache:\s*gradle/)
  assert.match(playReleaseWorkflow, /if:\s*\$\{\{.*!endsWith.*\.0.*\}\}/)
  assert.match(playReleaseWorkflow, /name: Prepare GitHub Release body/)
  assert.match(playReleaseWorkflow, /RELEASE_BODY_PATH="\$\{\{ runner\.temp \}\}\/github-release-body\.md"/)
  assert.match(playReleaseWorkflow, /awk.*---.*print/)
  assert.doesNotMatch(playReleaseWorkflow, /grep -v '\^#'/)
  assert.match(playReleaseWorkflow, /name: Publish GitHub Release/)
  assert.match(playReleaseWorkflow, /uses: softprops\/action-gh-release@v2/)
  assert.match(playReleaseWorkflow, /body_path:\s*\$\{\{ runner\.temp \}\}\/github-release-body\.md/)
  assert.match(playReleaseWorkflow, /files:\s*\|?\s*\n\s*\$\{\{ env\.AAB_PATH \}\}/)
  assert.match(playReleaseWorkflow, /\$\{\{ env\.WEAR_AAB_PATH \}\}/)
  assert.match(playReleaseWorkflow, /\$\{\{ env\.PLAY_MAPPING_PATH \}\}/)
  assert.match(playReleaseWorkflow, /name: Prepare Play upload paths/)
  assert.match(playReleaseWorkflow, /PLAY_JSON_KEY_PATH=\$RUNNER_TEMP\/play-service-account\.json/)
  assert.match(playReleaseWorkflow, /name: Restore Play service account/)
  assert.match(playReleaseWorkflow, /PLAY_SERVICE_ACCOUNT_JSON:\s*\$\{\{ secrets\.PLAY_SERVICE_ACCOUNT_JSON \}\}/)
  assert.match(playReleaseWorkflow, /name: Publish to Google Play closed testing/)
  assert.match(playReleaseWorkflow, /run: bundle exec fastlane closed_testing/)
})

test('play production release workflow submits minor releases to Google Play production for review', () => {
  assert.match(playProductionReleaseWorkflow, /name: Play Production Release/)
  assert.match(playProductionReleaseWorkflow, /if:\s*\$\{\{.*endsWith.*\.0.*\}\}/)
  assert.doesNotMatch(playProductionReleaseWorkflow, /!endsWith/)
  assert.match(playProductionReleaseWorkflow, /uses: actions\/checkout@v6/)
  assert.match(playProductionReleaseWorkflow, /uses: ruby\/setup-ruby@v1/)
  assert.match(playProductionReleaseWorkflow, /uses: actions\/setup-java@v5/)
  assert.match(playProductionReleaseWorkflow, /uses: actions\/setup-node@v6/)
  assert.match(playProductionReleaseWorkflow, /uses: gradle\/actions\/setup-gradle@v5/)
  assert.match(playProductionReleaseWorkflow, /permissions:\s*\n\s*contents:\s*write/)
  assert.match(playProductionReleaseWorkflow, /CI_VERSION_NAME=\$\{GITHUB_REF_NAME#v\}/)
  assert.match(playProductionReleaseWorkflow, /awk.*---.*print/)
  assert.doesNotMatch(playProductionReleaseWorkflow, /grep -v '\^#'/)
  assert.match(playProductionReleaseWorkflow, /uses: softprops\/action-gh-release@v2/)
  assert.match(playProductionReleaseWorkflow, /name: Submit to Google Play production for review/)
  assert.match(playProductionReleaseWorkflow, /run: bundle exec fastlane production_review/)
  assert.match(playProductionReleaseWorkflow, /:app:bundleRelease :wear:bundleRelease/)
  assert.match(playProductionReleaseWorkflow, /WEAR_AAB_PATH/)
  assert.doesNotMatch(playProductionReleaseWorkflow, /closed_testing/)
})

test('manual play upload workflow can retry an existing release asset upload to play', () => {
  assert.match(playReleaseFromGithubReleaseWorkflow, /on:\s*\n\s*workflow_dispatch:/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /name: Play Closed Testing Release From GitHub Release/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /tag_name:\s*\n\s*description:\s*Git tag \/ release tag to upload to Google Play/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /required:\s*true/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /type:\s*string/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /concurrency:\s*\n\s*group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ inputs\.tag_name \}\}/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /cancel-in-progress:\s*true/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /uses: actions\/checkout@v6/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /uses: ruby\/setup-ruby@v1/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /permissions:\s*\n\s*contents:\s*read/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /RUBY_VERSION:\s*"3\.2"/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /PLAY_CLOSED_TESTING_TRACK:\s*\$\{\{ vars\.PLAY_CLOSED_TESTING_TRACK \|\| 'alpha' \}\}/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /PLAY_WEAR_CLOSED_TESTING_TRACK:\s*\$\{\{ vars\.PLAY_WEAR_CLOSED_TESTING_TRACK \|\| 'wear:alpha' \}\}/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /bundler-cache:\s*true/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /working-directory:\s*frontend\/android/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /ruby-version:\s*\$\{\{ env\.RUBY_VERSION \}\}/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /name: Compute Android version name from tag input/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /CI_VERSION_NAME=/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /gh release download "\$\{\{ inputs\.tag_name \}\}" --pattern "\*\.aab" --dir "\$RELEASE_ASSET_DIR" --clobber/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /gh release download "\$\{\{ inputs\.tag_name \}\}" --pattern "mapping\.txt" --dir "\$RELEASE_ASSET_DIR" --clobber \|\| true/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /echo "AAB_PATH=\$RESOLVED_AAB_PATH" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /echo "WEAR_AAB_PATH=\$RESOLVED_WEAR_AAB" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /echo "PLAY_MAPPING_PATH=\$RESOLVED_MAPPING_PATH" >> "\$GITHUB_ENV"/)
  assert.match(playReleaseFromGithubReleaseWorkflow, /run: bundle exec fastlane closed_testing/)
})

test('fastlane publishes the closed testing track release and keeps the track configurable', () => {
  assert.match(fastlaneFastfile, /lane :closed_testing do/)
  assert.match(fastlaneFastfile, /upload_to_play_store_with_edit_retry!\(/)
  assert.match(fastlaneFastfile, /play_track = ENV\.fetch\("PLAY_CLOSED_TESTING_TRACK", DEFAULT_PHONE_TRACK\)\.to_s\.strip/)
  assert.match(fastlaneFastfile, /UI\.user_error!\("PLAY_CLOSED_TESTING_TRACK must not be empty"\) if play_track\.empty\?/)
  assert.match(fastlaneFastfile, /def collect_upload_artifacts/)
  assert.match(fastlaneFastfile, /def upload_phone_and_wear!/)
  assert.match(fastlaneFastfile, /WEAR_AAB_PATH/)
  assert.match(fastlaneFastfile, /wear_track_for_phone_track/)
  assert.match(fastlaneFastfile, /PLAY_WEAR_CLOSED_TESTING_TRACK/)
  assert.match(fastlaneFastfile, /wear:\$\{track\}|wear:#\{track\}/)
  assert.match(fastlaneFastfile, /release_status:\s*"completed"/)
  assert.match(fastlaneFastfile, /options\[:mapping\] = mapping_path if mapping_exists && !track\.to_s\.start_with\?\("wear:"\)/)
  assert.doesNotMatch(fastlaneFastfile, /aab_paths/)
  assert.doesNotMatch(fastlaneFastfile, /release_status:\s*"draft"/)
  assert.match(fastlaneFastfile, /assert_dedicated_wear_track!/)
  assert.match(fastlaneFastfile, /wear_track_missing_help/)
})

test('fastlane reads pending release notes and uploads changelogs when content is present', () => {
  assert.match(fastlaneFastfile, /PENDING_RELEASE_NOTES_PATH = File\.join\(REPO_ROOT, "release-notes\.pending\.md"\)/)
  assert.match(fastlaneFastfile, /CHANGELOGS_DIR = File\.join\(__dir__, "metadata", "android", "zh-TW", "changelogs"\)/)
  assert.match(fastlaneFastfile, /def version_code_from_name\(version_name\)/)
  assert.match(fastlaneFastfile, /\(major \+ 1\) \* 1_000_000 \+ minor \* 1_000 \+ patch/)
  assert.match(fastlaneFastfile, /def prepare_play_changelogs\(version_name/)
  assert.match(fastlaneFastfile, /FileUtils\.mkdir_p\(CHANGELOGS_DIR\)/)
  assert.match(fastlaneFastfile, /ci_version_name = ENV\.fetch\("CI_VERSION_NAME", ""\)\.strip/)
  assert.match(fastlaneFastfile, /has_changelogs = prepare_play_changelogs\(ci_version_name\)/)
  assert.match(fastlaneFastfile, /skip_upload_changelogs: !has_changelogs/)
})

test('fastlane retries Google Play edit conflicts by opening a fresh upload edit', () => {
  assert.match(fastlaneFastfile, /PLAY_EDIT_CONFLICT_MESSAGE = "A change was made to the application outside of this Edit, please create a new edit\."/)
  assert.match(fastlaneFastfile, /PLAY_UPLOAD_MAX_ATTEMPTS = 3/)
  assert.match(fastlaneFastfile, /def play_edit_conflict\?\(error\)/)
  assert.match(fastlaneFastfile, /def upload_to_play_store_with_edit_retry!\(options\)/)
  assert.match(fastlaneFastfile, /if play_edit_conflict\?\(error\) && attempts < PLAY_UPLOAD_MAX_ATTEMPTS/)
  assert.match(fastlaneFastfile, /retry/)
  assert.match(fastlaneFastfile, /play_track_not_found\?/)
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
  assert.match(ciWorkflow, /push:\s*\n\s*branches:\s*\n\s*-\s*main/)
  assert.doesNotMatch(ciWorkflow, /-\s*master/)
  assert.match(ciWorkflow, /pull_request:/)
  assert.match(ciWorkflow, /concurrency:\s*\n\s*group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/)
  assert.match(ciWorkflow, /cancel-in-progress:\s*\$\{\{ github\.event_name == 'pull_request' \}\}/)
  assert.match(ciWorkflow, /permissions:\s*\n\s*contents:\s*read/)
  assert.match(ciWorkflow, /uses: actions\/checkout@v6/)
  assert.match(ciWorkflow, /uses: actions\/setup-node@v6/)
  assert.doesNotMatch(ciWorkflow, /actions\/checkout@v4/)
  assert.doesNotMatch(ciWorkflow, /actions\/setup-node@v4/)
})

test('ci workflow warms Android bundleRelease cache on main so tag releases can reuse Gradle state', () => {
  assert.match(ciWorkflow, /NODE_VERSION:\s*"22"/)
  assert.match(ciWorkflow, /JAVA_VERSION:\s*"21"/)
  assert.match(ciWorkflow, /name: Setup Java/)
  assert.match(ciWorkflow, /uses: actions\/setup-java@v5/)
  assert.match(ciWorkflow, /java-version:\s*\$\{\{ env\.JAVA_VERSION \}\}/)
  assert.match(ciWorkflow, /node-version:\s*\$\{\{ env\.NODE_VERSION \}\}/)
  assert.match(ciWorkflow, /uses: gradle\/actions\/setup-gradle@v5/)
  assert.match(ciWorkflow, /cache-encryption-key:\s*\$\{\{ secrets\.GRADLE_ENCRYPTION_KEY \}\}/)
  assert.match(ciWorkflow, /name: Validate release notes pending file exists/)
  assert.match(ciWorkflow, /test -f \.\.\/release-notes\.pending\.md/)
  assert.match(ciWorkflow, /name: Validate release version matches latest git tag/)
  assert.match(ciWorkflow, /run: npm run release:sync-check/)
  assert.match(ciWorkflow, /fetch-depth:\s*0/)
  assert.match(ciWorkflow, /name: Prepare Android release files for cache warmup/)
  assert.match(ciWorkflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/)
  assert.match(ciWorkflow, /run: npm run prepare:android:release/)
  assert.match(ciWorkflow, /name: Warm Android bundleRelease cache/)
  assert.match(ciWorkflow, /working-directory:\s*frontend\/android/)
  assert.match(ciWorkflow, /run: \.\/gradlew :app:bundleRelease :wear:bundleRelease --dry-run --configuration-cache --build-cache/)
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
