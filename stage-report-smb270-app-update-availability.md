# SMB-270 Stage Report: App 更新可見性

## 變更
- App repo `StrawMoneyBook`：
  - 新增 `frontend/test/app-update-availability-source.test.js`，鎖定 `frontend/public/app-update.json` 的 `latestVersion` 與 `frontend/package.json` 版本一致，並檢查正式 primary/fallback 更新 URL、HTML fallback 偵測、Play API route 行為。
  - 更新 `release-notes.pending.md`，加入 SMB-270 pending release note。
- 官網 repo `StrawMoneyBookWeb`：
  - 新增 `public/app-update.json`。
  - 新增 `public/api/app-update/play`，以 GitHub Pages 靜態 JSON 提供既有 App 使用的 Play fallback endpoint。
  - 新增 `scripts/check-app-update-json.mjs` 與 `npm run check`，驗證兩個公開 JSON endpoint 的版本欄位一致。

## 版本與更新來源
- `frontend/package.json`：`1.3.59`。
- `frontend/public/app-update.json`：`latestVersion = 1.3.59`。
- 正式 primary manifest：`https://www.strawmb.com/app-update.json`。
- 正式 fallback / Play API：`https://www.strawmb.com/api/app-update/play`。
- root domain `https://strawmb.com/*` 仍由 GitHub Pages redirect 到 `www.strawmb.com/*`，已驗證 redirect 後為 JSON。

## 公開 endpoint curl 證據
最後重驗時間：2026-07-13 09:04 Asia/Taipei。

- `curl -fsS --max-time 20 https://www.strawmb.com/app-update.json`：
  - `{"latestVersion":"1.3.59","playUrl":"https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook","message":""}`
- `curl -fsS --max-time 20 https://www.strawmb.com/api/app-update/play`：
  - `{"appId":"com.strawcoding.strawmoneybook","latestVersion":"1.3.59","version":"1.3.59","playUrl":"https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook","source":"official_site_static","message":""}`
- `curl -fsS -L --max-time 20 https://strawmb.com/app-update.json`：
  - `{"latestVersion":"1.3.59","playUrl":"https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook","message":""}`
- `curl -fsS -L --max-time 20 https://strawmb.com/api/app-update/play`：
  - `{"appId":"com.strawcoding.strawmoneybook","latestVersion":"1.3.59","version":"1.3.59","playUrl":"https://play.google.com/store/apps/details?id=com.strawcoding.strawmoneybook","source":"official_site_static","message":""}`

## 測試
- App repo：
  - `git diff --check`：通過。
  - `cd frontend && npm run test:node`：686/686 pass（2026-07-13 09:04 重跑）。
  - `cd frontend && npm run build:web`：成功（2026-07-13 09:04 重跑）；僅既有 Vite chunk / dynamic import warnings。
  - GitHub Actions CI run `29216274369`（`d0b2a5c361c6afa4e3653f27a343a3934458e198`）：backend / frontend 成功。
- 官網 repo：
  - `git diff --check`：通過。
  - `npm run check`：成功，包含 JSON endpoint 檢查與 Vite build。
  - GitHub Actions main workflow run `29215717106`：成功。
  - GitHub Pages deployment run `29215725036`：成功。

## 部署
- 官網 repo `StrawMoneyBookWeb` main commit：`d163f75c7d016c52022e13ae31bd44df91d00aab`。
- Pages deploy branch `Web-Page` commit：`ccaaabe61efda009821486e07ab606e5654901dc`。
- App repo功能修復 commit：`c3365df53e4ef98613a1113fb98acd5dab6ddbc8`。
- App repo前一版 stage report commit：`2cda456d5fa9a00610afdb1d23439241345a66f4`。
- App repo 09:04 CI 驗證基準 commit：`d0b2a5c361c6afa4e3653f27a343a3934458e198`。
- 本階段未修改 `backend`，未執行 `backend npm run deploy:copy`，未重啟 StrawMB。
- 未執行 `npm run gpr`，未修改版本號，未 tag / 發版。

## 建議狀態
- 建議 Hermes 依公開 endpoint 與 CI 證據進行 mark。
- 官網 repo 仍有非本階段既有未提交變更：`src/views/home.vue`；本階段未讀寫或提交該檔。
