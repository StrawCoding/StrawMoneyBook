import { pathToFileURL } from 'node:url'
import { resolve as resolvePath, extname } from 'node:path'
import { existsSync } from 'node:fs'

const SRC_ROOT = resolvePath(import.meta.dirname, '../../src')

function resolveAliasTarget(specifier) {
  const base = resolvePath(SRC_ROOT, specifier.slice(2))
  if (extname(base)) return base
  if (existsSync(`${base}.js`)) return `${base}.js`
  if (existsSync(resolvePath(base, 'index.js'))) return resolvePath(base, 'index.js')
  return base
}

// Resolves Vite-style "@/..." aliases to the local src directory so that
// alias-dependent modules can be exercised behaviourally under `node --test`.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = resolveAliasTarget(specifier)
    return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
