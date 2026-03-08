# File-Level 單獨驗收報告

- 日期：2026-02-26
- 檔案總數：245
- 靜態引用邊數：1040
- 決策統計：保留 209 / 重構 33 / 刪除 3

## 高優先發現
1. `src/ui/views/settings/SettingsBankSyncPage.vue` 無 route、無 import，屬可達性 0 的死頁面。
2. 銀行同步子系統目前屬「部分接線」：API/Service/Repo 存在，但 UI 入口未上線。
3. 多個超大檔（500~2100 行）可重構以降低維護成本與 bundle 風險。

## 檔案清單（逐檔）
| 檔案 | 用途 | 使用證據（引用點） | 建議動作 | 風險 | 影響範圍 |
|---|---|---|---|---|---|
| .codex_snapshots/strawmoneybook_snapshot_20260208_053227.tar.gz | 本地快照封存檔 | ENTRY/基礎設定檔（非被 import 使用） | 刪除：移除未使用或非產品輸出檔 | Low | 僅影響倉庫體積，不影響執行 |
| .codex_snapshots/strawmoneybook_snapshot_20260208_053235.tar.gz | 本地快照封存檔 | ENTRY/基礎設定檔（非被 import 使用） | 刪除：移除未使用或非產品輸出檔 | Low | 僅影響倉庫體積，不影響執行 |
| .env | 本機環境變數 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| .gitignore | 專案檔案 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| .vscode/settings.json | 專案檔案 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| StrawMoneyBook_App_Features_Detailed.md | 專案文件 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| StrawMoneyBook_Features_Map.md | 專案文件 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/.gitignore | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/.gitignore | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/build.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/capacitor.build.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/proguard-rules.pro | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/AndroidManifest.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-hdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-ldpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-mdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-hdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-ldpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-mdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-xhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-xxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-night-xxxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-xhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-xxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-land-xxxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-night/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-hdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-ldpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-mdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-hdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-ldpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-mdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-xhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-xxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-night-xxxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-xhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-xxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-port-xxxhdpi/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable/ic_launcher_background.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/drawable/splash.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/layout/activity_main.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-ldpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-ldpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-ldpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-ldpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/values/ic_launcher_background.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/values/strings.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/values/styles.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/main/res/xml/file_paths.xml | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/build.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/capacitor.settings.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/gradle.properties | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/gradle/wrapper/gradle-wrapper.jar | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/gradle/wrapper/gradle-wrapper.properties | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/gradlew | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/gradlew.bat | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/settings.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| android/variables.gradle | Android native 專案與資源 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| api/bank/_mock-provider.js | Serverless API 路由（Vercel Function） | api/bank/exchange.js:1 [import]<br>api/bank/exchange.js:1 [template-ref]<br>api/bank/sync.js:1 [import]<br>+1 more | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/_utils.js | Serverless API 路由（Vercel Function） | api/bank/_mock-provider.js:1 [import]<br>api/bank/_mock-provider.js:1 [template-ref]<br>api/bank/disconnect.js:1 [import]<br>+9 more | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/disconnect.js | Serverless API 路由（Vercel Function） | src/services/bank-sync/backend.js:92 [open-api] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/exchange.js | Serverless API 路由（Vercel Function） | src/services/bank-sync/backend.js:84 [open-api] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/link_session.js | Serverless API 路由（Vercel Function） | src/services/bank-sync/backend.js:80 [open-api] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/mark_imported.js | Serverless API 路由（Vercel Function） | src/services/bank-sync/backend.js:96 [open-api] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/bank/sync.js | Serverless API 路由（Vercel Function） | src/services/bank-sync/backend.js:88 [open-api] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| api/exchange-rate/cbc.js | Serverless API 路由（Vercel Function） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| api/google/oauth/exchange.js | Serverless API 路由（Vercel Function） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| api/google/oauth/refresh.js | Serverless API 路由（Vercel Function） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| capacitor.config.json | Capacitor 設定 | src/ui/services/app-update.service.js:1 [import]<br>src/ui/services/app-update.service.js:1 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| index.html | Web 入口 HTML | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| jsconfig.json | JS/IDE 路徑別名設定 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| package-lock.json | 依賴鎖檔 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| package.json | 套件與腳本入口 | src/core/services/membership.service.js:1 [import]<br>src/core/services/membership.service.js:1 [template-ref]<br>src/ui/services/app-update.service.js:2 [import]<br>+3 more | 保留：維持現狀 | Low | 無行為變更 |
| public/_redirects | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/app-update.json | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-128.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-192.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-256.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-48.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-512.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-72.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/icons/icon-96.webp | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/assets/sql-wasm.wasm | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| public/manifest.webmanifest | 公開靜態資源（由 Vite 原樣輸出） | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| resources/icon.png | Capacitor 圖示/啟動畫面來源 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| resources/splash.png | Capacitor 圖示/啟動畫面來源 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| scripts/audit-i18n.mjs | 開發/建置輔助腳本 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| scripts/bump-android-version-code.mjs | 開發/建置輔助腳本 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| scripts/patch-capacitor-sqlite-plugin.mjs | 開發/建置輔助腳本 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| scripts/simulate-google-backup-flow.mjs | 開發/建置輔助腳本 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| scripts/sync-app-update-manifest.mjs | 開發/建置輔助腳本 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrate.js | 資料庫初始化/遷移/連線層 | src/core/db/sqlite.js:3 [import]<br>src/core/db/sqlite.js:3 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/001_init.sql | SQLite migration SQL | src/core/db/migrate.js:1 [import]<br>src/core/db/migrate.js:1 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/002_transaction_reimbursement_flags.sql | SQLite migration SQL | src/core/db/migrate.js:2 [import]<br>src/core/db/migrate.js:2 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/003_transaction_budget_analysis_flags.sql | SQLite migration SQL | src/core/db/migrate.js:3 [import]<br>src/core/db/migrate.js:3 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/004_account_category_icons.sql | SQLite migration SQL | src/core/db/migrate.js:4 [import]<br>src/core/db/migrate.js:4 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/005_default_icons_backfill.sql | SQLite migration SQL | src/core/db/migrate.js:5 [import]<br>src/core/db/migrate.js:5 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/006_ledger_sort_order.sql | SQLite migration SQL | src/core/db/migrate.js:6 [import]<br>src/core/db/migrate.js:6 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/007_remove_default_sample_transaction.sql | SQLite migration SQL | src/core/db/migrate.js:7 [import]<br>src/core/db/migrate.js:7 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/008_bank_sync.sql | SQLite migration SQL | src/core/db/migrate.js:8 [import]<br>src/core/db/migrate.js:8 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/009_allow_zero_amount_transaction.sql | SQLite migration SQL | src/core/db/migrate.js:9 [import]<br>src/core/db/migrate.js:9 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/migrations/010_account_include_in_assets.sql | SQLite migration SQL | src/core/db/migrate.js:10 [import]<br>src/core/db/migrate.js:10 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/sqlite.js | 資料庫初始化/遷移/連線層 | src/core/repositories/account.repo.js:1 [import]<br>src/core/repositories/account.repo.js:1 [template-ref]<br>src/core/repositories/bank-sync.repo.js:1 [import]<br>+35 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/db/web-store.js | 資料庫初始化/遷移/連線層 | src/core/db/sqlite.js:4 [import]<br>src/core/db/sqlite.js:4 [template-ref]<br>src/main.js:125 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/account.repo.js | SQLite Repository（資料存取層） | src/core/services/import.service.js:7 [import]<br>src/core/services/import.service.js:7 [template-ref]<br>src/core/services/reimbursement.service.js:11 [import]<br>+3 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/bank-sync.repo.js | SQLite Repository（資料存取層） | src/ui/services/bank-sync.service.js:3 [import]<br>src/ui/services/bank-sync.service.js:21 [template-ref] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| src/core/repositories/base.repo.js | SQLite Repository（資料存取層） | src/core/repositories/account.repo.js:3 [import]<br>src/core/repositories/account.repo.js:3 [template-ref]<br>src/core/repositories/bank-sync.repo.js:2 [import]<br>+17 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/budget.repo.js | SQLite Repository（資料存取層） | src/core/services/budget.service.js:2 [import]<br>src/core/services/budget.service.js:10 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/category.repo.js | SQLite Repository（資料存取層） | src/core/services/import.service.js:8 [import]<br>src/core/services/import.service.js:13 [template-ref]<br>src/core/services/loan.service.js:4 [import]<br>+7 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/counterparty.repo.js | SQLite Repository（資料存取層） | src/core/services/loan.service.js:3 [import]<br>src/core/services/loan.service.js:3 [template-ref]<br>src/core/services/reimbursement.service.js:3 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/ledger.repo.js | SQLite Repository（資料存取層） | src/core/services/import.service.js:2 [import]<br>src/core/services/import.service.js:2 [template-ref]<br>src/ui/stores/ledger.store.js:2 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/loan.repo.js | SQLite Repository（資料存取層） | src/core/services/loan.service.js:10 [import]<br>src/core/services/loan.service.js:24 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/reimbursement.repo.js | SQLite Repository（資料存取層） | src/core/services/reimbursement.service.js:21 [import]<br>src/core/services/reimbursement.service.js:32 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/settings.repo.js | SQLite Repository（資料存取層） | scripts/simulate-google-backup-flow.mjs:92 [template-ref]<br>src/core/services/seed.service.js:5 [import]<br>src/core/services/seed.service.js:5 [template-ref]<br>+8 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/repositories/transaction.repo.js | SQLite Repository（資料存取層） | src/core/services/import.service.js:4 [import]<br>src/core/services/import.service.js:4 [template-ref]<br>src/core/services/loan.service.js:25 [import]<br>+23 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/ai-bookkeeping-tiny-ner.service.js | Core 業務服務層 | src/core/services/ai-bookkeeping.service.js:1 [import]<br>src/core/services/ai-bookkeeping.service.js:1 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/ai-bookkeeping.service.js | Core 業務服務層 | src/ui/components/home/QuickAddSheet.vue:379 [import]<br>src/ui/components/home/QuickAddSheet.vue:379 [template-ref]<br>src/ui/views/AiAutoBookkeepingPage.vue:235 [import]<br>+1 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/bootstrap.service.js | Core 業務服務層 | src/main.js:124 [import]<br>src/main.js:124 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/services/budget.service.js | Core 業務服務層 | src/ui/stores/budget.store.js:3 [import]<br>src/ui/stores/budget.store.js:8 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/services/export.service.js | Core 業務服務層 | scripts/simulate-google-backup-flow.mjs:93 [template-ref]<br>src/ui/services/google-backup.service.js:2 [import]<br>src/ui/services/google-backup.service.js:2 [template-ref]<br>+8 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/google-play-billing.service.js | Core 業務服務層 | src/core/services/membership.service.js:2 [import]<br>src/core/services/membership.service.js:11 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/import.service.js | Core 業務服務層 | src/ui/views/settings/SettingsAutoBackupPage.vue:234 [import]<br>src/ui/views/settings/SettingsAutoBackupPage.vue:234 [template-ref]<br>src/ui/views/settings/SettingsDataManagementPage.vue:87 [import]<br>+1 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/loan.service.js | Core 業務服務層 | src/ui/stores/loan.store.js:3 [import]<br>src/ui/stores/loan.store.js:13 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/membership.service.js | Core 業務服務層 | src/core/services/import.service.js:5 [import]<br>src/core/services/import.service.js:5 [template-ref]<br>src/core/services/loan.service.js:31 [import]<br>+25 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/core/services/reimbursement.service.js | Core 業務服務層 | src/ui/stores/reimbursement.store.js:7 [import]<br>src/ui/stores/reimbursement.store.js:7 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/services/repair.service.js | Core 業務服務層 | src/core/services/import.service.js:6 [import]<br>src/core/services/import.service.js:6 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/services/seed.service.js | Core 業務服務層 | src/ui/stores/ledger.store.js:3 [import]<br>src/ui/stores/ledger.store.js:3 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/core/services/transaction.service.js | Core 業務服務層 | src/ui/stores/transaction.store.js:9 [import]<br>src/ui/stores/transaction.store.js:16 [template-ref]<br>src/ui/views/settings/SettingsDeveloperDebugPage.vue:114 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/core/utils/id.js | Core 通用工具 | src/core/repositories/account.repo.js:2 [import]<br>src/core/repositories/account.repo.js:2 [template-ref]<br>src/core/repositories/bank-sync.repo.js:3 [import]<br>+31 more | 保留：維持現狀 | Low | 無行為變更 |
| src/main.js | 專案檔案 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| src/services/bank-sync/backend.js | 平台/外部整合層服務 | src/ui/services/bank-sync.service.js:22 [import]<br>src/ui/services/bank-sync.service.js:29 [template-ref] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| src/services/google/auth.js | 平台/外部整合層服務 | src/ui/App.vue:68 [import]<br>src/ui/App.vue:68 [template-ref]<br>src/ui/services/google-backup.service.js:9 [import]<br>+1 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/services/google/drive-appdata-backup.js | 平台/外部整合層服務 | src/ui/services/google-backup.service.js:4 [import]<br>src/ui/services/google-backup.service.js:8 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/App.vue | 專案檔案 | src/main.js:122 [import]<br>src/main.js:122 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/assets/css/global.css | 專案檔案 | src/main.js:135 [import-side-effect]<br>src/main.js:135 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/assets/logo-icon.png | 專案檔案 | package.json:0 [npm-script] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/assets/logo.png | 專案檔案 | src/ui/App.vue:5 [template-ref]<br>src/ui/App.vue:23 [template-ref]<br>src/ui/views/WelcomePage.vue:10 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/budget/BudgetItemSheet.vue | 可重用 UI 元件 | src/ui/views/budgeting.vue:102 [import]<br>src/ui/views/budgeting.vue:102 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/budget/BudgetMiniPie.vue | 可重用 UI 元件 | src/ui/components/home/HomeBudgetSummaryCard.vue:36 [import]<br>src/ui/components/home/HomeBudgetSummaryCard.vue:36 [template-ref]<br>src/ui/views/budgeting.vue:103 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/AppDialog.vue | 可重用 UI 元件 | src/ui/App.vue:60 [import]<br>src/ui/App.vue:60 [template-ref]<br>src/ui/components/home/HomeTransactionEditSheet.vue:270 [import]<br>+23 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/CustomSelect.vue | 可重用 UI 元件 | src/ui/components/home/HomeTransactionEditSheet.vue:272 [import]<br>src/ui/components/home/HomeTransactionEditSheet.vue:272 [template-ref]<br>src/ui/components/home/QuickAddSheet.vue:378 [import]<br>+31 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/DateTimePickerField.vue | 可重用 UI 元件 | src/ui/components/home/HomeTransactionEditSheet.vue:271 [import]<br>src/ui/components/home/HomeTransactionEditSheet.vue:271 [template-ref]<br>src/ui/components/home/QuickAddSheet.vue:377 [import]<br>+7 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/HomeRangePicker.vue | 可重用 UI 元件 | src/ui/views/AnalysisPrintPage.vue:67 [import]<br>src/ui/views/AnalysisPrintPage.vue:67 [template-ref]<br>src/ui/views/TransactionSearchPage.vue:73 [import]<br>+5 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/LedgerSwitcher.vue | 可重用 UI 元件 | src/ui/views/assets.vue:102 [import]<br>src/ui/views/assets.vue:102 [template-ref]<br>src/ui/views/home.vue:83 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/MoneyText.vue | 可重用 UI 元件 | src/ui/components/home/HomeAssetSummaryCard.vue:40 [import]<br>src/ui/components/home/HomeAssetSummaryCard.vue:40 [template-ref]<br>src/ui/components/home/HomeBudgetSummaryCard.vue:35 [import]<br>+29 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/common/ToastHost.vue | 可重用 UI 元件 | src/ui/App.vue:59 [import]<br>src/ui/App.vue:59 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/home/HomeAssetSummaryCard.vue | 可重用 UI 元件 | src/ui/views/home.vue:79 [import]<br>src/ui/views/home.vue:79 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/home/HomeBudgetSummaryCard.vue | 可重用 UI 元件 | src/ui/views/home.vue:80 [import]<br>src/ui/views/home.vue:80 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/home/HomeTransactionEditSheet.vue | 可重用 UI 元件 | src/ui/views/TransactionAboutPage.vue:107 [import]<br>src/ui/views/TransactionAboutPage.vue:107 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/components/home/HomeTransactionFeed.vue | 可重用 UI 元件 | src/ui/views/home.vue:81 [import]<br>src/ui/views/home.vue:81 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/components/home/QuickAddSheet.vue | 可重用 UI 元件 | src/ui/views/home.vue:82 [import]<br>src/ui/views/home.vue:82 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/components/layout/BottomNav.vue | 可重用 UI 元件 | src/ui/App.vue:58 [import]<br>src/ui/App.vue:58 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/composables/use-speech-input.js | Vue composable | src/ui/components/home/QuickAddSheet.vue:382 [import]<br>src/ui/components/home/QuickAddSheet.vue:382 [template-ref]<br>src/ui/views/AiAutoBookkeepingPage.vue:237 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/constants/currency-options.js | 前端常數定義 | src/ui/components/common/MoneyText.vue:8 [import]<br>src/ui/components/common/MoneyText.vue:8 [template-ref]<br>src/ui/components/home/QuickAddSheet.vue:383 [import]<br>+17 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/router/index.js | 專案檔案 | src/core/services/membership.service.js:686 [dynamic-import]<br>src/core/services/membership.service.js:686 [template-ref]<br>src/main.js:123 [import]<br>+3 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/addon-template.service.js | 前端服務（I/O、轉換、業務流程） | src/ui/stores/addon-template.store.js:3 [import]<br>src/ui/stores/addon-template.store.js:3 [template-ref]<br>src/ui/views/settings/SettingsAddonTemplatePage.vue:35 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/ai-loan-intent.service.js | 前端服務（I/O、轉換、業務流程） | src/ui/components/home/QuickAddSheet.vue:391 [import]<br>src/ui/components/home/QuickAddSheet.vue:398 [template-ref]<br>src/ui/views/AiAutoBookkeepingPage.vue:253 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/app-update.service.js | 前端服務（I/O、轉換、業務流程） | src/ui/App.vue:66 [import]<br>src/ui/App.vue:66 [template-ref]<br>src/ui/views/settings/SettingsVersionInfoPage.vue:43 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/bank-sync.service.js | 前端服務（I/O、轉換、業務流程） | src/ui/views/settings/SettingsBankSyncPage.vue:183 [import]<br>src/ui/views/settings/SettingsBankSyncPage.vue:194 [template-ref] | 重構：銀行同步功能需「接 route 啟用」或整包下架 | Medium | 銀行同步整體模組（UI/API/DB）需一起驗收 |
| src/ui/services/exchange-rate.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:130 [import]<br>src/main.js:130 [template-ref]<br>src/ui/components/home/QuickAddSheet.vue:385 [import]<br>+5 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/services/google-backup.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:128 [import]<br>src/main.js:128 [template-ref]<br>src/ui/views/settings/SettingsAutoBackupPage.vue:218 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/i18n.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:133 [import]<br>src/main.js:133 [template-ref]<br>src/ui/App.vue:62 [import]<br>+83 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/services/navigation-back.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:134 [import]<br>src/main.js:134 [template-ref]<br>src/ui/App.vue:69 [import]<br>+9 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/runtime-en-exact.generated.js | 前端服務（I/O、轉換、業務流程） | src/ui/services/i18n.service.js:2 [import]<br>src/ui/services/i18n.service.js:2 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/runtime-en-phrases.generated.js | 前端服務（I/O、轉換、業務流程） | src/ui/services/i18n.service.js:3 [import]<br>src/ui/services/i18n.service.js:3 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/runtime-ja-messages.generated.js | 前端服務（I/O、轉換、業務流程） | scripts/audit-i18n.mjs:4 [import]<br>scripts/audit-i18n.mjs:4 [template-ref]<br>src/ui/services/i18n.service.js:4 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/theme.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:132 [import]<br>src/main.js:132 [template-ref]<br>src/ui/views/settings/SettingsPersonalizationPage.vue:66 [import]<br>+1 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/services/webdav-backup.service.js | 前端服務（I/O、轉換、業務流程） | src/main.js:129 [import]<br>src/main.js:129 [template-ref]<br>src/ui/views/settings/SettingsAutoBackupPage.vue:226 [import]<br>+1 more | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/stores/account.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:3 [import]<br>src/core/services/bootstrap.service.js:3 [template-ref]<br>src/ui/App.vue:64 [import]<br>+45 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/addon-template.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:9 [import]<br>src/core/services/bootstrap.service.js:9 [template-ref]<br>src/ui/components/home/HomeTransactionEditSheet.vue:277 [import]<br>+7 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/budget.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:6 [import]<br>src/core/services/bootstrap.service.js:6 [template-ref]<br>src/ui/components/home/HomeBudgetSummaryCard.vue:37 [import]<br>+21 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/category.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:4 [import]<br>src/core/services/bootstrap.service.js:4 [template-ref]<br>src/ui/components/home/HomeTransactionEditSheet.vue:274 [import]<br>+33 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/ledger.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:2 [import]<br>src/core/services/bootstrap.service.js:2 [template-ref]<br>src/main.js:126 [import]<br>+63 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/loan.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:7 [import]<br>src/core/services/bootstrap.service.js:7 [template-ref]<br>src/ui/components/home/HomeTransactionFeed.vue:75 [import]<br>+27 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/reimbursement.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:8 [import]<br>src/core/services/bootstrap.service.js:8 [template-ref]<br>src/ui/stores/ledger.store.js:10 [import]<br>+7 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/transaction.store.js | Pinia 狀態管理 | src/core/services/bootstrap.service.js:5 [import]<br>src/core/services/bootstrap.service.js:5 [template-ref]<br>src/ui/components/home/HomeAssetSummaryCard.vue:41 [import]<br>+27 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/stores/ui.store.js | Pinia 狀態管理 | src/main.js:127 [import]<br>src/main.js:127 [template-ref]<br>src/ui/App.vue:65 [import]<br>+75 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/utils/addon-note.js | 前端工具函式 | src/ui/components/home/HomeTransactionEditSheet.vue:278 [import]<br>src/ui/components/home/HomeTransactionEditSheet.vue:278 [template-ref]<br>src/ui/components/home/HomeTransactionFeed.vue:76 [import]<br>+9 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/utils/fa-icon-options.js | 前端工具函式 | src/ui/views/IconPickerPage.vue:31 [import]<br>src/ui/views/IconPickerPage.vue:31 [template-ref]<br>src/ui/views/accounts/AccountDetailPage.vue:163 [import]<br>+7 more | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/AiAutoBookkeepingPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:63 [dynamic-import]<br>src/ui/router/index.js:63 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/AnalysisCategoryDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:33 [dynamic-import]<br>src/ui/router/index.js:33 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/AnalysisPrintPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:27 [dynamic-import]<br>src/ui/router/index.js:27 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/CalendarPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:45 [dynamic-import]<br>src/ui/router/index.js:45 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/FeatureListPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:57 [dynamic-import]<br>src/ui/router/index.js:57 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/IconPickerPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:75 [dynamic-import]<br>src/ui/router/index.js:75 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/TransactionAboutPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:51 [dynamic-import]<br>src/ui/router/index.js:51 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/TransactionSearchPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:39 [dynamic-import]<br>src/ui/router/index.js:39 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/WelcomePage.vue | Vue 頁面（route 目標或候選頁） | src/ui/App.vue:61 [import]<br>src/ui/App.vue:61 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/accounts/AccountDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:208 [dynamic-import]<br>src/ui/router/index.js:208 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/accounts/AssetAccountGroupDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:220 [dynamic-import]<br>src/ui/router/index.js:220 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/accounts/AssetAccountManagementPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:214 [dynamic-import]<br>src/ui/router/index.js:214 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/analysis.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:21 [dynamic-import]<br>src/ui/router/index.js:21 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/assets.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:69 [dynamic-import]<br>src/ui/router/index.js:69 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/budgeting.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:15 [dynamic-import]<br>src/ui/router/index.js:15 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/home.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:9 [dynamic-import]<br>src/ui/router/index.js:9 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/loans/LoanCounterpartyDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:182 [dynamic-import]<br>src/ui/router/index.js:182 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/loans/LoanDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:188 [dynamic-import]<br>src/ui/router/index.js:188 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/loans/LoanListPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:176 [dynamic-import]<br>src/ui/router/index.js:176 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/reimbursements/ReimbursementEditPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:201 [dynamic-import]<br>src/ui/router/index.js:201 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/reimbursements/ReimbursementListPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:195 [dynamic-import]<br>src/ui/router/index.js:195 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/settings.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:80 [dynamic-import]<br>src/ui/router/index.js:80 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsAboutPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:170 [dynamic-import]<br>src/ui/router/index.js:170 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsAddonTemplatePage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:146 [dynamic-import]<br>src/ui/router/index.js:146 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsAutoBackupPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:92 [dynamic-import]<br>src/ui/router/index.js:92 [template-ref] | 重構：拆分檔案、抽共用、延遲載入或切模組 | Medium | 影響該模組維護性與載入性能，需回歸測試 |
| src/ui/views/settings/SettingsBankSyncPage.vue | Vue 頁面（route 目標或候選頁） | 未發現靜態引用 | 刪除：移除未使用或非產品輸出檔 | Low | 僅影響未接線頁；目前無 route 不影響既有功能 |
| src/ui/views/settings/SettingsCategoryDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:122 [dynamic-import]<br>src/ui/router/index.js:122 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsCategoryGroupDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:128 [dynamic-import]<br>src/ui/router/index.js:128 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsCategoryPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:116 [dynamic-import]<br>src/ui/router/index.js:116 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsDataManagementPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:86 [dynamic-import]<br>src/ui/router/index.js:86 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsDeveloperDebugPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:158 [dynamic-import]<br>src/ui/router/index.js:158 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsExchangeRatePage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:98 [dynamic-import]<br>src/ui/router/index.js:98 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsLanguagePage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:140 [dynamic-import]<br>src/ui/router/index.js:140 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsLedgerDetailPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:110 [dynamic-import]<br>src/ui/router/index.js:110 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsLedgerPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:104 [dynamic-import]<br>src/ui/router/index.js:104 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsMembershipBenefitsPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:164 [dynamic-import]<br>src/ui/router/index.js:164 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsPersonalizationPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:134 [dynamic-import]<br>src/ui/router/index.js:134 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| src/ui/views/settings/SettingsVersionInfoPage.vue | Vue 頁面（route 目標或候選頁） | src/ui/router/index.js:152 [dynamic-import]<br>src/ui/router/index.js:152 [template-ref] | 保留：維持現狀 | Low | 無行為變更 |
| vercel.json | Vercel rewrite/部署設定 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |
| vite.config.js | Vite 建置設定 | ENTRY/基礎設定檔（非被 import 使用） | 保留：維持現狀 | Low | 無行為變更 |

## 可直接套用的最小變更（刪除清單）
### 選項 A：僅移除確定死頁（最低風險）
- `src/ui/views/settings/SettingsBankSyncPage.vue`

### 選項 B：倉庫瘦身（不影響執行）
- `.codex_snapshots/strawmoneybook_snapshot_20260208_053227.tar.gz`
- `.codex_snapshots/strawmoneybook_snapshot_20260208_053235.tar.gz`

### 選項 C：若決定下架銀行同步（中風險，需整包驗收）
- `src/ui/views/settings/SettingsBankSyncPage.vue`
- `src/ui/services/bank-sync.service.js`
- `src/services/bank-sync/backend.js`
- `src/core/repositories/bank-sync.repo.js`
- `api/bank/_mock-provider.js`
- `api/bank/_utils.js`
- `api/bank/disconnect.js`
- `api/bank/exchange.js`
- `api/bank/link_session.js`
- `api/bank/mark_imported.js`
- `api/bank/sync.js`

## 驗收 Checklist（build/test/route smoke）
- [ ] `npm ci`
- [ ] `npx vite build`
- [ ] `npm run debug`（若需 Android 打包）
- [ ] Route smoke：首頁 `/`、設定 `/settings`、版本資訊 `/settings/version-info`、交易搜尋 `/transactions/search`
- [ ] 若做選項 C，下列 API 需同步移除或回 410：`/api/bank/*`
- [ ] i18n smoke：切換 `zh-TW/en/ja`，確認核心頁面無遺失 key