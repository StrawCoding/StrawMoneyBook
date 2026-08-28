package com.strawcoding.strawmoneybook.core;

import android.app.Activity;
import android.webkit.WebView;

import com.strawcoding.strawmoneybook.BankAutomationDebugTrace;
import com.strawcoding.strawmoneybook.BankAutomationVault;

import org.json.JSONObject;

/**
 * Provider-agnostic WebView automation runtime: phase state machine + shared session handles.
 * Providers advance phases explicitly; callers may observe {@link #getPhase()} for diagnostics.
 */
public final class BankAutomationRuntime {
    public enum Phase {
        IDLE,
        LOADING_LOGIN,
        CAPTCHA,
        AUTHENTICATING,
        DISCOVERING_ACCOUNTS,
        SYNCING_TRANSACTIONS,
        PARTIAL_SUCCESS,
        SUCCESS,
        USER_INTERACTION_REQUIRED,
        FAILED,
        ABORTED
    }

    private final Activity activity;
    private final WebView webView;
    private final BankAutomationVault vault;
    private final BankAutomationDebugTrace debugTrace;
    private final String providerId;
    private volatile Phase phase = Phase.IDLE;
    private volatile String lastErrorCode = "";
    private volatile String lastErrorMessage = "";

    public BankAutomationRuntime(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
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

    public BankAutomationVault getVault() {
        return vault;
    }

    public BankAutomationDebugTrace getDebugTrace() {
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

    public synchronized void markUserInteractionRequired(String code, String message) {
        lastErrorCode = code == null ? "captcha_required" : code;
        lastErrorMessage = message == null ? "" : message;
        enter(Phase.USER_INTERACTION_REQUIRED);
    }

    public synchronized void markFailed(String code, String message) {
        lastErrorCode = code == null ? "bank_automation_error" : code;
        lastErrorMessage = message == null ? "" : message;
        enter(Phase.FAILED);
    }

    public synchronized void markAborted() {
        enter(Phase.ABORTED);
    }

    public synchronized void markSuccess(boolean partial) {
        enter(partial ? Phase.PARTIAL_SUCCESS : Phase.SUCCESS);
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
