# Backend-Deployment-And-Health

## 目的

後端有任何改動時，必須在 **StrawMB runtime 容器內**安裝 native 依賴，然後**重啟容器**。只跑 install 不算部署完成。

## 強制流程

```bash
cd /mnt/data/code/project/StrawCoding/StrawMoneyBook/backend
npm run deploy:copy          # rsync + 容器內 npm install + better-sqlite3 驗證
docker restart StrawMB       # 或 1Panel 重啟同名服務
```

`deploy:install` 只跑安裝腳本，**不是**完整發佈。`deploy:copy` 成功後若沒重啟，行程仍載入舊 native／舊 JS。

## 為什麼必須在容器內 install

`better-sqlite3` 綁 Node ABI 與 libc。在 host 上 `npm install` 會出現：

- `Module did not self-register`
- `NODE_MODULE_VERSION mismatch`
- `ERR_DLOPEN_FAILED`（GLIBC_*）

腳本：[`backend/scripts/deploy-production-install.mjs`](../../backend/scripts/deploy-production-install.mjs)  
映像必須與 StrawMB 相同 `1panel/node:<NODE_VERSION>`。docker 不可用就**中止**，不要退回 host install。

## 健康檢查

```bash
curl -fsS https://api.strawmb.com/health
# 本機：curl -fsS http://127.0.0.1:8787/health
```

失敗時順序：容器是否在跑 → native 載入錯誤 → 環境變數 fail-closed → 再重跑 `deploy:copy` + restart。

Runtime env 參考：`/opt/1panel/runtime/node/StrawMB/.env`（不要把 secret 寫進 wiki）。

## 引用

- [`backend/package.json`](../../backend/package.json)
- [Troubleshooting](Troubleshooting)
