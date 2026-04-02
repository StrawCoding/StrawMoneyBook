import fs from 'node:fs'
import path from 'node:path'

const gradleTargets = [
  {
    label: 'app',
    filePath: path.resolve(process.cwd(), 'android/app/build.gradle'),
    libDirs: [
      path.resolve(process.cwd(), 'android/app/libs'),
      path.resolve(process.cwd(), 'android/capacitor-cordova-android-plugins/src/main/libs'),
    ],
  },
  {
    label: 'cordova-plugins',
    filePath: path.resolve(process.cwd(), 'android/capacitor-cordova-android-plugins/build.gradle'),
    libDirs: [
      path.resolve(process.cwd(), 'android/capacitor-cordova-android-plugins/src/main/libs'),
      path.resolve(process.cwd(), 'android/capacitor-cordova-android-plugins/libs'),
    ],
  },
]

function hasBinaryLibraryFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return false
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory() && hasBinaryLibraryFiles(fullPath)) return true
    if (entry.isFile() && /\.(aar|jar)$/i.test(entry.name)) return true
  }
  return false
}

export function stripUnusedFlatDirRepositories(source) {
  return source
    .replace(/\n[ \t]*flatDir\s*\{\s*\n(?:[ \t].*\n)*?[ \t]*\}\s*/g, '\n')
    .replace(/repositories\s*\{\s*\n\s*\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function patchGradleTarget(target) {
  if (!fs.existsSync(target.filePath)) {
    console.log(`[patch-android-flatdir] ${target.label} file not found, skipped`)
    return
  }

  const hasLocalLibs = target.libDirs.some((dirPath) => hasBinaryLibraryFiles(dirPath))
  if (hasLocalLibs) {
    console.log(`[patch-android-flatdir] ${target.label} kept flatDir because local libs exist`)
    return
  }

  const source = fs.readFileSync(target.filePath, 'utf8')
  const next = stripUnusedFlatDirRepositories(source)

  if (next !== source) {
    fs.writeFileSync(target.filePath, next, 'utf8')
    console.log(`[patch-android-flatdir] ${target.label} removed unused flatDir`)
    return
  }

  console.log(`[patch-android-flatdir] ${target.label} already clean`)
}

for (const target of gradleTargets) {
  patchGradleTarget(target)
}
