# CLAUDE.md

## Required Skills

開始任何 coding 任務前，必須執行 `/careful-coding`。

## Base Rules

### 語言 & 溝通
- 使用**繁體中文**回答

### 開發原則
- 不要治標，要**治本**；不能只看表面，要**檢查關聯**
- 有改動就必須**測試**，測試通過才算完成

### Git
- 唯一分支：`main`

### 測試 & 檢查
- 改動網頁元件 → 用 **Playwright** 檢查
- 所有改動部分都需進行**檢查、測試、修復**

### 文字 & 國際化
- 增修文字時，檢查 **i18n** 是否完整

### Linear 工作流程
- 逐一解決 issue，完成後寫 comment 並移至 **In Review**
- 測試結果寫入 Linear comment
- Issue 必須標註**版本號**
- 完成時為 issue 新增**版本號 label**
- 狀態為 `Restart` → 檢查 comment 或子項目是否有 Tester 回報的 Bug
- 收到 **DoToDo** → 查詢狀態為 `Feature` 和 `Bug` 的項目，依 SOP 解決

## StrawMoneyBook

- 每次執行前檢查 `StrawMoneyBook_Features_Map.md` 與 `StrawMoneyBook_App_Features_Detailed.md`
- 每次更改後更新上述兩份文件及 `release-notes.pending.md`
