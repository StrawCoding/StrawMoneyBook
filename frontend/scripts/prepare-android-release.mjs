import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const REQUIRED_ANDROID_GENERATED_FILES = [
  'android/app/capacitor.build.gradle',
  'android/capacitor.settings.gradle',
  'android/capacitor-cordova-android-plugins/cordova.variables.gradle',
]

export function findMissingAndroidGeneratedFiles(frontendRoot = process.cwd()) {
  return REQUIRED_ANDROID_GENERATED_FILES.filter((relativePath) => !existsSync(resolve(frontendRoot, relativePath)))
}

export function resolveAndroidPrepareMode(frontendRoot = process.cwd()) {
  const missingFiles = findMissingAndroidGeneratedFiles(frontendRoot)
  return {
    mode: missingFiles.length === 0 ? 'copy' : 'sync',
    missingFiles,
  }
}

export function runAndroidPrepare(frontendRoot = process.cwd()) {
  const { mode, missingFiles } = resolveAndroidPrepareMode(frontendRoot)
  const command = mode === 'sync' ? 'sync:android' : 'copy:android'

  if (mode === 'sync') {
    console.log(`[prepare-android-release] missing generated files, fallback to sync: ${missingFiles.join(', ')}`)
  } else {
    console.log('[prepare-android-release] generated files ready, using copy:android')
  }

  const result = spawnSync('npm', ['run', command], {
    cwd: frontendRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAndroidPrepare()
}
