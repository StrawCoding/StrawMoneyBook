#!/usr/bin/env node
// SMB-256: Install StrawMB backend production dependencies INSIDE a container
// image that matches the StrawMB runtime (1panel/node:<NODE_VERSION>).
//
// Native bindings (better-sqlite3) are ABI- and libc-specific. Running
// `npm install` on the deploy host compiles/links them against the host Node ABI
// and host glibc, which then fail to load inside the StrawMB container during the
// deploy/restart window ("Module did not self-register" / NODE_MODULE_VERSION
// mismatch / ERR_DLOPEN_FAILED GLIBC_*). Installing inside the same image as the
// running container guarantees the bindings match the runtime that will load them.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_RUNTIME_ENV = '/opt/1panel/runtime/node/StrawMB/.env'
const DEFAULT_DEPLOY_DIR = '/mnt/data/Data/serviceApps/StrawMB'
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const PLAYWRIGHT_BROWSERS_PATH = '.server-data/playwright-browsers'

function fail(message) {
  console.error(`\n[deploy-production-install] ERROR: ${message}\n`)
  process.exit(1)
}

function parseEnvFile(path) {
  const out = {}
  if (!path || !existsSync(path)) return out
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...options })
}

function dockerAvailable() {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function imageExistsLocally(image) {
  try {
    execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const runtimeEnvPath = process.env.STRAWMB_RUNTIME_ENV || DEFAULT_RUNTIME_ENV
const env = parseEnvFile(runtimeEnvPath)

const deployDir = resolve(process.env.STRAWMB_DEPLOY_DIR || env.CODE_DIR || DEFAULT_DEPLOY_DIR)
const nodeVersion = (process.env.STRAWMB_NODE_VERSION || env.NODE_VERSION || '').trim()
const image = process.env.STRAWMB_NODE_IMAGE || (nodeVersion ? `1panel/node:${nodeVersion}` : '')
const registry = env.CONTAINER_PACKAGE_URL || DEFAULT_REGISTRY
const packageManager = (env.PACKAGE_MANAGER || 'npm').trim()

console.log('[deploy-production-install] StrawMB native dependency install (in-container)')
console.log(`  runtime env : ${runtimeEnvPath}${existsSync(runtimeEnvPath) ? '' : ' (missing, using defaults)'}`)
console.log(`  deploy dir  : ${deployDir}`)
console.log(`  node image  : ${image || '(unresolved)'}`)
console.log(`  registry    : ${registry}`)

if (!existsSync(deployDir)) {
  fail(`deploy dir not found: ${deployDir} (run rsync step first)`)
}
if (!existsSync(resolve(deployDir, 'package.json'))) {
  fail(`no package.json in deploy dir: ${deployDir}`)
}
if (packageManager !== 'npm') {
  fail(`unsupported PACKAGE_MANAGER "${packageManager}"; only npm is handled by this script`)
}
if (!image) {
  fail(
    'could not resolve the StrawMB node image. Set NODE_VERSION in the 1Panel runtime env ' +
      `(${runtimeEnvPath}) or pass STRAWMB_NODE_IMAGE / STRAWMB_NODE_VERSION.`,
  )
}
if (!dockerAvailable()) {
  fail(
    'docker is not available. Native deps MUST be installed inside the StrawMB container image ' +
      'to match the runtime ABI/libc; aborting instead of falling back to host npm install (SMB-256).',
  )
}

if (!imageExistsLocally(image)) {
  console.log(`[deploy-production-install] image ${image} not present locally, pulling...`)
  try {
    run('docker', ['pull', image])
  } catch {
    fail(`failed to pull image ${image}. Ensure the StrawMB 1Panel runtime image is available.`)
  }
}

const dockerArgs = [
  'run',
  '--rm',
  '-v',
  `${deployDir}:/app`,
  '-w',
  '/app',
  '-e',
  'PLAYWRIGHT_INSTALL_BROWSERS=1',
  '-e',
  `PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}`,
  '-e',
  `npm_config_registry=${registry}`,
  image,
  'npm',
  'install',
]

console.log(`\n[deploy-production-install] docker ${dockerArgs.join(' ')}\n`)
try {
  run('docker', dockerArgs)
} catch (error) {
  fail(`in-container npm install failed: ${error?.message || error}`)
}

console.log('\n[deploy-production-install] verifying better-sqlite3 loads inside the runtime image...')
const verifyScript =
  "const D=require('better-sqlite3');const db=new D(':memory:');" +
  "const v=db.prepare('select 1 as ok').get().ok;db.close();" +
  "if(v!==1){throw new Error('unexpected query result');}" +
  "console.log('[verify] better-sqlite3 OK on node '+process.version+' (ABI '+process.versions.modules+')');"
try {
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${deployDir}:/app`,
    '-w',
    '/app',
    image,
    'node',
    '-e',
    verifyScript,
  ])
} catch (error) {
  fail(
    'better-sqlite3 failed to load inside the runtime image after install. ' +
      `This indicates an ABI/libc mismatch was not resolved: ${error?.message || error}`,
  )
}

console.log('\n[deploy-production-install] done. Native deps match the StrawMB runtime image.')
