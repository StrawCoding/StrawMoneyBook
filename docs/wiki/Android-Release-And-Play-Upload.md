# Android-Release-And-Play-Upload

## 目的
提供 Android/ Wear 釋出與上架前置操作的 Runbook（含 AAB 準備、generated files、unit tests、GitHub Release 發佈/上傳）。

## 重要原則
- Android generated files 需先準備（copy/sync 取決於缺漏檔狀態）
- 版本與 tag 由既有腳本推導，避免人工改版本造成 Release/Play 不一致

## Android generated files 準備
- 使用：[`frontend/scripts/prepare-android-release.mjs`](../../frontend/scripts/prepare-android-release.mjs)
- 典型命令（由 npm scripts 驅動）：`npm run prepare:android:release`

`prepare-android-release` 會檢查是否缺少 Android generated files；若缺漏則會 fallback 到 `sync:android`，否則用 `copy:android`。

被檢查的必要檔案（`prepare-android-release.mjs` 內）：
 - `android/app/capacitor.build.gradle`
 - `android/capacitor.settings.gradle`
 - `android/capacitor-cordova-android-plugins/cordova.variables.gradle`

> 建議：本頁不要用手工改 generated files；都交給 `prepare-android-release` 決策。

## AAB build 與上傳（GitHub Release）
- AAB 產出：`npm run aab:build` / workflow 對應 `./gradlew :app:bundleRelease :wear:bundleRelease`
- 上傳到 GitHub Release：[`frontend/scripts/upload-aab-to-github.mjs`](../../frontend/scripts/upload-aab-to-github.mjs)

補充：
- AAB 上傳會對應 `frontend/package.json` 的 version（並配合 Android `versionCode` 由 gradle 自動推導）
- 上傳流程需要 GitHub CLI 環境正常（wiki/Release 自動發佈會用 workflow；本地也可參考腳本）

## Play 上架流程（概念）
- 由 GitHub Actions 的 production workflow 呼叫 Fastlane（此 Wiki 以連結既有 workflow/腳本為主）

## 引用來源
- [`./.github/workflows/play-release.yml`](../../.github/workflows/play-release.yml)
- [`./.github/workflows/play-production-release.yml`](../../.github/workflows/play-production-release.yml)
- [`frontend/package.json`](../../frontend/package.json)

