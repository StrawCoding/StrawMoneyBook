package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BankAutomationActivity extends Activity {
    static final int DESKTOP_VIEWPORT_WIDTH = 1280;

    public static final String ACTION_CONNECT_FIRST_BANK = "connect_first_bank";
    public static final String ACTION_SYNC_FIRST_BANK = "sync_first_bank";
    public static final String ACTION_DISCONNECT_CONNECTION = "disconnect_connection";
    public static final String ACTION_CONNECT_BANK = "connect_bank";
    public static final String ACTION_SYNC_BANK = "sync_bank";
    public static final String ACTION_DISCONNECT_BANK = "disconnect_bank";

    public static final String EXTRA_ACTION = "bank_automation.action";
    public static final String EXTRA_PAYLOAD_JSON = "bank_automation.payload_json";
    public static final String EXTRA_RESULT_JSON = "bank_automation.result_json";
    public static final String EXTRA_ERROR_CODE = "bank_automation.error_code";
    public static final String EXTRA_ERROR_MESSAGE = "bank_automation.error_message";
    public static final String EXTRA_DEBUG_TRACE_JSON = "bank_automation.debug_trace_json";
    public static final String EXTRA_ERROR_DATA_JSON = "bank_automation.error_data_json";

    private static final long AUTOMATION_TIMEOUT_MS = 90_000L;
    private static final Object BUSY_LOCK = new Object();
    private static boolean busy = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executorService;
    private Runnable timeoutRunnable;
    private WebView webView;
    private boolean finished = false;
    private BankAutomationDebugTrace debugTrace;

    public static boolean isBusy() {
        synchronized (BUSY_LOCK) {
            return busy;
        }
    }

    private static boolean acquireBusy() {
        synchronized (BUSY_LOCK) {
            if (busy) return false;
            busy = true;
            return true;
        }
    }

    private static void releaseBusy() {
        synchronized (BUSY_LOCK) {
            busy = false;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!acquireBusy()) {
            finishWithError(new BankAutomationException("bank_automation_busy", "Bank automation is already running"));
            return;
        }

        executorService = Executors.newSingleThreadExecutor();
        webView = buildWebView();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        root.addView(webView, new FrameLayout.LayoutParams(
            DESKTOP_VIEWPORT_WIDTH,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        final String action = stringExtra(getIntent(), EXTRA_ACTION);
        final String payloadJson = stringExtra(getIntent(), EXTRA_PAYLOAD_JSON);
        debugTrace = new BankAutomationDebugTrace(action);
        debugTrace.record("activity_created", "ok", "Bank automation activity created");
        final JSONObject payload;
        try {
            payload = payloadJson.isEmpty() ? new JSONObject() : new JSONObject(payloadJson);
        } catch (Exception error) {
            finishWithError(new BankAutomationException("bank_automation_payload_invalid", String.valueOf(error.getMessage())));
            return;
        }

        timeoutRunnable = () -> finishWithError(new BankAutomationException("bank_automation_timeout", "Bank automation timed out"));
        mainHandler.postDelayed(timeoutRunnable, AUTOMATION_TIMEOUT_MS);

        executorService.execute(() -> runAction(action, payload));
    }

    private WebView buildWebView() {
        WebView nextWebView = new WebView(this);
        nextWebView.setBackgroundColor(Color.TRANSPARENT);
        nextWebView.setAlpha(0.01f);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(nextWebView, true);

        WebSettings settings = nextWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        nextWebView.setInitialScale(100);
        nextWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }
        });
        return nextWebView;
    }

    private void runAction(String action, JSONObject payload) {
        try {
            BankAutomationVault vault = new BankAutomationVault(getApplicationContext());
            JSONObject result;
            debugTrace.record("action_started", "ok", action);
            if (ACTION_CONNECT_BANK.equals(action) || ACTION_SYNC_BANK.equals(action) || ACTION_DISCONNECT_BANK.equals(action)) {
                result = dispatchByProvider(action, payload, vault);
            } else if (ACTION_CONNECT_FIRST_BANK.equals(action)) {
                result = FirstBankAutomation.connect(this, webView, vault, debugTrace, payload);
            } else if (ACTION_SYNC_FIRST_BANK.equals(action)) {
                result = FirstBankAutomation.sync(this, webView, vault, debugTrace, payload);
            } else if (ACTION_DISCONNECT_CONNECTION.equals(action)) {
                result = FirstBankAutomation.disconnect(this, webView, vault, debugTrace, payload);
            } else {
                throw new BankAutomationException("bank_automation_action_invalid", "Unsupported bank automation action");
            }
            finishWithSuccess(result);
        } catch (BankAutomationException error) {
            finishWithError(error);
        } catch (Exception error) {
            finishWithError(new BankAutomationException("bank_automation_failed", String.valueOf(error.getMessage())));
        }
    }

    private JSONObject dispatchByProvider(String action, JSONObject payload, BankAutomationVault vault) throws Exception {
        String providerId = normalizeProviderId(payload);
        if ("first_bank_tw".equals(providerId)) {
            if (ACTION_CONNECT_BANK.equals(action)) {
                return FirstBankAutomation.connect(this, webView, vault, debugTrace, payload);
            }
            if (ACTION_SYNC_BANK.equals(action)) {
                return FirstBankAutomation.sync(this, webView, vault, debugTrace, payload);
            }
            return FirstBankAutomation.disconnect(this, webView, vault, debugTrace, payload);
        }
        if ("hua_nan_bank_tw".equals(providerId)) {
            if (ACTION_CONNECT_BANK.equals(action)) {
                return HuaNanBankAutomation.connect(this, webView, vault, debugTrace, payload);
            }
            if (ACTION_SYNC_BANK.equals(action)) {
                return HuaNanBankAutomation.sync(this, webView, vault, debugTrace, payload);
            }
            return HuaNanBankAutomation.disconnect(this, webView, vault, debugTrace, payload);
        }
        throw new BankAutomationException("bank_provider_unsupported", "Unsupported bank provider: " + providerId);
    }

    private static String normalizeProviderId(JSONObject payload) {
        if (payload == null) return "";
        String fromProviderId = String.valueOf(payload.optString("providerId", "")).trim().toLowerCase();
        if (!fromProviderId.isEmpty()) return fromProviderId;
        return String.valueOf(payload.optString("provider", "")).trim().toLowerCase();
    }

    private String stringExtra(Intent intent, String key) {
        if (intent == null) return "";
        String value = intent.getStringExtra(key);
        return value == null ? "" : value.trim();
    }

    private void finishWithSuccess(JSONObject payload) {
        if (finished) return;
        finished = true;
        mainHandler.post(() -> {
            mainHandler.removeCallbacks(timeoutRunnable);
            Intent result = new Intent();
            JSONObject safePayload = payload == null ? new JSONObject() : payload;
            try {
                safePayload.put("debugTrace", debugTrace == null ? new JSONObject() : debugTrace.toJson("", ""));
            } catch (JSONException ignored) {
                // Skip debug trace attachment if serialization fails; success payload should still resolve.
            }
            result.putExtra(EXTRA_RESULT_JSON, safePayload.toString());
            setResult(Activity.RESULT_OK, result);
            finish();
        });
    }

    private void finishWithError(BankAutomationException error) {
        if (finished) return;
        finished = true;
        mainHandler.post(() -> {
            mainHandler.removeCallbacks(timeoutRunnable);
            Intent result = new Intent();
            result.putExtra(EXTRA_ERROR_CODE, error.getCode());
            result.putExtra(EXTRA_ERROR_MESSAGE, error.getMessage());
            result.putExtra(EXTRA_ERROR_DATA_JSON, error.getData().toString());
            result.putExtra(
                EXTRA_DEBUG_TRACE_JSON,
                debugTrace == null ? "{}" : debugTrace.toJson(error.getCode(), error.getMessage()).toString()
            );
            setResult(Activity.RESULT_CANCELED, result);
            finish();
        });
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (executorService != null) {
            executorService.shutdownNow();
            executorService = null;
        }
        if (webView != null) {
            WebView current = webView;
            webView = null;
            current.stopLoading();
            current.loadUrl("about:blank");
            current.removeAllViews();
            current.destroy();
        }
        releaseBusy();
        super.onDestroy();
    }
}
