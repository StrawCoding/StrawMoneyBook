# Contributing to StrawMoneyBook

感謝你對本專案的興趣！歡迎任何形式的貢獻，包含 Bug 回報、功能建議與 Pull Request。

## 開始之前

1. 請先閱讀 [README.md](./README.md) 了解專案架構。
2. 確認你的環境符合需求：
   - Node.js `^20.19.0 || >=22.12.0`
   - npm
3. Fork 本 repository 並 clone 到本機。

## 環境設定

```bash
npm install
npm install --prefix frontend
npm install --prefix backend

# 複製環境設定範本
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
# 依需求填入對應的設定值

# 啟動前端開發伺服器（預設連 https://api.strawmb.com）
npm run dev:frontend

# 可選：本機後端。若要改打 8787，在 frontend/.env.development.local 覆寫 API URL
npm run dev:backend
```

## 開發流程

1. 從 `main` 分支建立你的功能分支：`git checkout -b feature/your-feature`
2. 進行修改並確保通過所有檢查：
   ```bash
   npm run check
   npm run test
   ```
3. 提交 commit，遵循下列規範。
4. 發 Pull Request 到 `main` 分支。

## Commit 規範

請使用語意化 commit 訊息：

```
feat: 新增功能描述
fix: 修正問題描述
docs: 文件更新
chore: 維護性調整
refactor: 重構（不影響行為）
test: 測試相關
```

## 注意事項

- **不要**提交 `.env`、`key.properties`、`*.jks` 或任何含有密鑰的檔案。
- **不要**提交 `node_modules/`、`dist/`、`test-results/` 等產出目錄。
- Android 原生開發需要額外的 Android Studio 環境，詳見 `frontend/android/`。
- 若改動到 i18n 翻譯，請確保所有語系（`runtime-en-*`、`runtime-ja-*`）同步更新。

## 回報 Bug

請使用 [GitHub Issues](../../issues) 回報 Bug，並提供：

- 問題描述與重現步驟
- 預期行為 vs 實際行為
- 環境資訊（OS、Node.js 版本、裝置）

## 安全性問題

若發現安全漏洞，**請勿**在公開 Issue 中揭露，詳見 [SECURITY.md](./SECURITY.md)。
