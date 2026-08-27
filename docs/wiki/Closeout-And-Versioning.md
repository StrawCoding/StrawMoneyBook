# Closeout 與版本

## 目的

避免「程式已上 main、但沒有 tag／Release／changelog」或「package.json 超前 tag 被 CI 擋」。

**現行流程是 no-Plane generic long-task。** 不要把 Plane comment／version-label／In Review 當新任務 SOP。

## 角色

| 階段 | 誰 | 可以做 | 禁止 |
|---|---|---|---|
| 實作 | Cursor worker／本機 Cursor | 改碼、測試、commit/push feat、更新 pending notes | 改 `frontend/package.json` version、`npm version`、`gpr`、tag |
| 發版 | Hermes closeout | `closeout:verify` → `gpr` → `release:sync-check` → fetch origin | 用 bump 腳本繞過 `gpr` |

本 repo **沒有** `scripts/bump-version.sh`。版本只走 frontend `gpr`（內部 `bump:patch`）。

## 唯一發版指令

```bash
cd /mnt/data/code/project/StrawCoding/StrawMoneyBook
git status
git fetch origin main --tags

cd frontend
npm run closeout:pre          # notes:check + release:sync-check
npm run closeout:verify       # test:node + build:web + closeout:pre
npm run gpr                   # patch：bump + commit + tag + archive notes
# 或 npm run gpr:minor
npm run release:sync-check
```

Hermes 一鍵（歷史腳本名仍含 Plane，**新任務不要對 Plane 寫狀態**）：

```bash
bash /root/.hermes/scripts/strawmb_closeout.sh --playwright ui-layout
```

`closeout:verify` **不含 Playwright**。UI 改動必須另外跑對應 suite（見 [Playwright-App-Shell](Playwright-App-Shell)）。

## pending notes

檔案：[`release-notes.pending.md`](../../release-notes.pending.md)

- 只在 header `# Pending Release Notes` 下加 `- ` 條目
- **禁止**手動加 `---`（`gpr` archive 才建歷史區）
- `notes:check` 允許空 pending；有產品行為／使用者可見改動時**必須**寫條目，否則 changelog 會漏

## CI 閘門

main 上 `frontend/package.json` 的 `version` 必須等於最新 `v*` tag。人工改版本卻沒跑 `gpr` → `release:sync-check` FAIL。

## 原生／後端連帶

- backend 有改 → [Backend-Deployment-And-Health](Backend-Deployment-And-Health)（`deploy:copy` **然後** `docker restart StrawMB`）
- FirstBank／華南 Java 有改 → [Android-Native-Bank-APK](Android-Native-Bank-APK)（重建 APK）

## 引用

- [`docs/release-checklist.md`](../release-checklist.md)
- [`frontend/package.json`](../../frontend/package.json) scripts：`gpr`、`closeout:verify`
- [Long-Task-Worker](Long-Task-Worker)
