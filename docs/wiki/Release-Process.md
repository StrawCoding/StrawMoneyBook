# Release-Process

## 目的
描述專案的版本/發佈流程、以及如何避免「程式碼推上了但 Release/Tag 沒跟上」的治本閘門。

## 發佈前置（你要對照的文件）
- 發版門檻：[`docs/release-checklist.md`](../release-checklist.md)
- Pending release notes：[`release-notes.pending.md`](../../release-notes.pending.md)
- Release sync-check：[`frontend/scripts/release-sync-check.mjs`](../../frontend/scripts/release-sync-check.mjs)

## 典型 Release 流程（概念）
1. 確保變更都對應測試與 Playwright 驗收（見 `Testing-And-Verification`）
2. 更新 `release-notes.pending.md`（有變更就要有 pending 條目）
3. 跑 closeout/驗收閘門（對應 `package.json` scripts）
4. `gpr` 或等價腳本：完成版本 bump、tag、release 建立與發布流水

## 典型指令（以現有 scripts 為準）
```bash
# 版本驗收前置（檢查 pending release notes、release sync-check）
cd frontend
npm run closeout:pre

# 驗收（Node 測試 + web build + release gates）
npm run closeout:verify

# 發版（patch）
npm run gpr

# 發版（minor）
npm run gpr:minor
```

## 常見「為什麼 CI 會擋」的根因
- `frontend/package.json` version 與最新 `v*` tag 不一致（release sync-check）
- `release-notes.pending.md` 結構錯誤或 pending 內容不符 gate 條件

## 引用來源
- [`docs/release-checklist.md`](../release-checklist.md)
- [`release-notes.pending.md`](../../release-notes.pending.md)
- [`frontend/scripts/release-sync-check.mjs`](../../frontend/scripts/release-sync-check.mjs)
- [`frontend/package.json`](../../frontend/package.json)

