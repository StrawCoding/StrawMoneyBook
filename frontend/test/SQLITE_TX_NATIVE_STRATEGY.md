# ART-01 — Capacitor / Native SQLite Transaction Verification Strategy

> Layer D (Plan v2 §4). CI cannot fully replace device/emulator evidence.
> Product code under test: `frontend/src/core/db/sqlite.js` (+ write-queue / tx-context).

## Goal

Prove on a real Capacitor SQLite connection that:

1. Two concurrent outer `withTransaction` calls never share one `BEGIN`.
2. T1 `ROLLBACK` never removes rows committed by T2 (and vice versa).
3. Nested `withTransaction` in the same async call stack joins the owner context (no second `BEGIN`).
4. Web persist (`saveToStore`) still runs once on successful outermost commit only.

## Environments

| Tier | Where | When |
|------|--------|------|
| D0 Manual | Android emulator / physical device (debug APK) | Before merging ART-02 to release closeout; after any sqlite txn regression |
| D1 Scheduled | Optional GitHub Action with Android emulator (non-blocking) | Weekly or pre-release |
| D2 CI gate | Node ART-01 suite (sql.js + scheduler) | Every PR / `npm run test:node` |

D2 is mandatory. D0 is mandatory before Play/upload closeout that includes sqlite txn changes. D1 is optional.

## Instrumentation draft (Android debug)

Add a temporary debug-only probe (do **not** ship in release) or use Chrome remote debugging on WebView:

```js
// Paste in WebView console after app init, or behind VITE_DEBUG_SQLITE_TX=1
import { withTransaction, run, query } from '@/core/db/sqlite'

async function probeIsolation() {
  await Promise.all([
    withTransaction(async () => {
      await run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        '__tx_probe_a',
        String(Date.now()),
      ])
      await new Promise((r) => setTimeout(r, 200))
      throw new Error('probe-rollback-a')
    }).catch(() => {}),
    withTransaction(async () => {
      await run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        '__tx_probe_b',
        'ok',
      ])
    }),
  ])
  const rows = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('__tx_probe_a','__tx_probe_b')",
  )
  console.log('[sqlite-tx-native]', rows)
  // Expect: only __tx_probe_b present
}
```

### Manual steps

1. `cd frontend && ANDROID_HOME=/opt/android-sdk npm run debug` (or assembleDebug).
2. Install APK on emulator/device; open app; complete onboarding if needed.
3. Attach `chrome://inspect` → WebView console (or enable debug probe flag).
4. Run `probeIsolation()` twice; confirm only `__tx_probe_b` remains.
5. Run a normal expense create + delete smoke; confirm no UI/store corruption.
6. Delete probe keys; uninstall debug build when done.

## Pass / Fail criteria

| Check | Pass |
|-------|------|
| Concurrent outer isolation | After A-rollback∥B-commit, only B’s probe row exists |
| Nested join | Nested call does not throw “cannot begin”; single commit persists once |
| No deadlocks | 20 rapid FAB saves do not hang |
| Regression | `npm run test:node` includes ART-01 files green |

## Evidence to attach

- Emulator/device model + API level
- App `versionName` / commit SHA
- Console log of `[sqlite-tx-native]` rows
- Screenshot optional

## Out of scope

- Wear OS MessageClient path (separate companion DB rules)
- Backend collab SQLite
- SAVEPOINT (future task; nested failure = whole outer failure)
