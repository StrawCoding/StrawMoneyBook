import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const frontendRoot = resolve(import.meta.dirname, '..')
const androidRoot = resolve(frontendRoot, 'android')
const wearRoot = resolve(androidRoot, 'wear')

function listFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

test('stage B: independent :wear module, no wearApp, standalone=false', () => {
  const settings = readFileSync(resolve(androidRoot, 'settings.gradle'), 'utf8')
  const wearGradle = readFileSync(resolve(wearRoot, 'build.gradle'), 'utf8')
  const wearManifest = readFileSync(resolve(wearRoot, 'src/main/AndroidManifest.xml'), 'utf8')
  const appGradle = readFileSync(resolve(androidRoot, 'app/build.gradle'), 'utf8')

  assert.match(settings, /include ':wear'/)
  assert.doesNotMatch(settings, /wearApp/)
  assert.doesNotMatch(appGradle, /wearApp/)
  assert.match(wearGradle, /applicationId "com\.strawcoding\.strawmoneybook"/)
  assert.match(wearGradle, /wearVersionCodeOffset = 100_000_000/)
  assert.match(wearGradle, /applicationIdSuffix "debug"/)
  assert.match(wearManifest, /com\.google\.android\.wearable\.standalone/)
  assert.match(wearManifest, /android:value="false"/)
  assert.match(wearManifest, /android\.hardware\.type\.watch/)
  assert.match(wearManifest, /SmbGlanceTileService/)
  assert.match(wearManifest, /WearMessageListenerService/)
  assert.match(wearManifest, /pathPrefix="\/smb\/v1\/"/)
})

test('stage B: Wear Compose >= 1.5.6 required for targetSdk 35+ (reduce_motion crash)', () => {
  const wearGradle = readFileSync(resolve(wearRoot, 'build.gradle'), 'utf8')
  const variables = readFileSync(resolve(androidRoot, 'variables.gradle'), 'utf8')
  assert.match(variables, /wearTargetSdkVersion\s*=\s*3[5-9]|wearTargetSdkVersion\s*=\s*[4-9]\d/)
  const material = wearGradle.match(/androidx\.wear\.compose:compose-material:([0-9.]+)/)
  assert.ok(material, 'wear compose-material dependency missing')
  const [major, minor, patch] = material[1].split('.').map((part) => Number.parseInt(part, 10))
  const ok =
    major > 1
    || (major === 1 && minor > 5)
    || (major === 1 && minor === 5 && patch >= 6)
  assert.ok(ok, `Wear Compose ${material[1]} is too old; need >= 1.5.6 (use 1.6.2)`)
  assert.match(wearGradle, /compose-foundation:1\.6\.2/)
  assert.match(wearGradle, /compose-navigation:1\.6\.2/)
})

test('stage B: wear sources use MessageClient only for ledger paths', () => {
  const kotlinRoot = resolve(wearRoot, 'src/main/java')
  const offenders = []
  for (const file of listFiles(kotlinRoot)) {
    if (!file.endsWith('.kt')) continue
    const text = readFileSync(file, 'utf8')
    if (/PutDataRequest|PutDataMapRequest|DataClient|DataMapItem|wearApp\s+project/.test(text)) {
      offenders.push(file)
    }
  }
  assert.deepEqual(offenders, [], `forbidden Data Layer in wear: ${offenders.join(', ')}`)

  const sync = readFileSync(resolve(kotlinRoot, 'com/strawcoding/strawmoneybook/sync/WearSyncRepository.kt'), 'utf8')
  const paths = readFileSync(resolve(kotlinRoot, 'com/strawcoding/strawmoneybook/protocol/WearPaths.kt'), 'utf8')
  assert.match(sync, /MessageClient|Wearable\.getMessageClient/)
  assert.match(sync, /isNearby/)
  assert.match(paths, /\/smb\/v1\/hello/)
  assert.match(paths, /\/smb\/v1\/tx\/create/)
  assert.match(paths, /\/smb\/v1\/snapshot\/request/)
})

test('stage B: phone advanced entry + wear companion page', () => {
  const featureList = readFileSync(resolve(frontendRoot, 'src/ui/views/FeatureListPage.vue'), 'utf8')
  const router = readFileSync(resolve(frontendRoot, 'src/ui/router/index.js'), 'utf8')
  const page = readFileSync(resolve(frontendRoot, 'src/ui/views/settings/SettingsWearCompanionPage.vue'), 'utf8')
  const service = readFileSync(resolve(frontendRoot, 'src/ui/services/wear-companion.service.js'), 'utf8')
  const plugin = readFileSync(
    resolve(androidRoot, 'app/src/main/java/com/strawcoding/strawmoneybook/wear/WearCompanionPlugin.java'),
    'utf8',
  )
  assert.match(featureList, /feature-link-wear-companion/)
  assert.match(featureList, /\/settings\/wear-companion/)
  assert.match(router, /settings-wear-companion/)
  assert.match(page, /wear-companion-page/)
  assert.match(service, /getConnectionStatus/)
  assert.match(plugin, /getConnectionStatus/)
})
