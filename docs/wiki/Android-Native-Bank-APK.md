# Android 原生銀行 APK

## 目的

第一銀行／華南同步跑在 **Android WebView 原生碼**（`FirstBankAutomation.java`、`HuaNanBankAutomation.java`）。  
**只有重建 APK 才會到手機。** `deploy:copy`、version bump、web 測試、Playwright **都不會** ship 原生修復。

## 生產路徑

- 僅 Android native。Web 遠端 scrape 已退役。
- 雙 flag：`VITE_BANK_SYNC_FEATURE_ENABLED` **且** `VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS`（見 [Environment-Variables](Environment-Variables)）。
- 入口：功能頁「進階功能」，不是設定主清單。

## 重建

```bash
cd /mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend
ANDROID_HOME=/opt/android-sdk npm run build
# APK: frontend/android/app/build/outputs/apk/release/app-release.apk
# versionName: output-metadata.json
```

Play AAB／上架走 [Android-Release-And-Play-Upload](Android-Release-And-Play-Upload)，和「側載 APK 驗原生銀行」是兩條路。

## Phase 0C 真機閘（第一銀行）

程式已有 watermark + 強制 lookback。真機必須證明：

1. 安裝**剛重建**的 APK（versionName 對得上本次 commit）。
2. 第一次同步拉初始窗。
3. 第二次同步查詢窗 = `coveredThrough - lookbackDays`（預設 3 日），**不是**整段重拉。

未做這步，不得宣稱「增量同步已在使用者裝置上可用」。步驟與剩餘階段：[Sync-Architecture-B](Sync-Architecture-B)。

## 引用

- [`frontend/android/app/src/main/java/.../FirstBankAutomation.java`](../../frontend/android)
- [Sync-Operations-Runbooks](Sync-Operations-Runbooks)
