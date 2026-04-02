import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const VERSION_CODE_PATTERN = /versionCode\s+(\d+)/
const APP_VERSION_CODE_PATTERN = /def\s+appVersionCode\s*=\s*resolveVersionCode\(([^,]+),\s*(\d+)\)/

export function parseVersionCodeSource(source) {
  const directMatch = source.match(VERSION_CODE_PATTERN)
  if (directMatch) {
    return {
      currentCode: Number.parseInt(directMatch[1], 10),
      pattern: VERSION_CODE_PATTERN,
      replacement: (nextCode) => `versionCode ${nextCode}`,
    }
  }

  const fallbackMatch = source.match(APP_VERSION_CODE_PATTERN)
  if (fallbackMatch) {
    return {
      currentCode: Number.parseInt(fallbackMatch[2], 10),
      pattern: APP_VERSION_CODE_PATTERN,
      replacement: (nextCode, args) => `def appVersionCode = resolveVersionCode(${args[1]}, ${nextCode})`,
    }
  }

  throw new Error('Cannot find `versionCode` in android/app/build.gradle')
}

export function bumpVersionCodeSource(source) {
  const { currentCode, pattern, replacement } = parseVersionCodeSource(source)
  if (!Number.isFinite(currentCode)) {
    throw new Error(`Invalid versionCode: ${currentCode}`)
  }

  const nextCode = currentCode + 1
  const updated = source.replace(pattern, (...args) => replacement(nextCode, args))

  return {
    currentCode,
    nextCode,
    updated,
  }
}

function main() {
  const targetPath = resolve(process.cwd(), 'android/app/build.gradle')
  const source = readFileSync(targetPath, 'utf8')
  const { currentCode, nextCode, updated } = bumpVersionCodeSource(source)

  writeFileSync(targetPath, updated, 'utf8')
  console.log(`versionCode bumped: ${currentCode} -> ${nextCode}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
