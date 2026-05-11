# Pending Release Notes

---

## v1.1.9
- gpr 發布流程調整：release-notes.pending.md 沒有 pending 內容時只提示不中止，仍可建立版本 tag 並上傳；patch 發版不會封存空白版本區塊

## v1.1.8
- gpr 發布流程調整：patch 版本（c+1）不清除 release notes；minor 版本（b+1）正式發布時才清除（使用 npm run gpr:minor）
