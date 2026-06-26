import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const installScriptPath = resolve(repoRoot, 'scripts/deploy-production-install.mjs')

test('SMB-256: deploy-production-install.mjs exists', () => {
  assert.ok(existsSync(installScriptPath), 'scripts/deploy-production-install.mjs must exist')
})

test('SMB-256: deploy:copy installs native deps via the in-container script, not host npm install', () => {
  const deployCopy = pkg.scripts['deploy:copy']
  assert.ok(deployCopy, 'deploy:copy script must be defined')
  assert.match(deployCopy, /scripts\/deploy-production-install\.mjs/)
  // Root cause guard: must NOT chain a host-side `npm install` inside the deploy dir.
  assert.doesNotMatch(deployCopy, /serviceApps\/StrawMB\s*&&[^"]*npm install/)
  assert.doesNotMatch(deployCopy, /cd\s+\/mnt\/data\/Data\/serviceApps\/StrawMB[^"]*npm install/)
})

test('SMB-256: install script installs inside the matching 1panel/node runtime image', () => {
  const src = readFileSync(installScriptPath, 'utf8')
  assert.match(src, /1panel\/node:/)
  assert.match(src, /NODE_VERSION/)
  assert.match(src, /docker/)
  assert.match(src, /run\b/)
  assert.match(src, /npm['",\s]+install/)
})

test('SMB-256: install script verifies better-sqlite3 loads in the runtime image and refuses host fallback', () => {
  const src = readFileSync(installScriptPath, 'utf8')
  assert.match(src, /better-sqlite3/)
  // Must abort (not silently fall back to host install) when docker is unavailable.
  assert.match(src, /dockerAvailable/)
  assert.match(src, /aborting instead of falling back to host npm install/i)
})
