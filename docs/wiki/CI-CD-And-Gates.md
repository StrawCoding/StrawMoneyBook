# CI-CD-And-Gates

## 目的
把 GitHub Actions 的「自動門檻」與重要副流程（Playwright suites、release sync-check、Android unit tests）整理成可對照的 Runbook。

## 主要資料來源
- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

## 關鍵 Gate（對照表）
### Backend
- `backend && npm run check`

### Frontend（Node test + Web build + release notes/checklist）
- `frontend && npm run check`
- 檢查 `../release-notes.pending.md` 是否存在
- `npm run release:sync-check`：確保 `frontend/package.json` version 與最新 git tag 一致

### 具體流程（可照跑的重點指令）
#### Backend job（CI）
```bash
cd backend
npm ci
npm run check
```

#### Frontend job（CI）
```bash
cd frontend
npm ci
npm run check
test -f ../release-notes.pending.md
npm run release:sync-check
```
接著在 CI 會：
- 安裝 Android SDK
- `npm run prepare:android:release`
- 在 `frontend/android` 跑 Android/Wear unit tests（gradle）

#### Playwright jobs（CI）
```bash
cd frontend
npm ci
CI=true PLAYWRIGHT_BROWSERS_PATH=../backend/.server-data/playwright-browsers npm run playwright:ui-layout
```
（實際由 workflow 決定要跑哪個 suite）

### Android / Wear 單元測試
- `./gradlew :app:testDebugUnitTest :wear:testDebugUnitTest`

### Playwright（高風險 UI/功能）
CI 內分別跑多個 workflow jobs（例如：`playwright:ui-layout`、`playwright:budget-save`、`playwright:carrier-sync`、`playwright:analysis-export` 等）。

## 引用來源
- [`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

