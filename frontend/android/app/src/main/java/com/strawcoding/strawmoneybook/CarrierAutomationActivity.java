package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CarrierAutomationActivity extends Activity {
    static final int DESKTOP_VIEWPORT_WIDTH = 1280;

    public static final String ACTION_CONNECT_CARRIER = "connect_carrier";
    public static final String ACTION_SYNC_CARRIER = "sync_carrier";
    public static final String ACTION_DISCONNECT_CARRIER = "disconnect_carrier";
    public static final String ACTION_SUBMIT_CAPTCHA = "submit_captcha";
    public static final String ACTION_ABORT_CARRIER = "abort_carrier";

    public static final String EXTRA_ACTION = "carrier_automation.action";
    public static final String EXTRA_PAYLOAD_JSON = "carrier_automation.payload_json";
    public static final String EXTRA_RESULT_JSON = "carrier_automation.result_json";
    public static final String EXTRA_ERROR_CODE = "carrier_automation.error_code";
    public static final String EXTRA_ERROR_MESSAGE = "carrier_automation.error_message";
    public static final String EXTRA_DEBUG_TRACE_JSON = "carrier_automation.debug_trace_json";
    public static final String EXTRA_ERROR_DATA_JSON = "carrier_automation.error_data_json";

    private static final long AUTOMATION_TIMEOUT_MS = 180_000L;
    private static final Object BUSY_LOCK = new Object();
    private static boolean busy = false;
    private static CarrierAutomationActivity currentInstance = null;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executorService;
    private Runnable timeoutRunnable;
    private WebView webView;
    private boolean finished = false;
    private CarrierAutomationDebugTrace debugTrace;

    public static boolean isBusy() {
        synchronized (BUSY_LOCK) {
            return busy;
        }
    }

    public static void abortRunningSession() {
        CarrierSyncOrchestrator.requestAbortAll();
        CarrierAutomationActivity instance = currentInstance;
        if (instance != null && !instance.finished) {
            instance.finishWithError(new CarrierAutomationException("carrier_automation_aborted", "Carrier automation was cancelled"));
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
            currentInstance = null;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!acquireBusy()) {
            finishWithError(new CarrierAutomationException("carrier_automation_busy", "Carrier automation is already running"));
            return;
        }
        currentInstance = this;

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
        debugTrace = new CarrierAutomationDebugTrace(action);
        debugTrace.record("activity_created", "ok", "Carrier automation activity created");
        final JSONObject payload;
        try {
            payload = payloadJson.isEmpty() ? new JSONObject() : new JSONObject(payloadJson);
        } catch (Exception error) {
            finishWithError(new CarrierAutomationException("carrier_automation_payload_invalid", String.valueOf(error.getMessage())));
            return;
        }

        timeoutRunnable = () -> finishWithError(new CarrierAutomationException("carrier_automation_timeout", "Carrier automation timed out"));
        mainHandler.postDelayed(timeoutRunnable, AUTOMATION_TIMEOUT_MS);

        executorService.execute(() -> runAction(action, payload));
    }

    private WebView buildWebView() {
        WebView nextWebView = new WebView(this);
        nextWebView.setBackgroundColor(Color.TRANSPARENT);
        nextWebView.setAlpha(0.01f);

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
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
            CarrierAutomationVault vault = new CarrierAutomationVault(getApplicationContext());
            JSONObject result;
            debugTrace.record("action_started", "ok", action);
            if (ACTION_ABORT_CARRIER.equals(action)) {
                CarrierSyncOrchestrator.requestAbortAll();
                result = new JSONObject();
                result.put("aborted", true);
                finishWithSuccess(result);
                return;
            }
            result = dispatchByOrchestrator(action, payload, vault);
            if (result.optBoolean("needsCaptcha", false)) {
                JSONObject errorData = new JSONObject();
                errorData.put("sessionId", result.optString("sessionId"));
                errorData.put("captchaImageBase64", result.optString("captchaImageBase64"));
                CarrierAutomationException captchaError = new CarrierAutomationException(
                    "einvoice_captcha_required",
                    "Captcha confirmation is required"
                );
                captchaError.attachData(errorData);
                finishWithError(captchaError);
                return;
            }
            finishWithSuccess(result);
        } catch (CarrierAutomationException error) {
            finishWithError(error);
        } catch (Exception error) {
            finishWithError(new CarrierAutomationException("carrier_automation_failed", String.valueOf(error.getMessage())));
        }
    }

    private JSONObject dispatchByOrchestrator(String action, JSONObject payload, CarrierAutomationVault vault) throws Exception {
        if (ACTION_CONNECT_CARRIER.equals(action)) {
            return CarrierSyncOrchestrator.connect(this, webView, vault, debugTrace, payload);
        }
        if (ACTION_SYNC_CARRIER.equals(action)) {
            return CarrierSyncOrchestrator.sync(this, webView, vault, debugTrace, payload);
        }
        if (ACTION_SUBMIT_CAPTCHA.equals(action)) {
            return CarrierSyncOrchestrator.submitCaptcha(this, webView, vault, debugTrace, payload);
        }
        if (ACTION_DISCONNECT_CARRIER.equals(action)) {
            return CarrierSyncOrchestrator.disconnect(this, webView, vault, debugTrace, payload);
        }
        throw new CarrierAutomationException("carrier_automation_action_invalid", "Unsupported carrier automation action");
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
            }
            result.putExtra(EXTRA_RESULT_JSON, safePayload.toString());
            setResult(Activity.RESULT_OK, result);
            finish();
        });
    }

    private void finishWithError(CarrierAutomationException error) {
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
