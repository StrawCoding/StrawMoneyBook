# Backups-And-Restore

## 目的
把 collab-store 的備份/還原流程固化成可執行 runbook，避免「備份不完整或還原步驟不一致」造成不可逆資料遺失。

## 備份（collab-store sqlite）
- `backend && npm run backup:collab`

備份的「唯一耐久來源」是：
- `backend/.server-data/collab-store.sqlite`
- production volume：`/mnt/data/Data/serviceApps/StrawMB/.server-data/collab-store.sqlite`

執行後會產出：
- `.server-data/backups/collab-store-YYYYMMDDTHHMMSSZ.sqlite`
並保留最新 `SHARED_LEDGER_BACKUP_KEEP`（預設 14）份。

## 還原演練（Restore drill）
依 `docs/backup-strategy.md` 的步驟：
1. 停止寫入：例如 `docker stop StrawMB`（或同等停止 API/容器寫入）
2. 置換壞檔：`mv collab-store.sqlite collab-store.sqlite.broken`
3. 用備份覆蓋：`cp backups/collab-store-<stamp>.sqlite collab-store.sqlite`
4. 驗證可打開且完整性正常：`sqlite3 collab-store.sqlite 'PRAGMA integrity_check; SELECT COUNT(*) FROM users;'`
5. 啟動 API 並驗證：`docker start StrawMB`、`GET /health`、登入並開啟至少一個 shared ledger

> 原則：不要在 API 還持有檔案時做 Restore；也不要把 `SHARED_LEDGER_DB_FILE` 直接指向備份檔原地覆寫（避免下一輪備份 prune 把「活檔」一起刪掉）。

## 引用來源
- [`docs/backup-strategy.md`](../backup-strategy.md)
- [`docs/google-backend-auth.md`](../google-backend-auth.md)（若還原後涉及驗證/授權排查）

