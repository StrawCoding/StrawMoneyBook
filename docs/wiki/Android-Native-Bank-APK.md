# Android 原生銀行 APK

## 目的

華南銀行同步跑在 **Android WebView 原生碼**（`providers/huanan/HuaNanBankAutomation.java` + `core/BankAutomationRuntime`）。  
**只有重建 APK 才會到手機。** `deploy:copy`、version bump、web 測試、Playwright **都不會** ship 原生修復。

第一銀行（`first_bank_tw` / `FirstBankAutomation`）已自產品面移除，不得還原。

## 生產路徑

- 僅 Android native。Web 遠端 scrape 已退役。
- 雙 flag：`VITE_BANK_SYNC_FEATURE_ENABLED` **且** `VITE_BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS`（見 [Environment-Variables](Environment-Variables)）。
- 入口：功能頁「進階功能」，不是設定主清單。
- Registry 初始僅 `hua_nan_bank_tw`。

## 重建

```bash
cd /mnt/data/code/project/StrawCoding/StrawMoneyBook/frontend
ANDROID_HOME=/opt/android-sdk npm run build
# APK: frontend/android/app/build/outputs/apk/release/app-release.apk
# versionName: output-metadata.json
```

Play AAB／上架走 [Android-Release-And-Play-Upload](Android-Release-And-Play-Upload)，和「側載 APK 驗原生銀行」是兩條路。

## 華南真機閘（H1/H2）

H0 登入頁合約已凍。H1 帳戶列表須用結構錨點（hidden account 欄／query param），禁止掃頁面任意 8–16 位數字。H2 交易查詢未凍前必須誠實 `partial`，不得假 ok watermark。

真機必須證明：

1. 安裝**剛重建**的 APK（versionName 對得上本次 commit）。
2. 登入＋captcha（OCR 或 SEMI_MANUAL）後看得到帳戶列表。
3. 同步狀態與錯誤碼誠實（`hua_nan_account_list_not_found` 等）。

細節：[Sync-Architecture-B](Sync-Architecture-B)。

## 引用

- [`frontend/android/.../providers/huanan/HuaNanBankAutomation.java`](../../frontend/android)
- [`frontend/android/.../core/BankAutomationRuntime.java`](../../frontend/android)
- [Sync-Operations-Runbooks](Sync-Operations-Runbooks)
