import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

import {
  backupCollabStore,
  formatCollabBackupStamp,
  resolveCollabDbPath,
} from '../src/collab/backup-store.js'

test('resolveCollabDbPath prefers SHARED_LEDGER_DB_FILE', () => {
  assert.equal(
    resolveCollabDbPath({ dbFile: '/tmp/custom-collab.sqlite' }),
    '/tmp/custom-collab.sqlite',
  )
})

test('backupCollabStore copies sqlite contents and prunes older copies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'strawmb-collab-backup-'))
  const sourcePath = join(dir, 'collab-store.sqlite')
  const backupDir = join(dir, 'backups')

  const db = new Database(sourcePath)
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    INSERT INTO users (id, email) VALUES ('u1', 'owner@example.com');
  `)
  db.close()

  const firstStamp = new Date('2026-08-01T00:00:00.000Z')
  const secondStamp = new Date('2026-08-02T00:00:00.000Z')
  const first = await backupCollabStore({
    sourcePath,
    backupDir,
    now: firstStamp,
    keep: 1,
  })
  const second = await backupCollabStore({
    sourcePath,
    backupDir,
    now: secondStamp,
    keep: 1,
  })

  assert.equal(first.destName, `collab-store-${formatCollabBackupStamp(firstStamp)}.sqlite`)
  assert.equal(second.pruned.includes(first.destPath), true)
  assert.equal(second.kept.includes(second.destPath), true)

  const restored = new Database(second.destPath, { readonly: true })
  const row = restored.prepare('SELECT email FROM users WHERE id = ?').get('u1')
  restored.close()
  assert.equal(row.email, 'owner@example.com')

  await rm(dir, { recursive: true, force: true })
})

test('backup script is wired as an npm script', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['backup:collab'], 'node scripts/backup-collab-store.mjs')
})
