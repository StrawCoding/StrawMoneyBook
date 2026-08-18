# StrawMoneyBook Release Checklist

## Automated Gates
- Backend: `cd backend && npm run check`
- Frontend node tests + web build: `cd frontend && npm run check`
- If SQLite or shared-ledger code changed, re-run the dedicated frontend node tests locally before Android packaging.

## Android Manual Validation
- Clear app data or reinstall the app, then cold start and confirm initialization succeeds.
- Validate old-database upgrade on a device/emulator that already contains local data.
- If SQLite migration logic changed, confirm recovery DB fallback is not triggered unexpectedly.
- If Android home widgets changed, add each widget type once, resize it across supported sizes, and confirm deep links and rendered summaries still work.

## Shared Ledger Validation
- Create a shared ledger from an existing local ledger.
- Invite another account by email and join from the invited account.
- Verify shared-ledger snapshot sync, tombstones, and recreated rows behave correctly.
- Verify membership-gated shared-ledger access still returns the expected blocked state for free users.

## Membership Validation
- Confirm Google Play membership warmup and entitlement sync complete without blocking app launch.
- Verify monthly membership grace behavior after a simulated backend sync failure.
- Verify lifetime membership still grants access without cache expiry.
- Confirm the membership benefits gate still redirects correctly when free-tier limits are exceeded.

## Backend Validation
- Check `GET /health` returns `ok: true`.
- Verify auth login/refresh/logout flows still work with rotated refresh tokens.
- Verify shared-ledger API routes still return the same JSON shape used by the frontend.
- Confirm `collab-store.sqlite` backup exists and is newer than the last release window. See `docs/backup-strategy.md`. Restore drill: stop API → replace sqlite from `.server-data/backups/` → integrity_check → start API → login + open one shared ledger.
