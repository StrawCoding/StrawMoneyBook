import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { redactPiiText, redactPiiValue } from '../src/collab/pii-redact.js'

const backendDir = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('SEC-07 production import of collab store requires SHARED_LEDGER_TOKEN_SECRET', () => {
  const source = readFileSync(resolve(backendDir, 'src/collab/store.js'), 'utf8')
  assert.match(source, /SHARED_LEDGER_TOKEN_SECRET is required in production/)
  assert.match(source, /if \(process\.env\.NODE_ENV === 'production'\)/)

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    process.env.NODE_ENV = 'production'
    delete process.env.SHARED_LEDGER_TOKEN_SECRET
    try {
      await import(${JSON.stringify(resolve(backendDir, 'src/collab/store.js'))})
      console.error('store imported without secret')
      process.exit(2)
    } catch (error) {
      const message = String(error?.message ?? error)
      if (message.includes('SHARED_LEDGER_TOKEN_SECRET is required in production')) process.exit(0)
      console.error(message)
      process.exit(1)
    }
  `], {
    cwd: backendDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('SEC-10 PII redaction covers emails and sensitive keys', () => {
  assert.equal(redactPiiText('mail user@example.com'), 'mail [redacted-email]')
  assert.equal(redactPiiValue('secret', 'password'), '[redacted]')
  assert.equal(redactPiiValue({ token: 'abc', note: 'user@example.com' }).token, '[redacted]')
  assert.equal(redactPiiValue({ token: 'abc', note: 'user@example.com' }).note, '[redacted-email]')
})
