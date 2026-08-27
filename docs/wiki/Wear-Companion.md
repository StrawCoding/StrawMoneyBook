# Wear Companion

## 目的

手錶與手機共用同一顆 SQLCipher 帳本。入口：功能頁「進階功能」→ 手錶連線（`/settings/wear-companion`）。

## 技術要點

- 獨立 `:wear` Compose 模組；Wear Compose **必須 ≥ 1.5.6（現 1.6.2）**，否則 Xiaomi Watch 2 + targetSdk≥35 讀 `reduce_motion` 會閃退
- 可報銷：原生 UPDATE／DELETE 須 `reconcileDraftClaimSheetImportItems`，禁止只清 `is_reimbursable` 卻留 draft 請款項
- 驗證用 Robolectric `WearTransactionEngineReimbursableUpdateTest`（實跑 `applyTxUpdateOnDb`），不能只靠 source 字串測試

## CI

```text
./gradlew :app:testDebugUnitTest :wear:testDebugUnitTest
```

`androidTest`／Compose 畫面不在 CI。儀表板 UI 改動需真機或明確標「僅真機」。

## 發版軌道

[`frontend/android/play-testing-channel.json`](../../frontend/android/play-testing-channel.json)：目前 `"channel": "internal"`（phone `internal` + wear `wear:internal`）。Closed 對應 `alpha` + `wear:WearOS`。未拍板前不要改預設 channel。

## 引用

- [Android-Release-And-Play-Upload](Android-Release-And-Play-Upload)
- [CI-CD-And-Gates](CI-CD-And-Gates)
