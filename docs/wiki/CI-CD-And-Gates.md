# CI-CD-And-Gates

權威：[`./.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

## Jobs

### backend

```bash
cd backend && npm ci && npm run check
```

### frontend

```bash
cd frontend && npm ci && npm run check
test -f ../release-notes.pending.md
npm run release:sync-check          # 僅 main：version == 最新 v* tag
```

接著：安裝 Android SDK、`prepare:android:release`、

```bash
./gradlew :app:testDebugUnitTest :wear:testDebugUnitTest
```

main push 另 dry-run `bundleRelease`。

### Playwright（獨立 job）

| Job | script |
|---|---|
| playwright-ui-layout | `playwright:ui-layout` |
| playwright-budget-save | `playwright:budget-save` |
| playwright-analysis-export | `playwright:analysis-export` |
| playwright-carrier-sync | `playwright:carrier-sync` |
| playwright-budget-cross-month | `playwright:budget-cross-month` |
| playwright-budget-pay-cycle | `playwright:budget-pay-cycle` |
| playwright-bank-sync | `playwright:bank-sync` |

環境：`CI=true`、`PLAYWRIGHT_BROWSERS_PATH` 指向 `backend/.server-data/playwright-browsers`（CI 用 `github.workspace` 前綴）。

### 其他 workflow

- `play-release.yml`：非 `.0` tag（測試軌道，預設 internal）
- `play-production-release.yml`：`*.0` tag
- `sync-contract-check.yml`：排程外部合約（會打真實站，只讀稽核不要隨便跑）

## 引用

- [Playwright-App-Shell](Playwright-App-Shell)
- [Closeout-And-Versioning](Closeout-And-Versioning)
- [Wear-Companion](Wear-Companion)
