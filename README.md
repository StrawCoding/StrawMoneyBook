<p align="center">
  <img src="./assets/V4-3.png" alt="StrawMoneyBook logo" width="220">
</p>

# StrawMoneyBook

StrawMoneyBook 是一款以個人現金流管理為核心的記帳 App。它不只處理收入與支出，也把預算、資產負債、借貸、報銷、請款、存錢罐、訂閱、同步與備份整合在同一套帳本工作流中，適合長期追蹤個人、家庭、專案或副業金流。

## 特色

- 📒 **多帳本管理**：以活動帳本為中心切換個人、家庭、專案或副業資料。
- ✍️ **三種記帳模式**：支援 AI 自動記帳、手動快速新增與問答式記帳。
- 📊 **預算與分析**：提供月預算、分類預算、日均規則、收支圖表、分類 / 帳戶分析與報表匯出。
- 💰 **資產與負債**：管理帳戶餘額、帳戶群組、總資產、可支配金額與負債摘要。
- 🤝 **借貸、報銷與請款**：追蹤借出 / 借入、還款、報銷狀態、代收抵扣與請款單匯出。
- 🫙 **存錢罐與訂閱**：管理儲蓄目標、預算剩餘自動存入與週期性訂閱扣款。
- ☁️ **同步與備份**：支援 Google Drive 帳本同步、Google Drive / WebDAV 自動備份與共同帳本。
- 📱 **Android 原生整合**：包含小工具、安全鎖、Google Identity、語音輸入、通知提醒與部分自動化能力。

## 技術棧

| 區域 | 技術 |
|---|---|
| Monorepo | npm scripts |
| Frontend | Vue 3、Vite、Pinia、Vue Router |
| App Runtime | Capacitor 8、Android |
| Local Data | SQLite / sql.js / WASM |
| Backend | Node.js、better-sqlite3 |
| 測試 | Node test runner、Vite build、專案腳本 smoke tests |

## 專案結構

```text
.
├── frontend/   # Vue + Vite + Capacitor App
├── backend/    # 共同帳本、帳號、邀請碼與管理 API
├── docs/       # 架構、發版與整合文件
├── scripts/    # 根目錄檢查腳本
└── README.md
```

## 快速開始

需求：

- Node.js `^20.19.0 || >=22.12.0`
- npm

安裝依賴：

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

啟動前端（`npm run dev` 預設連正式營運 API `https://api.strawmb.com`，不必先開本機後端）：

```bash
npm run dev:frontend
```

若要改打本機後端，在 `frontend/.env.development.local` 覆寫 `VITE_SHARED_LEDGER_API_BASE_URL=http://127.0.0.1:8787`（及其餘 `VITE_*_API_BASE_URL`），再啟動：

```bash
npm run dev:backend
```

## 常用指令

```bash
npm run test:frontend
npm run test:backend
npm run test

npm run check:frontend
npm run check:backend
npm run check
```

前端 Android 相關指令位於 `frontend/package.json`，包含 `sync:android`、`build`、`aab:build` 與發版輔助腳本。

## 文件索引

- 官方開發者 Wiki（VitePress）：[https://strawcoding.github.io/StrawMoneyBookWiki/](https://strawcoding.github.io/StrawMoneyBookWiki/)（架構／功能域／Operations runbook）。來源 repo：[`StrawCoding/StrawMoneyBookWiki`](https://github.com/StrawCoding/StrawMoneyBookWiki)。
- `docs/wiki/`：操作 Wiki 的 in-repo 快照；改完須同步進 StrawMoneyBookWiki。
- `StrawMoneyBook_App_Features_Detailed.md`：產品能力、使用情境、限制與差異化說明。
- `frontend/StrawMoneyBook_Features_Map.md`：功能、路由、元件、Store、Service、Repository 對應表。
- `docs/architecture-review-smb-130.md`：架構整理與分層檢視。
- `docs/backup-strategy.md`：後端 collab-store 備份與還原。
- `docs/release-checklist.md`：發版檢查清單。
- `docs/google-backend-auth.md`：Google backend auth 整合說明。

## 維護原則

- 功能調整後需同步檢查 `StrawMoneyBook_App_Features_Detailed.md` 與 `frontend/StrawMoneyBook_Features_Map.md`。
- 有任何程式或文件改動，都需要執行對應測試或檢查。
- 若改到網頁元件，需使用 Playwright 檢查實際畫面。
- GitHub 主要分支為 `main`。

