#!/usr/bin/env python3
"""Single-file dark HTML: UI/UX / theme / layout competitive report."""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "screenshots"
OUT = ROOT / "strawmb-competitive-ui-ux-audit.html"
TZ = timezone(timedelta(hours=8))

# Screenshots grouped for UX narrative
GALLERIES = {
    "Daak — 可愛／手繪定位": [
        "daak_01_play_store.png",
        "daak_web_features.png",
        "daak_01_cold_start.png",
        "daak_03_add_entry.png",
    ],
    "Finch — 現代 fintech／AI 敘事": [
        "finch_01_play_store.png",
    ],
    "麻布記帳 — 信任／整合型": [
        "moneybook_web_landing.png",
        "moneybook_01_cold_start.png",
        "moneybook_02_after_onboarding.png",
    ],
    "StrawMoneyBook — 雙 layout + 官網": [
        "strawmb_web_home_mobile.png",
        "strawmb_web_home_desktop.png",
        "strawmb_01_cold_start.png",
        "strawmb_02_after_onboarding.png",
        "strawmb_03_add_entry.png",
    ],
}


def b64(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def gallery_html() -> str:
    chunks = []
    for title, files in GALLERIES.items():
        chunks.append(f'<h3>{title}</h3><div class="grid">')
        for name in files:
            p = SHOT / name
            if not p.exists():
                continue
            chunks.append(
                f'<figure><img src="{b64(p)}" alt="{name}"/>'
                f'<figcaption>{name}</figcaption></figure>'
            )
        chunks.append("</div>")
    return "\n".join(chunks)


def main() -> None:
    ux = json.loads((ROOT / "ui-ux-matrix.json").read_text(encoding="utf-8"))
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M %Z")

    dim_rows = ""
    for d in ux.get("dimensions", []):
        dim_rows += f"""<tr>
          <td><strong>{d.get('label','')}</strong></td>
          <td>{d.get('daak','')}</td>
          <td>{d.get('finch','')}</td>
          <td>{d.get('moneybook','')}</td>
          <td>{d.get('strawmb','')}</td>
        </tr>"""

    rec_cards = ""
    for r in ux.get("ux_recommendations", []):
        rec_cards += f"""<div class="card rec">
          <span class="tag">{r.get('priority','')}</span>
          <strong>{r.get('id','')} {r.get('title','')}</strong>
          <p>{r.get('body','')}</p>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>UI/UX 競品對比 — 主題・排版・美感（StrawMoneyBook）</title>
<style>
:root {{
  --bg:#0c1017; --surface:#151c28; --elev:#1e2838; --text:#e8eef6; --muted:#93a3b8;
  --accent:#6eb5f7; --accent2:#8fd4a8; --line:#2a364a; --warn:#e8c078;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:system-ui,"PingFang TC","Segoe UI",sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }}
.wrap {{ max-width:1080px; margin:0 auto; padding:32px 20px 72px; }}
h1 {{ font-size:1.75rem; font-weight:650; letter-spacing:-0.02em; margin:0 0 10px; }}
.sub {{ color:var(--muted); margin:0 0 28px; font-size:0.95rem; }}
h2 {{ font-size:1.22rem; margin:40px 0 14px; padding-bottom:8px; border-bottom:1px solid var(--line); }}
h3 {{ font-size:1rem; color:var(--accent); margin:24px 0 10px; }}
p {{ margin:8px 0; }}
.card {{ background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin:14px 0; }}
.card.rec p {{ margin:10px 0 0; color:var(--muted); font-size:0.92rem; }}
.tag {{ display:inline-block; font-size:0.72rem; font-weight:600; padding:3px 10px; border-radius:999px; background:var(--elev); color:var(--accent2); margin-right:8px; }}
table {{ width:100%; border-collapse:collapse; font-size:0.86rem; }}
th, td {{ border:1px solid var(--line); padding:10px 12px; vertical-align:top; }}
th {{ background:var(--elev); text-align:left; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; margin:12px 0 24px; }}
figure {{ margin:0; background:var(--surface); border:1px solid var(--line); border-radius:10px; overflow:hidden; }}
figure img {{ width:100%; display:block; }}
figcaption {{ font-size:0.72rem; color:var(--muted); padding:8px 10px; word-break:break-all; }}
.cols2 {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
@media (max-width:720px) {{ .cols2 {{ grid-template-columns:1fr; }} }}
.palette {{ display:flex; gap:10px; flex-wrap:wrap; margin:12px 0; }}
.swatch {{ width:72px; height:48px; border-radius:8px; border:1px solid var(--line); display:flex; align-items:flex-end; justify-content:center; font-size:0.65rem; padding:4px; color:#fff; text-shadow:0 1px 2px #000; }}
.mermaid {{ background:var(--surface); padding:14px; border-radius:10px; overflow-x:auto; font-size:0.85rem; }}
ul {{ padding-left:1.2rem; }}
li {{ margin:6px 0; }}
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({{ startOnLoad:true, theme:'dark' }});</script>
</head>
<body>
<div class="wrap">
<h1>UI / UX 競品對比報告</h1>
<p class="sub">主題美感・排版密度・導覽與表單 · 對照 Daak / Finch / 麻布記帳 / 稻草記帳 · {now}<br/>
本報告與「記帳流程／功能」報告分開；證據以 Emulator／Play／官網截圖為主。</p>

<h2>1. 視覺語言總覽</h2>
<div class="cols2">
<div class="card">
<p><strong>Daak</strong> — 可愛、手繪、低密度；用 icon 與節日主題建立情感，適合新手與「願意打開 App 看」的動機。</p>
<p><strong>Finch</strong> — 2025 後全面 redesign；強調 AI 與多主題背景，商店敘事偏「聰明、優雅」；需避免只剩對話框而犧牲單手效率。</p>
</div>
<div class="card">
<p><strong>麻布記帳</strong> — 金融信任（ISO 徽章、大 hero）；App 內資訊密度高、色彩克制，「自動化」本身即 UX。</p>
<p><strong>StrawMoneyBook</strong> — 工程化設計系統：modern Habitat（色島、圓角分區）vs traditional Apple HIG；四套 theme scheme 與 layout 解耦；官網與 App 逐步 token 對齊。</p>
</div>
</div>

<h2>2. StrawMB 設計系統（現況）</h2>
<div class="card">
<p><strong>Layout</strong>：<code>modern</code>（預設）= habitat-ui.css；<code>traditional</code> = apple-ui.css inset grouped。切換寫入 localStorage，Playwright ui-layout 驗證 FAB／BottomNav 不消失。</p>
<p><strong>Theme</strong>：morning-dew / sunny-harvest（淺）、charcoal / midnight-forest（深）等；首頁收支卡跟隨 <code>--home-*</code> token，淺色模式禁止硬編碼深底。</p>
<p><strong>元件</strong>：輸入統一 bottom sheet + safe-area；設定列 SMB-254 緊湊但仍 ≥44px 觸控；Font Awesome 單一 <code>main.js</code> 註冊源。</p>
<div class="palette">
  <div class="swatch" style="background:#1a2332">charcoal</div>
  <div class="swatch" style="background:#0d3d2e">midnight-forest</div>
  <div class="swatch" style="background:#e8f5f0;color:#1a3d32">morning-dew</div>
  <div class="swatch" style="background:#faf3e0;color:#5c4a1a">sunny-harvest</div>
</div>
</div>

<h2>3. 維度對照表</h2>
<table>
<tr><th>維度</th><th>Daak</th><th>Finch</th><th>麻布記帳</th><th>StrawMB</th></tr>
{dim_rows}
</table>

<h2>4. 排版與資訊架構</h2>
<div class="mermaid">
flowchart TB
  subgraph daak_ui [Daak]
    DTab[BottomTabs] --> DList[CalendarAndList]
    DList --> DCute[HandDrawnIcons]
  end
  subgraph finch_ui [Finch]
    FHome[Dashboard] --> FPanel[NewEntryPanel]
    FHome --> FAI[AIChatOptional]
  end
  subgraph mb_ui [Moneybook]
    MAuth[LoginGate] --> MAssets[AllAccountsOneScreen]
    MAssets --> MAuto[AutoImportFeed]
  end
  subgraph smb_ui [StrawMB]
    STabs[FiveTabsPlusFAB] --> SHome[PeriodAssetBudgetTx]
    SFAB --> SFull[FullscreenBookkeeping]
    SSet[Personalization] --> SLayout[ModernOrTraditional]
    SSet --> STheme[FourSchemes]
  end
</div>
<ul>
<li><strong>首屏負載</strong>：SMB 首頁同屏「期間＋資產＋預算＋交易流」資訊量高於 Daak；優勢是一次掌握現金流，風險是新用戶需靠 onboarding／空狀態消化。</li>
<li><strong>記帳全螢幕</strong>：SMB 記帳 hideAppChrome 是正確的專注模式；需在 UX 上強化「返回後仍停在原 tab」與模式切換不遮標題（已部分處理 mode-toggle-row）。</li>
<li><strong>進階功能下沉</strong>：同步類在「進階功能」降低設定首屏噪音 — 與 Moneybook「首屏就綁銀行」路線不同，需在 PostSetupIntro 持續強調恢復／同步捷徑。</li>
</ul>

<h2>5. 主題與美感 — 截圖對照</h2>
<p class="sub">Emulator 截圖可能含初始化／登入中間態；官網與 Play 頁代表品牌意圖。</p>
{gallery_html()}

<h2>6. UX 改善建議（不含功能 backlog）</h2>
{rec_cards}

<h2>7. 與功能報告的邊界</h2>
<div class="card">
<ul>
<li>功能報告：記帳步驟數、同步、週期帳、P0–P2 工程項。</li>
<li>本報告：<strong>看起來／排起来／点起来</strong> — 主題、密度、空狀態、審核列表可掃性、layout 預覽、官網一致性。</li>
<li>實作 UX 項時仍須 Playwright ui-layout + 主題 light/dark 抽樣（SMB 既有 gate）。</li>
</ul>
</div>

<h2>8. 未實測／限制</h2>
<p class="sub">Finch App UI 無 APK；Daak/Moneybook/StrawMB emulator 未走完正式帳本內頁美化狀態。Moneybook 登入後主界面需測試帳。StrawMB 完整 Habitat 首頁建議以 <code>playwright:ui-layout</code> 補圖（後續可自動化追加至 screenshots/）。</p>
</div>
</body>
</html>"""

    OUT.write_text(html, encoding="utf-8")
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
