import test from 'node:test'
import assert from 'node:assert/strict'

test('nodemailer json transport still sends invite/reset mail after v10', async () => {
  process.env.SMTP_JSON_TRANSPORT = 'true'
  process.env.SMTP_FROM = 'noreply@example.com'
  const { isMailTransportConfigured, sendPasswordResetEmail } = await import('../src/collab/mailer.js')
  assert.equal(isMailTransportConfigured(), true)
  const info = await sendPasswordResetEmail({
    email: 'user@example.com',
    displayName: '測試',
    resetUrl: 'https://www.strawmb.com/reset?token=abc',
    expiresMinutes: 30,
  })
  const blob = JSON.stringify(info)
  assert.match(blob, /user@example.com/)
  assert.match(blob, /reset\?token=abc/)
  assert.match(blob, /StrawMoneyBook/)
})
