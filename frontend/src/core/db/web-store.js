import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'

const WASM_PATH = `${import.meta.env.BASE_URL}assets`.replace(/\/{2,}/g, '/')
let webStorePromise = null
let registerPromise = null

async function ensureJeepSqliteRegistered() {
  if (customElements.get('jeep-sqlite')) return

  if (!registerPromise) {
    registerPromise = (async () => {
      try {
        await jeepSqlite(window)
      } catch (error) {
        console.warn('[sqlite] loader registration failed, fallback to esm bundle', error)
        await import('jeep-sqlite/dist/jeep-sqlite/jeep-sqlite.esm.js')
      }
    })()
  }

  await registerPromise
  if (!customElements.get('jeep-sqlite')) {
    throw new Error('jeep-sqlite custom element registration failed')
  }
  await customElements.whenDefined('jeep-sqlite')
}

export async function ensureWebSqliteStoreReady() {
  if (Capacitor.getPlatform() !== 'web') return
  if (webStorePromise) return webStorePromise

  webStorePromise = (async () => {
    await ensureJeepSqliteRegistered()

    const el = document.querySelector('jeep-sqlite') ?? document.createElement('jeep-sqlite')
    // Stencil prop `wasmPath` reflects as HTML attribute `wasmpath` (not `wasm-path`).
    el.wasmPath = WASM_PATH
    el.setAttribute('wasmpath', WASM_PATH)

    if (!el.parentElement) {
      document.body.appendChild(el)
    }

    // Give Stencil one tick after DOM attach before opening the web store.
    await Promise.resolve()

    const sqlite = new SQLiteConnection(CapacitorSQLite)
    await sqlite.initWebStore()
  })().catch((error) => {
    webStorePromise = null
    throw error
  })

  return webStorePromise
}
