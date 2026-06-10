import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsSharedLedgerPage.vue'),
  'utf8',
)
const backendSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/shared-ledger/backend.js'),
  'utf8',
)
const serviceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'),
  'utf8',
)
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)

const requiredI18nKeys = [
  'settings_shared_ledgers.email_invite',
  'settings_shared_ledgers.email_invite_send',
  'settings_shared_ledgers.email_invite_resend',
  'settings_shared_ledgers.email_delivery.failed',
  'settings_shared_ledgers.toast.email_invite_sent',
  'settings_shared_ledgers.toast.email_invite_failed',
  'settings_shared_ledgers.toast.email_invite_not_configured',
  'shared_ledger.error.missing_invite_email',
]

test('SettingsSharedLedgerPage exposes email invite UI and delivery feedback hooks', () => {
  assert.match(pageSource, /inviteEmailInput/)
  assert.match(pageSource, /outgoingInvitations/)
  assert.match(pageSource, /sendEmailInvite/)
  assert.match(pageSource, /resendEmailInvite/)
  assert.match(pageSource, /pushEmailInviteDeliveryToast/)
  assert.match(pageSource, /getEmailDeliveryLabel/)
  assert.match(pageSource, /settings_shared_ledgers\.email_invite/)
})

test('shared ledger backend and service expose email invite APIs', () => {
  assert.match(backendSource, /export async function inviteSharedLedgerByEmail/)
  assert.match(backendSource, /export async function listSharedLedgerOutgoingInvitations/)
  assert.match(backendSource, /export async function resendSharedLedgerInvitation/)
  assert.match(serviceSource, /inviteRemoteSharedLedgerByEmail/)
  assert.match(serviceSource, /listOutgoingSharedLedgerInvitations/)
  assert.match(serviceSource, /resendRemoteSharedLedgerInvitation/)
})

test('email invite i18n keys exist in zh-TW, en, and ja', () => {
  for (const key of requiredI18nKeys) {
    const matches = i18nSource.match(new RegExp(`'${key.replaceAll('.', '\\.')}'`, 'g')) ?? []
    assert.ok(matches.length >= 3, `expected at least 3 locales for ${key}, got ${matches.length}`)
  }
})
