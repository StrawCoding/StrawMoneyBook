package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class EInvoiceAutomationActivity extends Activity {
    public static final String EXTRA_PAYLOAD_JSON = "einvoice_automation.payload_json";
    public static final String EXTRA_RESULT_JSON = "einvoice_automation.result_json";
    public static final String EXTRA_ERROR_CODE = "einvoice_automation.error_code";
    public static final String EXTRA_ERROR_MESSAGE = "einvoice_automation.error_message";

    // SMB-174 redesign: extended timeout to accommodate manual-captcha fallback (the user may
    // need up to 90s to read and type the captcha after OCR fails).
    private static final long AUTOMATION_TIMEOUT_MS = 180_000L;
    private static final Object BUSY_LOCK = new Object();
    private static boolean busy = false;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executorService;
    private Runnable timeoutRunnable;
    private WebView webView;
    private TextView statusTitle;
    private boolean finished = false;

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
            finishWithError("einvoice_automation_busy", "E-invoice automation is already running");
            return;
        }

        executorService = Executors.newSingleThreadExecutor();
        webView = buildWebView();
        setContentView(buildContentView(webView));

        final String payloadJson = stringExtra(getIntent(), EXTRA_PAYLOAD_JSON);
        final JSONObject payload;
        try {
            payload = payloadJson.isEmpty() ? new JSONObject() : new JSONObject(payloadJson);
        } catch (Exception error) {
            finishWithError("einvoice_automation_payload_invalid", String.valueOf(error.getMessage()));
            return;
        }

        timeoutRunnable = () -> finishWithError("einvoice_automation_timeout", "E-invoice automation timed out");
        mainHandler.postDelayed(timeoutRunnable, AUTOMATION_TIMEOUT_MS);

        executorService.execute(() -> runQuery(payload));
    }

    private View buildContentView(WebView contentWebView) {
        // SMB-174: WebView is now visible (alpha 1.0) with a status header so users can SEE the
        // automation flow. Previously alpha=0.01 hid the entire WebView, making CAPTCHA OCR
        // failures and login errors invisible — Tester's "我沒有看到他有輸入" was literally
        // accurate because the WebView itself was nearly invisible.
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setBackgroundColor(Color.WHITE);
        container.addView(buildStatusHeader(), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        container.addView(contentWebView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
        return container;
    }

    private View buildStatusHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setBackgroundColor(Color.parseColor("#1F2937"));
        int paddingPx = dp(12);
        header.setPadding(paddingPx, paddingPx, paddingPx, paddingPx);
        header.setGravity(Gravity.CENTER_VERTICAL);

        statusTitle = new TextView(this);
        statusTitle.setText("正在開啟電子發票平台…");
        statusTitle.setTextColor(Color.WHITE);
        statusTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        header.addView(statusTitle, titleParams);

        TextView cancel = new TextView(this);
        cancel.setText("取消");
        cancel.setTextColor(Color.WHITE);
        cancel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        cancel.setPadding(dp(12), dp(4), dp(12), dp(4));
        cancel.setClickable(true);
        cancel.setFocusable(true);
        cancel.setOnClickListener(v -> finishWithError(
            "einvoice_automation_canceled",
            "使用者取消電子發票自動登入"
        ));
        header.addView(cancel, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        return header;
    }

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    public void postStatus(String text) {
        // SMB-174 redesign: bridge for EInvoiceAutomation to push live progress messages
        // ("選取手機條碼載具…" / "自動辨識驗證碼…" / "驗證碼自動辨識失敗，請手動輸入後按登入") to
        // the visible WebView header bar. Called from the automation background thread, so
        // we marshal back to the UI thread before touching the TextView.
        if (statusTitle == null || text == null || text.trim().isEmpty()) return;
        mainHandler.post(() -> {
            if (statusTitle != null) statusTitle.setText(text);
        });
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
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36");

        nextWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }
        });
        return nextWebView;
    }

    private void runQuery(JSONObject payload) {
        try {
            JSONObject result = EInvoiceAutomation.query(this, webView, payload, this::postStatus);
            finishWithSuccess(result);
        } catch (EInvoiceAutomation.EInvoiceException error) {
            String msg = error.getMessage();
            finishWithError(error.getCode(), msg == null || msg.trim().isEmpty() ? "E-invoice automation failed" : msg);
        } catch (Exception error) {
            String msg = error.getMessage();
            finishWithError("einvoice_automation_failed", msg == null || msg.trim().isEmpty() ? "E-invoice automation failed" : msg);
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
            result.putExtra(EXTRA_RESULT_JSON, payload == null ? "{}" : payload.toString());
            setResult(Activity.RESULT_OK, result);
            finish();
        });
    }

    private void finishWithError(String code, String message) {
        if (finished) return;
        finished = true;
        mainHandler.post(() -> {
            mainHandler.removeCallbacks(timeoutRunnable);
            Intent result = new Intent();
            result.putExtra(EXTRA_ERROR_CODE, code);
            result.putExtra(EXTRA_ERROR_MESSAGE, message);
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
        statusTitle = null;
        releaseBusy();
        super.onDestroy();
    }
}
