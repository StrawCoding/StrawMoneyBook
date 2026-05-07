// AES-256-GCM credential encryption.
// Key is derived via PBKDF2 from the device UUID so that credentials are
// bound to the device and never stored in plaintext.

const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const IV_LENGTH_BYTES = 12
const ALGORITHM = 'AES-GCM'

function getSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('WebCrypto SubtleCrypto is unavailable')
  return subtle
}

async function deriveKey(deviceUuid) {
  const subtle = getSubtleCrypto()
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey('raw', enc.encode(deviceUuid), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('smb-einvoice-salt'), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export async function encryptCredential(plaintext, deviceUuid) {
  const subtle = getSubtleCrypto()
  const key = await deriveKey(deviceUuid)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const enc = new TextEncoder()
  const cipherBuffer = await subtle.encrypt({ name: ALGORITHM, iv }, key, enc.encode(plaintext))
  return {
    encrypted: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv),
  }
}

export async function decryptCredential(encryptedB64, ivB64, deviceUuid) {
  const subtle = getSubtleCrypto()
  const key = await deriveKey(deviceUuid)
  const iv = base64ToBuffer(ivB64)
  const cipherBuffer = base64ToBuffer(encryptedB64)
  const plainBuffer = await subtle.decrypt({ name: ALGORITHM, iv }, key, cipherBuffer)
  return new TextDecoder().decode(plainBuffer)
}
