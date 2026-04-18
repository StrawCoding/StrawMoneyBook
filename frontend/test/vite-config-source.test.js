import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viteConfigSource = readFileSync(
  resolve(import.meta.dirname, '../vite.config.js'),
  'utf8',
)

test('vite build excludes the local api dev plugin and lazy-loads api routes at runtime', () => {
  assert.match(viteConfigSource, /if \(command !== 'build'\) \{\s*plugins\.push\(localApiDevPlugin\(\)\)/)
  assert.match(viteConfigSource, /function createRouteModuleLoader\(relativePath\)/)
  assert.match(viteConfigSource, /pathToFileURL/)
  assert.match(viteConfigSource, /import\(\/\* @vite-ignore \*\/ moduleUrl\)/)
  assert.match(viteConfigSource, /'\/api\/invoice\/link_session': createRouteModuleLoader\('\.\/api\/invoice\/link_session\.js'\)/)
  assert.match(viteConfigSource, /'\/api\/invoice\/session_status': createRouteModuleLoader\('\.\/api\/invoice\/session_status\.js'\)/)
})
