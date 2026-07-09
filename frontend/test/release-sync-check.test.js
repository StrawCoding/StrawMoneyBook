import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  checkReleaseSync,
  listVersionTags,
  tagToVersion,
} from '../scripts/release-sync-check.mjs'

function tempRepo(version, tags = []) {
  const dir = mkdtempSync(join(tmpdir(), 'strawmoneybook-release-sync-'))
  const frontendRoot = join(dir, 'frontend')
  mkdirSync(frontendRoot, { recursive: true })
  writeFileSync(
    join(frontendRoot, 'package.json'),
    JSON.stringify({ name: 'strawmoneybook', version }, null, 2),
    'utf8',
  )

  const gitRunner = (args) => {
    const cmd = args.join(' ')
    if (cmd === 'tag -l v* --sort=-v:refname') {
      return { stdout: tags.join('\n') }
    }
    if (cmd.startsWith('show v')) {
      const tag = args[1].split(':')[0]
      const taggedVersion = tagToVersion(tag)
      return {
        stdout: JSON.stringify({ name: 'strawmoneybook', version: taggedVersion }),
      }
    }
    throw new Error(`Unexpected git call: ${cmd}`)
  }

  return { dir, frontendRoot, gitRunner }
}

test('tagToVersion strips leading v', () => {
  assert.equal(tagToVersion('v1.3.50'), '1.3.50')
})

test('listVersionTags returns sorted tag names', () => {
  const tags = listVersionTags('/repo', () => ({
    stdout: 'v1.3.49\nv1.3.50\n',
  }))
  assert.deepEqual(tags, ['v1.3.49', 'v1.3.50'])
})

test('checkReleaseSync passes when package.json matches latest tag', () => {
  const { dir, frontendRoot, gitRunner } = tempRepo('1.3.50', ['v1.3.50', 'v1.3.49'])
  const result = checkReleaseSync({
    repoRoot: dir,
    frontendRoot,
    gitRunner,
    versionReader: () => '1.3.50',
  })
  assert.equal(result.ok, true)
  assert.match(result.message, /Release sync OK/)
})

test('checkReleaseSync fails when package.json is ahead of latest tag', () => {
  const { dir, frontendRoot, gitRunner } = tempRepo('1.3.47', ['v1.3.45'])
  const result = checkReleaseSync({
    repoRoot: dir,
    frontendRoot,
    gitRunner,
    versionReader: () => '1.3.47',
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /does not match latest git tag/)
  assert.match(result.message, /npm run gpr/)
})

test('checkReleaseSync fails when no tags exist', () => {
  const { dir, frontendRoot, gitRunner } = tempRepo('1.0.0', [])
  const result = checkReleaseSync({
    repoRoot: dir,
    frontendRoot,
    gitRunner,
    versionReader: () => '1.0.0',
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /No release tags found/)
})
