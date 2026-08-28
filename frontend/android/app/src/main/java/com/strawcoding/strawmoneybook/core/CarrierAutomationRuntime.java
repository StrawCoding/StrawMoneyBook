package com.strawcoding.strawmoneybook.core;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.CarrierAutomationDebugTrace;
import com.strawcoding.strawmoneybook.CarrierAutomationVault;

import org.json.JSONObject;

/**
 * Provider-agnostic carrier WebView runtime: phase state machine + shared session handles.
 * Phase shape (design): IDLE → OPEN_PORTAL → CLOUDFLARE_WAIT → CAPTCHA → LOGIN → QUERY → NORMALIZE → DONE
 * Failure / UI: ERROR, CAPTCHA_REQUIRED, ABORTED.
 */
public final class CarrierAutomationRuntime {
    public enum Phase {
        IDLE,
        OPEN_PORTAL,
        CLOUDFLARE_WAIT,
        CAPTCHA,
        LOGIN,
        QUERY,
        NORMALIZE,
        DONE,
        CAPTCHA_REQUIRED,
        ERROR,
        ABORTED
    }

    private final Activity activity;
    private final WebView webView;
    private final CarrierAutomationVault vault;
    private final CarrierAutomationDebugTrace debugTrace;
    private final String providerId;
    private volatile Phase phase = Phase.IDLE;
    private volatile String lastErrorCode = "";
    private volatile String lastErrorMessage = "";

    public CarrierAutomationRuntime(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        String providerId
    ) {
        this.activity = activity;
        this.webView = webView;
        this.vault = vault;
        this.debugTrace = debugTrace;
        this.providerId = providerId == null ? "" : providerId.trim();
    }

    public Activity getActivity() {
        return activity;
    }

    public WebView getWebView() {
        return webView;
    }

    public CarrierAutomationVault getVault() {
        return vault;
    }

    public CarrierAutomationDebugTrace getDebugTrace() {
        return debugTrace;
    }

    public String getProviderId() {
        return providerId;
    }

    public Phase getPhase() {
        return phase;
    }

    public String getLastErrorCode() {
        return lastErrorCode;
    }

    public String getLastErrorMessage() {
        return lastErrorMessage;
    }

    public synchronized void enter(Phase next) {
        if (next == null) return;
        this.phase = next;
        if (debugTrace != null) {
            JSONObject details = new JSONObject();
            try {
                details.put("phase", next.name());
                details.put("providerId", providerId);
            } catch (Exception ignored) {
                // best-effort probe only
            }
            debugTrace.record("runtime_phase", "ok", "phase=" + next.name(), details);
        }
    }

    public synchronized void markCaptchaRequired(String code, String message) {
        lastErrorCode = code == null ? "einvoice_captcha_required" : code;
        lastErrorMessage = message == null ? "" : message;
        enter(Phase.CAPTCHA_REQUIRED);
    }

    public synchronized void markFailed(String code, String message) {
        lastErrorCode = code == null ? "carrier_automation_error" : code;
        lastErrorMessage = message == null ? "" : message;
        enter(Phase.ERROR);
    }

    public synchronized void markAborted() {
        enter(Phase.ABORTED);
    }

    public synchronized void markDone() {
        enter(Phase.DONE);
    }

    public JSONObject snapshot() {
        JSONObject out = new JSONObject();
        try {
            out.put("providerId", providerId);
            out.put("phase", phase.name());
            out.put("lastErrorCode", lastErrorCode);
            out.put("lastErrorMessage", lastErrorMessage);
        } catch (Exception ignored) {
            // ignore
        }
        return out;
    }
}
