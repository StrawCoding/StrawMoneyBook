import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isAutoBackupDue, resolveAutoBackupIntervalHours } from '../src/ui/services/auto-backup-schedule.js'

test('auto backup interval uses at least one hour and falls back to 24 hours', () => {
  assert.equal(resolveAutoBackupIntervalHours(undefined), 24)
  assert.equal(resolveAutoBackupIntervalHours(0), 24)
  assert.equal(resolveAutoBackupIntervalHours(-12), 1)
  assert.equal(resolveAutoBackupIntervalHours('6'), 6)
})

test('auto backup is due immediately when enabled but there is no last backup time', () => {
  assert.equal(
    isAutoBackupDue({
      connected: true,
      autoEnabled: true,
      intervalHours: 24,
      lastBackupAt: '',
    }),
    true,
  )
})

test('auto backup waits until the configured interval has elapsed', () => {
  const now = Date.parse('2026-03-31T12:00:00.000Z')
  assert.equal(
    isAutoBackupDue({
      connected: true,
      autoEnabled: true,
      intervalHours: 6,
      lastBackupAt: '2026-03-31T07:00:01.000Z',
    }, now),
    false,
  )
  assert.equal(
    isAutoBackupDue({
      connected: true,
      autoEnabled: true,
      intervalHours: 6,
      lastBackupAt: '2026-03-31T06:00:00.000Z',
    }, now),
    true,
  )
})

test('auto backup stays disabled when connection or auto backup is disabled', () => {
  assert.equal(
    isAutoBackupDue({
      connected: false,
      autoEnabled: true,
      intervalHours: 24,
      lastBackupAt: '',
    }),
    false,
  )
  assert.equal(
    isAutoBackupDue({
      connected: true,
      autoEnabled: false,
      intervalHours: 24,
      lastBackupAt: '',
    }),
    false,
  )
})

test('google and webdav backup services use the shared auto backup due helper', () => {
  const googleSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/google-backup.service.js'),
    'utf8',
  )
  const webdavSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/webdav-backup.service.js'),
    'utf8',
  )

  assert.match(googleSource, /import \{ isAutoBackupDue, resolveAutoBackupIntervalHours \} from '@\/ui\/services\/auto-backup-schedule'/)
  assert.match(googleSource, /resolveGoogleAutoBackupSkipReason/)
  assert.match(googleSource, /if \(!isAutoBackupDue\(state\)\) return 'not_due'/)
  assert.match(webdavSource, /import \{ isAutoBackupDue, resolveAutoBackupIntervalHours \} from '@\/ui\/services\/auto-backup-schedule'/)
  assert.match(webdavSource, /resolveWebdavAutoBackupSkipReason/)
  assert.match(webdavSource, /if \(!isAutoBackupDue\(state\)\) return 'not_due'/)
})
