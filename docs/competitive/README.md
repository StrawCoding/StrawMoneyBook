# 競品記帳流程調查（StrawMoneyBook）

可重現環境與截圖證據，供產品／工程對照 Daak、Finch、麻布記帳。

## 快速開始

```bash
# 1) 啟動 AVD 並安裝 APK（需 apkeep 或預先放入 apks/）
bash docs/competitive/scripts/setup-avd.sh

# 2) Emulator 流程截圖（Daak / Moneybook / StrawMB）
docs/competitive/.venv/bin/python docs/competitive/scripts/capture_audit.py

# 3) 官網／Play 補充截圖
cd frontend && npx --yes playwright screenshot --viewport-size=390,844 \
  "https://play.google.com/store/apps/details?id=com.xinran.finch&hl=zh_TW" \
  ../docs/competitive/screenshots/finch_01_play_store.png
```

## 產出

| 路徑 | 說明 |
|------|------|
| `screenshots/` | PNG 證據（≥12） |
| `flow-notes.json` | Emulator 走查步驟與 activity |
| `gap-matrix.json` | 功能差距與 repo 對照 |
| `scripts/` | setup / capture 腳本 |

| 報告 | 腳本 | 內容 |
|------|------|------|
| 記帳流程／功能 | `scripts/build-competitive-report.py` | 流程、差距矩陣、P0–P2 backlog |
| **UI/UX／主題排版** | `scripts/build-ui-ux-report.py` | 視覺語言、layout/theme、美感建議 UX-1…7 |

兩份 HTML 皆經 `cursor-deliver` 發布（單檔內嵌截圖）。
