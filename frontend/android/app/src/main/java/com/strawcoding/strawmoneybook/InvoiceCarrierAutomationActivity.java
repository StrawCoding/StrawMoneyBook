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

public class InvoiceCarrierAutomationActivity extends Activity {
    public static final String ACTION_CREATE_LINK_SESSION = "create_link_session";
    public static final String ACTION_GET_SESSION_STATUS = "get_session_status";
    public static final String ACTION_EXCHANGE_AUTH = "exchange_auth";
    public static final String ACTION_SYNC = "sync";
    public static final String ACTION_DISCONNECT = "disconnect";

    public static final String EXTRA_ACTION = "invoice_carrier_automation.action";
    public static final String EXTRA_PAYLOAD_JSON = "invoice_carrier_automation.payload_json";
    public static final String EXTRA_RESULT_JSON = "invoice_carrier_automation.result_json";
    public static final String EXTRA_ERROR_CODE = "invoice_carrier_automation.error_code";
    public static final String EXTRA_ERROR_MESSAGE = "invoice_carrier_automation.error_message";
    public static final String EXTRA_DEBUG_TRACE_JSON = "invoice_carrier_automation.debug_trace_json";

    private static final long AUTOMATION_TIMEOUT_MS = 120_000L;
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
            finishWithError(new BankAutomationException("invoice_carrier_native_busy", "Invoice carrier automation is already running"));
            return;
        }

        executorService = Executors.newSingleThreadExecutor();
        webView = buildWebView();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        final String action = stringExtra(getIntent(), EXTRA_ACTION);
        final String payloadJson = stringExtra(getIntent(), EXTRA_PAYLOAD_JSON);
        debugTrace = new BankAutomationDebugTrace(action);
        debugTrace.record("activity_created", "ok", "Invoice carrier automation activity created");
        final JSONObject payload;
        try {
            payload = payloadJson.isEmpty() ? new JSONObject() : new JSONObject(payloadJson);
        } catch (Exception error) {
            finishWithError(new BankAutomationException("invoice_carrier_payload_invalid", String.valueOf(error.getMessage())));
            return;
        }

        timeoutRunnable = () -> finishWithError(new BankAutomationException("invoice_carrier_timeout", "Invoice carrier automation timed out"));
        mainHandler.postDelayed(timeoutRunnable, AUTOMATION_TIMEOUT_MS);

        executorService.execute(() -> runAction(action, payload));
    }

    private WebView buildWebView() {
        WebView nextWebView = new WebView(this);
        nextWebView.setBackgroundColor(Color.WHITE);

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
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; StrawMoneyBook) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36");

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
            if (ACTION_CREATE_LINK_SESSION.equals(action)) {
                result = InvoiceCarrierAutomation.createLinkSession(this, webView, vault, debugTrace, payload);
            } else if (ACTION_GET_SESSION_STATUS.equals(action)) {
                result = InvoiceCarrierAutomation.getSessionStatus(this, webView, vault, debugTrace, payload);
            } else if (ACTION_EXCHANGE_AUTH.equals(action)) {
                result = InvoiceCarrierAutomation.exchangeAuth(this, webView, vault, debugTrace, payload);
            } else if (ACTION_SYNC.equals(action)) {
                result = InvoiceCarrierAutomation.sync(this, webView, vault, debugTrace, payload);
            } else if (ACTION_DISCONNECT.equals(action)) {
                result = InvoiceCarrierAutomation.disconnect(vault, payload);
            } else {
                throw new BankAutomationException("invoice_carrier_action_invalid", "Unsupported invoice carrier automation action");
            }
            finishWithSuccess(result);
        } catch (BankAutomationException error) {
            finishWithError(error);
        } catch (Exception error) {
            finishWithError(new BankAutomationException("invoice_carrier_native_failed", String.valueOf(error.getMessage())));
        }
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
                // Skip debug trace attachment if serialization fails.
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
