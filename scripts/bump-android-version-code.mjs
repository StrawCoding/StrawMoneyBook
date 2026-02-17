import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const targetPath = resolve(process.cwd(), 'android/app/build.gradle')
const source = readFileSync(targetPath, 'utf8')
const pattern = /versionCode\s+(\d+)/
const match = source.match(pattern)

if (!match) {
  throw new Error('Cannot find `versionCode` in android/app/build.gradle')
}

const currentCode = Number.parseInt(match[1], 10)
if (!Number.isFinite(currentCode)) {
  throw new Error(`Invalid versionCode: ${match[1]}`)
}

const nextCode = currentCode + 1
const updated = source.replace(pattern, `versionCode ${nextCode}`)
writeFileSync(targetPath, updated, 'utf8')

console.log(`versionCode bumped: ${currentCode} -> ${nextCode}`)
