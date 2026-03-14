import test from 'node:test'
import assert from 'node:assert/strict'

process.env.GOOGLE_AUTH_WEB_CLIENT_ID = 'strawmb-web-client.apps.googleusercontent.com'

const { verifyGoogleIdToken } = await import('../src/collab/google-id-token.js')

test('verifyGoogleIdToken accepts a valid Google payload', async () => {
  const payload = await verifyGoogleIdToken({
    idToken: 'fake-id-token',
    expectedNonce: 'nonce-123',
    verifier: async () => ({
      getPayload() {
        return {
          sub: 'google-sub-1',
          email: 'USER@example.com',
          email_verified: true,
          name: 'Test User',
          picture: 'https://example.com/avatar.png',
          aud: 'strawmb-web-client.apps.googleusercontent.com',
          iss: 'https://accounts.google.com',
          nonce: 'nonce-123',
          exp: Math.floor(Date.now() / 1000) + 300,
          iat: Math.floor(Date.now() / 1000),
        }
      },
    }),
  })

  assert.equal(payload.sub, 'google-sub-1')
  assert.equal(payload.email, 'user@example.com')
  assert.equal(payload.email_verified, true)
  assert.equal(payload.name, 'Test User')
  assert.equal(payload.picture, 'https://example.com/avatar.png')
})

test('verifyGoogleIdToken rejects nonce mismatch', async () => {
  await assert.rejects(
    verifyGoogleIdToken({
      idToken: 'fake-id-token',
      expectedNonce: 'nonce-expected',
      verifier: async () => ({
        getPayload() {
          return {
            sub: 'google-sub-2',
            email: 'user@example.com',
            email_verified: true,
            aud: 'strawmb-web-client.apps.googleusercontent.com',
            iss: 'accounts.google.com',
            nonce: 'nonce-actual',
            exp: Math.floor(Date.now() / 1000) + 300,
          }
        },
      }),
    }),
    (error) => error?.code === 'google_nonce_mismatch',
  )
})

test('verifyGoogleIdToken maps audience errors from google-auth-library', async () => {
  await assert.rejects(
    verifyGoogleIdToken({
      idToken: 'fake-id-token',
      verifier: async () => {
        throw new Error('Wrong recipient, payload audience != requiredAudience')
      },
    }),
    (error) => error?.code === 'google_audience_mismatch',
  )
})
