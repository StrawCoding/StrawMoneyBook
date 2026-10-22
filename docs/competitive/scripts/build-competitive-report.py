#!/usr/bin/env python3
"""Build single-file dark HTML competitive audit report (embedded screenshots)."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "screenshots"
OUT = ROOT / "strawmb-competitive-bookkeeping-audit.html"
TZ = timezone(timedelta(hours=8))


def b64_img(path: Path) -> str:
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


def load_json(name: str) -> dict:
    p = ROOT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def img_grid(files: list[Path], captions: dict[str, str]) -> str:
    parts = ['<div class="grid">']
    for f in files:
        if not f.exists():
            continue
        cap = captions.get(f.name, f.stem)
        parts.append(
            f'<figure><img src="{b64_img(f)}" alt="{cap}"/><figcaption>{cap}</figcaption></figure>'
        )
    parts.append("</div>")
    return "\n".join(parts)


def main() -> None:
    flow = load_json("flow-notes.json")
    gap = load_json("gap-matrix.json")
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M %Z")

    shots = sorted(SHOT.glob("*.png"))
    captions = {
        "daak_01_cold_start.png": "Daak — 冷啟動",
        "daak_02_after_onboarding.png": "Daak — 略過引導後",
        "daak_03_add_entry.png": "Daak — 記帳入口嘗試",
        "daak_web_features.png": "Daak 官網功能列表",
        "moneybook_01_cold_start.png": "麻布記帳 — 登入／註冊閘門",
        "moneybook_02_after_onboarding.png": "麻布記帳 — 登入畫面（未提供帳密）",
        "moneybook_03_add_entry.png": "麻布記帳 — 仍於 AuthenticationActivity",
        "moneybook_04_accounts_tab.png": "麻布記帳 — 帳戶同步入口未能進入主流程",
        "moneybook_web_landing.png": "麻布記帳官網 — 自動記帳定位",
        "strawmb_01_cold_start.png": "StrawMB — Welcome／初始化",
        "strawmb_02_after_onboarding.png": "StrawMB — 初始化後 WebView",
        "strawmb_03_add_entry.png": "StrawMB — 記帳入口（需完成 setup 才有 FAB）",
        "finch_01_play_store.png": "Finch — Google Play 功能描述（APK 未取得）",
    }

    apps = flow.get("apps") or []
    daak_taps = apps[0].get("tap_count_estimate", "—") if len(apps) > 0 else "—"
    mb_taps = apps[1].get("tap_count_estimate", "—") if len(apps) > 1 else "—"
    smb_taps = apps[2].get("tap_count_estimate", "—") if len(apps) > 2 else "—"
    gap_emulator = json.dumps(gap.get("emulator_audit", {}), ensure_ascii=False)
    device = flow.get("device", "—")
    grid_html = img_grid(shots, captions)

    matrix_rows = ""
    for row in gap.get("matrix", []):
        matrix_rows += f"""<tr>
          <td>{row.get('capability','')}</td>
          <td>{row.get('moneybook','')}</td>
          <td>{row.get('daak','')}</td>
          <td>{row.get('finch','')}</td>
          <td>{row.get('strawmb','')}</td>
          <td><code>{row.get('gap','')}</code></td>
          <td>{row.get('priority','')}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>競品記帳流程對比 — StrawMoneyBook</title>
<style>
:root {{
  --bg:#0f1419; --surface:#1a2332; --text:#e7ecf3; --muted:#9aa8bc;
  --accent:#5b9fd4; --ok:#6bbf8a; --warn:#e0b060; --line:#2a3548;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:system-ui,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }}
.wrap {{ max-width:1100px; margin:0 auto; padding:28px 20px 64px; }}
h1 {{ font-size:1.65rem; font-weight:650; margin:0 0 8px; }}
.meta {{ color:var(--muted); font-size:0.92rem; margin-bottom:28px; }}
h2 {{ font-size:1.2rem; margin:36px 0 12px; border-bottom:1px solid var(--line); padding-bottom:8px; }}
h3 {{ font-size:1.02rem; margin:22px 0 8px; color:var(--accent); }}
p, li {{ color:var(--text); }}
.card {{ background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin:14px 0; }}
table {{ width:100%; border-collapse:collapse; font-size:0.88rem; }}
th, td {{ border:1px solid var(--line); padding:8px 10px; vertical-align:top; }}
th {{ background:#121a26; text-align:left; }}
code {{ font-size:0.85em; color:#c5d4e8; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; margin:16px 0; }}
figure {{ margin:0; background:var(--surface); border:1px solid var(--line); border-radius:8px; overflow:hidden; }}
figure img {{ width:100%; display:block; }}
figcaption {{ font-size:0.78rem; color:var(--muted); padding:8px 10px; }}
.tag {{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.75rem; background:#243044; margin-right:6px; }}
.mermaid {{ background:var(--surface); padding:12px; border-radius:8px; overflow-x:auto; }}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{ startOnLoad:true, theme:'dark' }});</script>
</head>
<body>
<div class="wrap">
<h1>競品記帳流程對比與 StrawMB 優化建議</h1>
<p class="meta">產出時間：{now} · 裝置：{device} · 證據：Emulator 實測 + 官網／Play 截圖</p>

<h2>Executive Summary</h2>
<div class="card">
<h3>懶人自動（對標 Moneybook）</h3>
<ul>
<li><strong>值得做</strong>：pending 審核批次分類、auto-fill 規則一鍵建立、同步狀態首屏可見（P0-B4、P1-A3）</li>
<li><strong>不必抄</strong>：雲端集中網銀憑證；維持本地 vault + 使用者明示授權</li>
<li><strong>護城河</strong>：載具／銀行 Architecture B 模組化，逐 provider 擴充（P2-C4）</li>
</ul>
<h3>快速手動（對標 Daak）</h3>
<ul>
<li><strong>值得做</strong>：手機 Quick Add 範本／重複上一筆（Wear 已有邏輯可上移 P0-B1）</li>
<li><strong>不必抄</strong>：全站手繪 icon 風；保留 Habitat／traditional 雙 layout</li>
<li><strong>護城河</strong>：問答記帳三步驟降誤填</li>
</ul>
<h3>AI 現代（對標 Finch）</h3>
<ul>
<li><strong>值得做</strong>：Android 分享圖片 → AI 記帳（P1-A2）；預設記帳模式記憶（P0-B3）</li>
<li><strong>不必抄</strong>：強制單一對話框記帳（Play 負評已驗證）</li>
<li><strong>護城河</strong>：三模式 + 附加項目解析、四則金額共用 <code>amount-expression.js</code></li>
</ul>
<h3>稻草差異化</h3>
<ul>
<li>報銷→請款→借出消除、發薪週期＋共同池、recovery／downgrade guard、共同帳本</li>
<li>建議：onboarding 用「情境選路徑」（懶人同步 vs 手動 vs 報銷）而非功能堆疊</li>
</ul>
</div>

<h2>架構邊界建議</h2>
<div class="mermaid">
flowchart TB
  subgraph entry [BookkeepingEntry]
    FAB --> ModeRouter
    ModeRouter --> AI
    ModeRouter --> Quick
    ModeRouter --> Qna
  end
  subgraph auto [ImportAutomation]
    BankSync --> ReviewQueue
    Carrier --> ReviewQueue
    ReviewQueue --> AutoFillRules
  end
  subgraph recur [RecurrenceEngine]
    Subscriptions --> RecurrenceEngine
    FutureRules --> RecurrenceEngine
    RecurrenceEngine --> Ledger[({{SQLite}})]
  end
  subgraph share [ShareIntentBookkeeping]
    AndroidShare --> AI
  end
  AI --> Ledger
  Quick --> Ledger
  ReviewQueue --> Ledger
</div>
<ul>
<li><code>ImportReviewQueue</code>：統一銀行 pending／載具審核 UX，對齊 <code>bank-sync.service.js</code> 與 carrier orchestrator</li>
<li><code>RecurrenceEngine</code>：訂閱與通用週期共用冪等鍵（現有 subscription recurring 可抽 core）</li>
<li><code>ShareIntentBookkeeping</code>：<code>MainActivity</code> intent → <code>AiAutoBookkeepingPage</code></li>
</ul>

<h2>記帳入口實測（Emulator）</h2>
<p>腳本：<code>docs/competitive/scripts/capture_audit.py</code>。Finch APK 無法由 apkeep 取得，改 Play 商店頁補充。</p>
<table>
<tr><th>App</th><th>估計互動</th><th>觀察</th></tr>
<tr><td>Daak</td><td>{daak_taps}</td><td>冷啟動後需建立帳本；記帳入口在底部導覽（自動化腳本以 fallback 點擊）</td></tr>
<tr><td>Moneybook</td><td>{mb_taps}</td><td><strong>未登入</strong>停留在 AuthenticationActivity；完整自動同步未實測（無測試帳密／網銀）</td></tr>
<tr><td>StrawMB</td><td>{smb_taps}</td><td>clear data 後需 Welcome setup；未完成帳本時無典型 FAB 記帳流（與 Playwright bypass onboarding 不同）</td></tr>
</table>

<h2>功能差距矩陣</h2>
<table>
<tr><th>能力</th><th>Moneybook</th><th>Daak</th><th>Finch</th><th>StrawMB</th><th>差距</th><th>優先</th></tr>
{matrix_rows}
</table>

<h2>Backlog（P0 → P2）</h2>
<div class="card">
<p><span class="tag">P0-B1</span>記帳範本 + 重複上一筆 — QuickAddPage / bookkeeping-mode</p>
<p><span class="tag">P0-B2</span>標籤／地點 UI + 搜尋 — transaction.repo tags_json</p>
<p><span class="tag">P0-B3</span>預設記帳模式記憶 — BookkeepingPage + 設定</p>
<p><span class="tag">P0-B4</span>pending 滑動／批次分類 — bank-sync review + import-auto-rule</p>
<p><span class="tag">P1-A1</span>通用週期記帳 — RecurrenceEngine</p>
<p><span class="tag">P1-A2</span>分享／截圖 → AI — MainActivity intent</p>
<p><span class="tag">P1-A3</span>修正後建議 auto-fill 規則</p>
<p><span class="tag">P2-C1</span>分期計畫 — 與 smb301 信用卡協調</p>
<p><span class="tag">P2-C2</span>固定年度預算</p>
<p><span class="tag">P2-C3</span>週起始日設定</p>
<p><span class="tag">P2-C4</span>銀行 provider 路線圖</p>
</div>

<h2>Impact × Effort（建議實作順序）</h2>
<table>
<tr><th></th><th>低 Effort</th><th>高 Effort</th></tr>
<tr><td>高 Impact</td><td>B3 預設模式、B1 範本</td><td>B4 審核 UX、A1 週期引擎、C4 多銀行</td></tr>
<tr><td>低 Impact</td><td>B2 標籤 UI</td><td>C1 分期、A2 Share intent</td></tr>
</table>

<h2>截圖證據</h2>
{grid_html}

<h2>附錄：環境重現</h2>
<pre><code>bash docs/competitive/scripts/setup-avd.sh
docs/competitive/.venv/bin/python docs/competitive/scripts/capture_audit.py
</code></pre>
<p class="meta"><code>{gap_emulator}</code></p>
</div>
</body>
</html>"""

    OUT.write_text(html, encoding="utf-8")
    print(OUT)
    print(f"bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
