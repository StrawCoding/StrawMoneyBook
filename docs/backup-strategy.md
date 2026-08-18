# StrawMoneyBook collab-store backup

`backend/.server-data/collab-store.sqlite` is the only durable source for accounts, password hashes, refresh-token hashes, shared-ledger snapshots, and referral data. Losing this file without a restore path is unrecoverable for every user of the hosted API.

## What is backed up

| Path | Contents |
| --- | --- |
| `SHARED_LEDGER_DB_FILE` or `backend/.server-data/collab-store.sqlite` | users, shared ledgers, invitations, referrals |
| Production volume | `/mnt/data/Data/serviceApps/StrawMB/.server-data/collab-store.sqlite` (`deploy:copy` already preserves `.server-data`) |

Frontend Google Drive / WebDAV backups are **user ledger** backups. They do not replace this file.

## How to take a backup

From `backend/`:

```bash
npm run backup:collab
```

The script uses better-sqlite3 `backup()` (online-safe copy), writes:

```
.server-data/backups/collab-store-YYYYMMDDTHHMMSSZ.sqlite
```

and keeps the newest `SHARED_LEDGER_BACKUP_KEEP` files (default 14).

| Env | Purpose |
| --- | --- |
| `SHARED_LEDGER_DB_FILE` | Source sqlite path |
| `SHARED_LEDGER_BACKUP_DIR` | Destination directory |
| `SHARED_LEDGER_BACKUP_KEEP` | Retention count |

Production example (host, against the live volume):

```bash
SHARED_LEDGER_DB_FILE=/mnt/data/Data/serviceApps/StrawMB/.server-data/collab-store.sqlite \
SHARED_LEDGER_BACKUP_DIR=/mnt/data/Data/serviceApps/StrawMB/.server-data/backups \
node /mnt/data/Data/serviceApps/StrawMB/scripts/backup-collab-store.mjs
```

Recommended cadence: daily via systemd timer or cron. Off-host copies of `.server-data/backups/` should be kept separately (disk failure on the API host would otherwise take the backups with the live file).

## Restore drill

1. Stop writes: `docker stop StrawMB` (or equivalent).
2. Move the damaged file aside: `mv collab-store.sqlite collab-store.sqlite.broken`.
3. Copy a backup over the live path: `cp backups/collab-store-<stamp>.sqlite collab-store.sqlite`.
4. Confirm the copy opens: `sqlite3 collab-store.sqlite 'PRAGMA integrity_check; SELECT COUNT(*) FROM users;'`
5. Start the API: `docker start StrawMB` and hit `GET /health`.
6. Log in as a known user and open one shared ledger.

Do not restore while the API still has the file open. Do not point `SHARED_LEDGER_DB_FILE` at a backup in-place without copying first — the next backup prune must not delete the live database.
