# Release-Process

完整閘門與禁令見 **[Closeout-And-Versioning](Closeout-And-Versioning)**。本頁是可照跑的操作摘要。

## 發佈前置

- [`docs/release-checklist.md`](../release-checklist.md)
- [`release-notes.pending.md`](../../release-notes.pending.md)（有使用者可見改動就加 `- ` 條目）
- 測試：[Testing-And-Verification](Testing-And-Verification)、[Playwright-App-Shell](Playwright-App-Shell)

## 操作步驟

```bash
cd /mnt/data/code/project/StrawCoding/StrawMoneyBook
git fetch origin main --tags
git status   # 工作區應乾淨（可忽略 .hermes.md）

cd frontend
npm run closeout:verify
# UI 改動另跑：npm run playwright:ui-layout （或對應 suite）

npm run gpr            # patch；唯一合法 bump/tag
# npm run gpr:minor    # minor（會 notes:clear）

npm run release:sync-check
git fetch origin main --tags   # origin/main 與 tag 應對齊
```

**禁止：** 手動改 `frontend/package.json` 的 `version`、`npm version`、在 gpr 外建 tag。寫碼 worker 禁止跑本頁的 `gpr`。

Play 上傳見 [Android-Release-And-Play-Upload](Android-Release-And-Play-Upload)。側載驗銀行見 [Android-Native-Bank-APK](Android-Native-Bank-APK)。

目前測試軌道預設 **internal**（`frontend/android/play-testing-channel.json`）。AAB 成功 ≠ 一般使用者看得到更新。

## 引用

- [`frontend/scripts/release-sync-check.mjs`](../../frontend/scripts/release-sync-check.mjs)
- [`frontend/package.json`](../../frontend/package.json)
