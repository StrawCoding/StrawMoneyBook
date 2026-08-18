#!/usr/bin/env node
import { backupCollabStore } from '../src/collab/backup-store.js'

const result = await backupCollabStore()
process.stdout.write(`${JSON.stringify({
  ok: true,
  sourcePath: result.sourcePath,
  destPath: result.destPath,
  kept: result.kept.length,
  pruned: result.pruned.length,
}, null, 2)}\n`)
