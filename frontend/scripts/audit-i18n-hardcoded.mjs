import fs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.resolve('src')
const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

const EXCLUDED_PATH_PATTERNS = [
  /\/ui\/services\/i18n\.service\.js$/,
  /\/ui\/services\/i18n\//,
  /\/ui\/services\/runtime-.*\.generated\.js$/,
  /\/ui\/utils\/fa-icon-options\.js$/,
  /\/ui\/utils\/addon-note\.js$/,
  /\/core\/db\//,
]

const EXCLUDED_LINE_PATTERNS = [
  /^\s*\/\//,
  /^\s*\*/,
  /^\s*import\s+/,
  /^\s*export\s+/,
  /translateMessage\(/,
  /translateRuntimeText\(/,
  /\bt\(/,
  /\bMESSAGES\b/,
  /\bRUNTIME_[A-Z_]+\b/,
  /data-no-runtime-translate/,
]

function shouldSkipPath(filePath) {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(filePath))
}

function shouldSkipLine(line) {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return true
  return EXCLUDED_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function walk(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(nextPath, bucket)
      continue
    }
    if (!/\.(?:js|vue|ts)$/.test(entry.name)) continue
    bucket.push(nextPath)
  }
  return bucket
}

function collectCandidates(filePath) {
  const relativePath = path.relative(process.cwd(), filePath)
  if (shouldSkipPath(relativePath)) return []

  const source = fs.readFileSync(filePath, 'utf8')
  const lines = source.split(/\r?\n/g)
  const candidates = []

  lines.forEach((line, index) => {
    if (!CJK_PATTERN.test(line)) return
    if (shouldSkipLine(line)) return
    candidates.push({
      line: index + 1,
      text: line.trim(),
    })
  })

  return candidates
}

function main() {
  const files = walk(SRC_ROOT).sort()
  const findings = []

  for (const filePath of files) {
    const matches = collectCandidates(filePath)
    if (!matches.length) continue
    findings.push({
      filePath: path.relative(process.cwd(), filePath),
      matches,
    })
  }

  console.log(`hardcoded i18n audit: scanned=${files.length} files, flagged=${findings.length} files`)
  for (const finding of findings) {
    console.log(`\n[${finding.filePath}] ${finding.matches.length} candidate line(s)`)
    for (const match of finding.matches.slice(0, 20)) {
      console.log(`  L${match.line}: ${match.text}`)
    }
    if (finding.matches.length > 20) {
      console.log(`  ... ${finding.matches.length - 20} more line(s)`)
    }
  }
}

main()
