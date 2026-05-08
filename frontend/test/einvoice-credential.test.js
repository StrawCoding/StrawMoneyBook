import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  decryptCredential,
  encryptCredential,
} from '../src/services/einvoice/credential-crypto.js'

test('e-invoice credential encryption requires the matching IV for each field', async () => {
  const deviceUuid = 'test-device-uuid'
  const phone = await encryptCredential('0910047171', deviceUuid)
  const password = await encryptCredential('Swxd3167@', deviceUuid)

  assert.notEqual(phone.iv, password.iv)
  assert.equal(await decryptCredential(phone.encrypted, phone.iv, deviceUuid), '0910047171')
  assert.equal(await decryptCredential(password.encrypted, password.iv, deviceUuid), 'Swxd3167@')
  await assert.rejects(() => decryptCredential(password.encrypted, phone.iv, deviceUuid))
})

test('e-invoice credential persistence stores and reads a dedicated password IV', () => {
  const backendSource = readFileSync(resolve(import.meta.dirname, '../src/services/einvoice/backend.js'), 'utf8')
  const repoSource = readFileSync(resolve(import.meta.dirname, '../src/core/repositories/einvoice-import.repo.js'), 'utf8')
  const baseMigration = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrations/032_einvoice_import.sql'), 'utf8')
  const patchMigration = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrations/033_einvoice_credential_password_iv.sql'), 'utf8')
  const migrateSource = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(backendSource, /iv:\s*ivAccount/)
  assert.match(backendSource, /passwordIv:\s*ivPassword/)
  assert.match(backendSource, /decryptCredential\(row\.encryptedPassword,\s*row\.passwordIv\s*\|\|\s*row\.iv/)
  assert.match(repoSource, /passwordIv:\s*String\(row\.password_iv\s*\?\?\s*row\.iv/)
  assert.match(repoSource, /password_iv/)
  assert.match(baseMigration, /password_iv\s+TEXT\s+NOT NULL\s+DEFAULT ''/)
  assert.match(patchMigration, /ALTER TABLE einvoice_credentials ADD COLUMN password_iv/)
  assert.match(migrateSource, /033_einvoice_credential_password_iv/)
  assert.match(migrateSource, /version:\s*33/)
})
