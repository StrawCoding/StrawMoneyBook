import { getSetting, removeSetting, setSetting } from '@/core/repositories/settings.repo'
import { translateMessage } from '@/ui/services/i18n.service.js'

const MASTER_KEY_STORAGE_KEY = 'straw.secure-setting.master-key.v1'
const ENCRYPTED_PAYLOAD_VERSION = 1
let inMemoryMasterKey = ''

function getWebCrypto() {
  const cryptoApi = globalThis.crypto ?? null
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') return null
  return cryptoApi
}

function encodeBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

function decodeBase64(text) {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(String(text ?? ''), 'base64'))
  }
  const binary = globalThis.atob(String(text ?? ''))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function getLocalStorageSafe() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readStoredMasterKey() {
  const storage = getLocalStorageSafe()
  if (storage) {
    const saved = String(storage.getItem(MASTER_KEY_STORAGE_KEY) ?? '').trim()
    if (saved) return saved
  }
  return inMemoryMasterKey
}

function persistMasterKey(base64Key) {
  const normalized = String(base64Key ?? '').trim()
  if (!normalized) return
  inMemoryMasterKey = normalized
  const storage = getLocalStorageSafe()
  if (!storage) return
  storage.setItem(MASTER_KEY_STORAGE_KEY, normalized)
}

async function getMasterKey() {
  const cryptoApi = getWebCrypto()
  if (!cryptoApi) {
    throw new Error(translateMessage('common.secure_store_unsupported', '目前環境不支援安全加密儲存'))
  }

  let base64Key = readStoredMasterKey()
  if (!base64Key) {
    const rawKey = cryptoApi.getRandomValues(new Uint8Array(32))
    base64Key = encodeBase64(rawKey)
    persistMasterKey(base64Key)
  }

  const rawKey = decodeBase64(base64Key)
  return cryptoApi.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function setEncryptedSetting(ledgerId, key, value) {
  const cryptoApi = getWebCrypto()
  if (!cryptoApi) {
    throw new Error(translateMessage('common.secure_store_unsupported', '目前環境不支援安全加密儲存'))
  }

  const masterKey = await getMasterKey()
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value ?? null))
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    plaintext,
  )

  await setSetting(ledgerId, key, {
    version: ENCRYPTED_PAYLOAD_VERSION,
    alg: 'AES-GCM',
    iv: encodeBase64(iv),
    data: encodeBase64(new Uint8Array(encrypted)),
  })
}

export async function getEncryptedSetting(ledgerId, key) {
  const cryptoApi = getWebCrypto()
  if (!cryptoApi) return null

  const payload = await getSetting(ledgerId, key)
  if (!payload || typeof payload !== 'object') return null
  if (Number(payload.version ?? 0) !== ENCRYPTED_PAYLOAD_VERSION) return null

  const iv = decodeBase64(payload.iv)
  const cipherBytes = decodeBase64(payload.data)
  const masterKey = await getMasterKey()
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    cipherBytes,
  )

  try {
    return JSON.parse(new TextDecoder().decode(decrypted))
  } catch {
    return null
  }
}

export async function deleteEncryptedSetting(ledgerId, key) {
  await removeSetting(ledgerId, key)
}
