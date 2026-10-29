import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings.vue'),
  'utf8',
)

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsBookkeepingReminderPage.vue'),
  'utf8',
)

const mainSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
  'utf8',
)

test('bookkeeping reminder settings are reachable from settings and router', () => {
  assert.match(settingsSource, /to: '\/settings\/bookkeeping-reminder'/)
  assert.match(settingsSource, /labelKey: 'settings\.bookkeeping_reminder'/)
  assert.match(routerSource, /path: '\/settings\/bookkeeping-reminder'/)
  assert.match(routerSource, /name: 'settings-bookkeeping-reminder'/)
})

test('bookkeeping reminder page wires reminder settings and achievement board', () => {
  assert.match(pageSource, /<TimePickerField/)
  assert.match(pageSource, /achievement-grid/)
  assert.match(pageSource, /getBookkeepingAchievement/)
  assert.match(pageSource, /openBookkeepingReminderExactAlarmSettings/)
  assert.match(pageSource, /saveBookkeepingReminderSettings/)
  assert.match(pageSource, /syncBookkeepingReminderForLedger/)
  assert.match(pageSource, /showExactAlarmAction = computed\(\(\) => reminderStatus\.value === 'exact_alarm_required'\)/)
  assert.match(pageSource, /settings_bookkeeping_reminder\.open_exact_alarm/)
  assert.match(pageSource, /async function openExactAlarmSettings\(\)/)
  assert.match(pageSource, /async function syncReminderInBackground/)
  assert.match(pageSource, /void syncReminderInBackground\(ledgerId, saved\)/)
  assert.doesNotMatch(pageSource, /type="time"/)
})

test('application bootstraps and refreshes bookkeeping reminders centrally', () => {
  assert.match(mainSource, /enqueueBookkeepingReminderSync/)
  assert.match(mainSource, /CapacitorApp\.addListener\('appStateChange'/)
  assert.match(mainSource, /enqueueBookkeepingReminderSync\('app_start'\)/)
  assert.match(mainSource, /enqueueAppForegroundSyncBatch/)
})
