#!/usr/bin/env python3
"""Capture competitor bookkeeping flow screenshots on emulator-5554."""
from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import uiautomator2 as u2

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "screenshots"
NOTES = ROOT / "flow-notes.json"
SERIAL = "emulator-5554"

APPS = [
    {
        "id": "daak",
        "package": "com.lovelyduck.daak",
        "label": "Daak",
    },
    {
        "id": "moneybook",
        "package": "tw.com.moneybook.moneybook",
        "label": "麻布記帳 Moneybook",
    },
    {
        "id": "strawmb",
        "package": "com.strawcoding.strawmoneybook",
        "label": "StrawMoneyBook",
    },
]


@dataclass
class FlowStep:
    name: str
    screenshot: str
    activity: str = ""
    notes: str = ""


@dataclass
class AppFlow:
    app_id: str
    label: str
    package: str
    steps: list[FlowStep] = field(default_factory=list)
    tap_count_estimate: int = 0
    limitations: str = ""


def safe_name(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", text)[:80]


def current_activity(d) -> str:
    info = d.app_current()
    return f"{info.get('package', '')}/{info.get('activity', '')}"


def shot(d, app_id: str, step: str) -> tuple[str, str]:
    SHOT.mkdir(parents=True, exist_ok=True)
    fname = f"{app_id}_{safe_name(step)}.png"
    path = SHOT / fname
    d.screenshot(str(path))
    return fname, current_activity(d)


def try_click_texts(d, texts: list[str]) -> bool:
    for t in texts:
        if d(text=t).exists(timeout=1.5):
            d(text=t).click()
            return True
        if d(textContains=t).exists(timeout=0.8):
            d(textContains=t).click()
            return True
    return False


def dismiss_common(d) -> int:
    taps = 0
    for _ in range(6):
        clicked = try_click_texts(
            d,
            [
                "略過",
                "跳过",
                "Skip",
                "下一步",
                "Next",
                "開始",
                "开始",
                "Start",
                "同意",
                "Agree",
                "允許",
                "Allow",
                "確定",
                "OK",
                "知道了",
                "關閉",
                "Close",
                "稍後",
                "Later",
                "不登入",
                "暂不",
                "取消",
            ],
        )
        if clicked:
            taps += 1
            time.sleep(1.2)
            continue
        # permission allow buttons
        if d(resourceId="com.android.permissioncontroller:id/permission_allow_button").exists(timeout=0.5):
            d(resourceId="com.android.permissioncontroller:id/permission_allow_button").click()
            taps += 1
            time.sleep(0.8)
            continue
        break
    return taps


def audit_app(d, spec: dict) -> AppFlow:
    app_id = spec["id"]
    pkg = spec["package"]
    flow = AppFlow(app_id=app_id, label=spec["label"], package=pkg)
    taps = 0

    d.app_stop(pkg)
    time.sleep(0.5)
    d.app_clear(pkg)
    time.sleep(0.5)
    d.app_start(pkg, wait=True)
    time.sleep(3)

    fname, act = shot(d, app_id, "01_cold_start")
    flow.steps.append(FlowStep("cold_start", fname, act))

    taps += dismiss_common(d)
    fname, act = shot(d, app_id, "02_after_onboarding")
    flow.steps.append(FlowStep("after_onboarding", fname, act, "auto-dismiss dialogs"))

    # Try FAB / add entry points
    add_clicked = False
    for sel in [
        {"description": "新增"},
        {"descriptionContains": "記帳"},
        {"descriptionContains": "Add"},
        {"text": "+"},
        {"textContains": "記一筆"},
        {"textContains": "記帳"},
        {"textContains": "新增"},
        {"textContains": "支出"},
    ]:
        if d(**sel).exists(timeout=1.0):
            d(**sel).click()
            add_clicked = True
            taps += 1
            break

    if not add_clicked:
        # bottom nav heuristic: tap lower center-right area
        w, h = d.window_size()
        d.click(int(w * 0.85), int(h * 0.92))
        taps += 1

    time.sleep(2)
    fname, act = shot(d, app_id, "03_add_entry")
    flow.steps.append(
        FlowStep(
            "add_entry",
            fname,
            act,
            "fab_or_nav" if add_clicked else "fallback_bottom_tap",
        )
    )

    # Moneybook: open accounts sync entry if visible
    if app_id == "moneybook":
        if try_click_texts(d, ["帳戶", "账户", "Account"]):
            taps += 1
            time.sleep(2)
            fname, act = shot(d, app_id, "04_accounts_tab")
            flow.steps.append(FlowStep("accounts_tab", fname, act))

    # Daak: budget / template hints
    if app_id == "daak":
        d.press("back")
        time.sleep(0.8)
        if try_click_texts(d, ["預算", "预算", "Budget"]):
            taps += 1
            time.sleep(1.5)
            fname, act = shot(d, app_id, "04_budget")
            flow.steps.append(FlowStep("budget", fname, act))

    # StrawMB: open bookkeeping modes
    if app_id == "strawmb":
        dismiss_common(d)
        if try_click_texts(d, ["快速新增", "手動", "記帳", "AI"]):
            taps += 1
            time.sleep(1.5)
            fname, act = shot(d, app_id, "04_bookkeeping")
            flow.steps.append(FlowStep("bookkeeping_modes", fname, act))

    flow.tap_count_estimate = taps
    return flow


def main() -> None:
    d = u2.connect(SERIAL)
    d.implicitly_wait(5.0)
    results: list[dict] = []
    for spec in APPS:
        try:
            flow = audit_app(d, spec)
        except Exception as exc:  # noqa: BLE001
            flow = AppFlow(
                app_id=spec["id"],
                label=spec["label"],
                package=spec["package"],
                limitations=str(exc),
            )
        results.append(asdict(flow))

    meta = {
        "device": SERIAL,
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "apps": results,
        "finch_note": "com.xinran.finch APK unavailable via apkeep (apk-pure/huawei); see Finch web audit in report.",
    }
    NOTES.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {NOTES} and screenshots under {SHOT}")


if __name__ == "__main__":
    main()
