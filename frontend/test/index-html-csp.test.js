/**
 * SMB-233 / v1.3.16：Web 版 jeep-sqlite 需 script-src 'wasm-unsafe-eval'，否則載具與所有 DB 功能失效。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const indexHtml = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8')

test('index.html CSP 允許 WebAssembly 編譯（wasm-unsafe-eval）', () => {
  assert.match(indexHtml, /script-src[^;]*'wasm-unsafe-eval'/)
})

test('index.html CSP 不使用 unsafe-eval（保留 SMB-233 XSS 防護）', () => {
  const cspMatch = indexHtml.match(/Content-Security-Policy"\s+content="([^"]+)"/)
  assert.ok(cspMatch, 'CSP meta tag should exist')
  const scriptSrc = cspMatch[1].match(/script-src[^;]*/)?.[0] ?? ''
  assert.doesNotMatch(scriptSrc, /'unsafe-eval'/)
  assert.match(scriptSrc, /'self'/)
})

test('index.html CSP connect-src 允許 einvoice API 主機', () => {
  assert.match(indexHtml, /connect-src[^;]*https:\/\/api\.strawmb\.com/)
})
