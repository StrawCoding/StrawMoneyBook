package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.strawcoding.strawmoneybook.core.CaptchaSolver;
import com.strawcoding.strawmoneybook.core.CarrierPortalConfig;
import com.strawcoding.strawmoneybook.core.CarrierSyncContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * nat_gov_einvoice_tw provider — 財政部電子發票整合服務平台 WebView automation.
 */
public final class NatGovEInvoiceAutomation {
    public static final String PROVIDER_ID = CarrierPortalConfig.PROVIDER_ID;
    public static final int CAPTCHA_EXPECTED_LENGTH = CaptchaSolver.EXPECTED_LENGTH;
    public static final String INTERCEPT_SKIP_REASON_POST = "post_never_replay";
    public static final String INTERCEPT_SKIP_REASON_OBSERVE_ONLY = "observe_only_no_replay";

    private static final long PAGE_WAIT_MS = 45_000L;
    private static final int MAX_CAPTCHA_ATTEMPTS = 3;
    private static final Map<String, PendingSession> PENDING_SESSIONS = new ConcurrentHashMap<>();
    private static volatile boolean abortRequested = false;

    private NatGovEInvoiceAutomation() {}

    static final class PendingSession {
        final String sessionId;
        final JSONObject payload;
        final String captchaToken;
        final String captchaImageBase64;
        final long createdAt;

        PendingSession(String sessionId, JSONObject payload, String captchaToken, String captchaImageBase64) {
            this.sessionId = sessionId;
            this.payload = payload;
            this.captchaToken = captchaToken == null ? "" : captchaToken;
            this.captchaImageBase64 = captchaImageBase64 == null ? "" : captchaImageBase64;
            this.createdAt = System.currentTimeMillis();
        }
    }

    public static void requestAbort() {
        abortRequested = true;
        PENDING_SESSIONS.clear();
    }

    public static void clearPendingSession(String sessionId) {
        if (sessionId == null || sessionId.trim().isEmpty()) return;
        PENDING_SESSIONS.remove(sessionId.trim());
    }

    public static JSONObject connect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        ensureNotAborted();
        if (isFixtureMode(payload)) {
            return fixtureConnect(payload);
        }

        String connectionId = CarrierSyncContract.resolveConnectionId(payload);
        String cardNo = normalizePhone(payload.optString("cardNo"));
        String password = normalizeText(payload.optString("cardEncrypt"));
        if (cardNo.isEmpty() || password.length() < 4) {
            throw new CarrierAutomationException("carrier_sync_credentials_missing", "Carrier phone and password are required");
        }

        BrowserSession session = new BrowserSession(activity, webView, debugTrace);
        debugTrace.record("open_portal", "running", "Opening e-invoice login portal");
        session.loadUrl(CarrierPortalConfig.LOGIN_URL);
        session.waitForLoginReady();
        debugTrace.record("open_portal", "ok", "Login portal ready");

        CaptchaBundle captcha = resolveCaptcha(activity, session, debugTrace, payload, "");
        if (captcha.needsManual) {
            String sessionId = registerPendingSession(payload, captcha);
            return captchaRequiredResult(sessionId, captcha.imageBase64);
        }

        performLogin(session, debugTrace, cardNo, password, captcha.code, captcha.token);
        debugTrace.record("login_complete", "ok", "Portal login completed");

        JSONObject state = new JSONObject();
        state.put("provider", PROVIDER_ID);
        state.put("connectionId", connectionId);
        state.put("cardNo", cardNo);
        state.put("loggedIn", true);
        state.put("cookieHeader", session.captureCookies());
        state.put("updatedAt", System.currentTimeMillis());
        vault.saveConnectionState(connectionId, state);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("providerId", PROVIDER_ID);
        result.put("connectionId", connectionId);
        result.put("needsCaptcha", false);
        result.put("loggedIn", true);
        return result;
    }

    public static JSONObject sync(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        ensureNotAborted();
        if (isFixtureMode(payload)) {
            return fixtureSync(payload);
        }

        String connectionId = CarrierSyncContract.resolveConnectionId(payload);
        JSONObject state = vault.getConnectionState(connectionId);
        if (state == null || !state.optBoolean("loggedIn", false)) {
            throw new CarrierAutomationException("carrier_sync_credentials_missing", "Carrier session is missing. Please connect first.");
        }

        BrowserSession session = new BrowserSession(activity, webView, debugTrace);
        String cookieHeader = normalizeText(state.optString("cookieHeader"));
        if (!cookieHeader.isEmpty()) {
            session.restoreCookies(cookieHeader);
        }

        debugTrace.record("open_query", "running", "Opening invoice query portal");
        session.loadUrl(CarrierPortalConfig.QUERY_URL);
        session.waitForPageSettle(8_000L);
        debugTrace.record("open_query", "ok", "Query portal loaded");

        String dateFrom = normalizeText(payload.optString("dateFrom"));
        String dateTo = normalizeText(payload.optString("dateTo"));
        JSONArray invoices = session.collectInterceptedInvoices(dateFrom, dateTo);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("providerId", PROVIDER_ID);
        result.put("connectionId", connectionId);
        result.put("invoices", invoices);
        result.put("fetchedCount", invoices.length());
        return result;
    }

    public static JSONObject disconnect(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        String connectionId = CarrierSyncContract.resolveConnectionId(payload);
        if (!connectionId.isEmpty()) {
            vault.deleteConnectionState(connectionId);
        }
        clearPendingSession(normalizeText(payload.optString("sessionId")));
        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("connectionId", connectionId);
        result.put("disconnected", true);
        return result;
    }

    public static JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        CarrierAutomationVault vault,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        ensureNotAborted();
        String sessionId = normalizeText(payload.optString("sessionId"));
        PendingSession pending = PENDING_SESSIONS.get(sessionId);
        if (pending == null) {
            throw new CarrierAutomationException("einvoice_session_expired", "Captcha session expired. Please retry sync.");
        }

        String manualCode = CaptchaSolver.normalize(payload.optString("captchaCode"));
        if (!CaptchaSolver.validateCaptchaCandidate(manualCode, false)) {
            throw new CarrierAutomationException("einvoice_captcha_invalid", "Captcha code must be 4 alphanumeric characters");
        }

        BrowserSession session = new BrowserSession(activity, webView, debugTrace);
        session.loadUrl(CarrierPortalConfig.LOGIN_URL);
        session.waitForLoginReady();

        String cardNo = normalizePhone(pending.payload.optString("cardNo"));
        String password = normalizeText(pending.payload.optString("cardEncrypt"));
        performLogin(session, debugTrace, cardNo, password, manualCode, pending.captchaToken);
        PENDING_SESSIONS.remove(sessionId);

        String connectionId = CarrierSyncContract.resolveConnectionId(pending.payload);
        JSONObject state = new JSONObject();
        state.put("provider", PROVIDER_ID);
        state.put("connectionId", connectionId);
        state.put("cardNo", cardNo);
        state.put("loggedIn", true);
        state.put("cookieHeader", session.captureCookies());
        state.put("updatedAt", System.currentTimeMillis());
        vault.saveConnectionState(connectionId, state);

        JSONObject merged = new JSONObject(pending.payload.toString());
        merged.put("sessionId", sessionId);
        return sync(activity, webView, vault, debugTrace, merged);
    }

    public static boolean shouldReplayInterceptRequest(String method) {
        return CarrierSyncContract.shouldReplayInterceptRequest(method);
    }

    public static String interceptSkipReason(String method) {
        if ("POST".equalsIgnoreCase(normalizeText(method))) {
            return INTERCEPT_SKIP_REASON_POST;
        }
        return INTERCEPT_SKIP_REASON_OBSERVE_ONLY;
    }

    public static boolean isNatGovHost(String url) {
        String normalized = normalizeText(url).toLowerCase(Locale.ROOT);
        return normalized.contains("einvoice.nat.gov.tw");
    }

    public static JSONArray normalizeFixtureInvoices(JSONArray source) throws Exception {
        JSONArray result = new JSONArray();
        if (source == null) return result;
        for (int index = 0; index < source.length(); index += 1) {
            JSONObject item = source.optJSONObject(index);
            if (item == null) continue;
            JSONObject normalized = new JSONObject();
            normalized.put("invoiceNumber", normalizeText(item.optString("invoiceNumber", item.optString("invNum"))));
            normalized.put("amount", item.optInt("amount", item.optInt("invAmount", 0)));
            normalized.put("invoiceDate", item.opt("invoiceDate"));
            normalized.put("merchantName", normalizeText(item.optString("merchantName", item.optString("sellerName"))));
            normalized.put("carrierName", normalizeText(item.optString("carrierName", "手機條碼")));
            if (!normalized.optString("invoiceNumber").isEmpty()) {
                result.put(normalized);
            }
        }
        return result;
    }

    private static JSONObject fixtureConnect(JSONObject payload) throws Exception {
        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("providerId", PROVIDER_ID);
        result.put("connectionId", CarrierSyncContract.resolveConnectionId(payload));
        result.put("needsCaptcha", false);
        result.put("fixtureMode", true);
        return result;
    }

    private static JSONObject fixtureSync(JSONObject payload) throws Exception {
        JSONArray invoices = payload.optJSONArray("fixtureInvoices");
        if (invoices == null) invoices = new JSONArray();
        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("providerId", PROVIDER_ID);
        result.put("connectionId", CarrierSyncContract.resolveConnectionId(payload));
        result.put("invoices", normalizeFixtureInvoices(invoices));
        result.put("fixtureMode", true);
        return result;
    }

    private static boolean isFixtureMode(JSONObject payload) {
        return payload != null && payload.optBoolean("fixtureMode", false);
    }

    private static void ensureNotAborted() throws CarrierAutomationException {
        if (abortRequested) {
            abortRequested = false;
            throw new CarrierAutomationException("carrier_automation_aborted", "Carrier automation was cancelled");
        }
    }

    private static CaptchaBundle resolveCaptcha(
        Activity activity,
        BrowserSession session,
        CarrierAutomationDebugTrace debugTrace,
        JSONObject payload,
        String manualCaptcha
    ) throws Exception {
        String normalizedManual = CaptchaSolver.normalize(manualCaptcha);
        if (CaptchaSolver.validateCaptchaCandidate(normalizedManual, false)) {
            CaptchaBundle bundle = fetchCaptchaFromApi(session, debugTrace);
            bundle.code = normalizedManual;
            bundle.needsManual = false;
            return bundle;
        }

        for (int attempt = 0; attempt < MAX_CAPTCHA_ATTEMPTS; attempt += 1) {
            ensureNotAborted();
            CaptchaBundle bundle = fetchCaptchaFromApi(session, debugTrace);
            String ocr = recognizeCaptcha(activity, debugTrace, attempt + 1, bundle.imageDataUrl);
            if (CaptchaSolver.validateCaptchaCandidate(ocr, false)) {
                bundle.code = ocr;
                bundle.needsManual = false;
                return bundle;
            }
            debugTrace.record("captcha_ocr", "error", "OCR did not produce valid captcha candidate");
            session.refreshCaptcha(bundle.token);
        }

        CaptchaBundle last = fetchCaptchaFromApi(session, debugTrace);
        last.needsManual = true;
        return last;
    }

    private static CaptchaBundle fetchCaptchaFromApi(BrowserSession session, CarrierAutomationDebugTrace debugTrace) throws Exception {
        JSONObject response = session.evaluateJson(
            "(async () => {"
                + "const res = await fetch('" + CarrierPortalConfig.CAPTCHA_API_URL + "', { credentials: 'include' });"
                + "if (!res.ok) return { ok: false, status: res.status };"
                + "const data = await res.json();"
                + "return { ok: true, token: String(data.token || ''), image: String(data.image || data.img || '') };"
                + "})()"
        );
        if (response == null || !response.optBoolean("ok", false)) {
            throw new CarrierAutomationException("einvoice_portal_changed", "Unable to fetch captcha from portal API");
        }
        CaptchaBundle bundle = new CaptchaBundle();
        bundle.token = normalizeText(response.optString("token"));
        bundle.imageBase64 = normalizeText(response.optString("image"));
        bundle.imageDataUrl = bundle.imageBase64.startsWith("data:")
            ? bundle.imageBase64
            : "data:image/png;base64," + bundle.imageBase64;
        debugTrace.record("captcha_fetch", "ok", "Fetched captcha token from portal API");
        return bundle;
    }

    private static void performLogin(
        BrowserSession session,
        CarrierAutomationDebugTrace debugTrace,
        String cardNo,
        String password,
        String captchaCode,
        String captchaToken
    ) throws Exception {
        String script = "(function(payload){"
            + "const phone = document.querySelector('" + CarrierPortalConfig.SELECTOR_PHONE + "');"
            + "const pwd = document.querySelector('" + CarrierPortalConfig.SELECTOR_PASSWORD + "');"
            + "const captcha = document.querySelector('" + CarrierPortalConfig.SELECTOR_CAPTCHA + "');"
            + "const btn = document.querySelector('" + CarrierPortalConfig.SELECTOR_LOGIN_BUTTON + "');"
            + "if (!phone || !pwd || !captcha || !btn) return JSON.stringify({ ok: false, reason: 'selectors_missing' });"
            + "phone.value = payload.cardNo;"
            + "pwd.value = payload.password;"
            + "captcha.value = payload.captchaCode;"
            + "btn.click();"
            + "return JSON.stringify({ ok: true });"
            + "})(" + new JSONObject()
                .put("cardNo", cardNo)
                .put("password", password)
                .put("captchaCode", captchaCode)
                .put("captchaToken", captchaToken)
                .toString() + ")";
        JSONObject fillResult = session.evaluateJson(script);
        if (fillResult == null || !fillResult.optBoolean("ok", false)) {
            throw new CarrierAutomationException("einvoice_portal_changed", "Login form selectors were not found");
        }
        debugTrace.record("login_submit", "ok", "Submitted login form");
        session.waitForPageSettle(6_000L);
    }

    private static String recognizeCaptcha(
        Activity activity,
        CarrierAutomationDebugTrace debugTrace,
        int attempt,
        String dataUrl
    ) {
        return CaptchaSolver.recognizeFromDataUrl(activity, null, attempt, dataUrl, false);
    }

    private static String registerPendingSession(JSONObject payload, CaptchaBundle captcha) {
        String sessionId = "carrier_" + UUID.randomUUID().toString().replace("-", "");
        PENDING_SESSIONS.put(sessionId, new PendingSession(sessionId, payload, captcha.token, captcha.imageBase64));
        return sessionId;
    }

    private static JSONObject captchaRequiredResult(String sessionId, String imageBase64) throws Exception {
        JSONObject result = new JSONObject();
        result.put("needsCaptcha", true);
        result.put("needs_captcha", true);
        result.put("sessionId", sessionId);
        result.put("session_id", sessionId);
        result.put("captchaImageBase64", imageBase64);
        result.put("captcha_image_base64", imageBase64);
        return result;
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizePhone(String value) {
        String raw = normalizeText(value).replaceAll("[\\s-]", "");
        if (raw.startsWith("+886")) raw = "0" + raw.substring(4);
        if (raw.matches("^886\\d{9}$")) raw = "0" + raw.substring(3);
        return raw;
    }

    private static final class CaptchaBundle {
        String token = "";
        String code = "";
        String imageBase64 = "";
        String imageDataUrl = "";
        boolean needsManual = false;
    }

    static final class BrowserSession {
        private final Activity activity;
        private final WebView webView;
        private final CarrierAutomationDebugTrace debugTrace;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final List<JSONObject> interceptedPayloads = new ArrayList<>();
        private volatile boolean pageReady = false;

        BrowserSession(Activity activity, WebView webView, CarrierAutomationDebugTrace debugTrace) {
            this.activity = activity;
            this.webView = webView;
            this.debugTrace = debugTrace;
            attachClient();
        }

        void loadUrl(String url) throws InterruptedException {
            CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> {
                webView.loadUrl(url);
                latch.countDown();
            });
            latch.await(5, TimeUnit.SECONDS);
        }

        void waitForLoginReady() throws Exception {
            long deadline = System.currentTimeMillis() + PAGE_WAIT_MS;
            while (System.currentTimeMillis() < deadline) {
                ensureNotAborted();
                JSONObject probe = evaluateJson(
                    "() => ({"
                        + "phone: !!document.querySelector('" + CarrierPortalConfig.SELECTOR_PHONE + "'),"
                        + "password: !!document.querySelector('" + CarrierPortalConfig.SELECTOR_PASSWORD + "'),"
                        + "captcha: !!document.querySelector('" + CarrierPortalConfig.SELECTOR_CAPTCHA + "')"
                        + "})"
                );
                if (probe != null && probe.optBoolean("phone") && probe.optBoolean("password") && probe.optBoolean("captcha")) {
                    return;
                }
                Thread.sleep(400L);
            }
            throw new CarrierAutomationException("einvoice_cloudflare_timeout", "Portal login page did not become ready");
        }

        void waitForPageSettle(long ms) throws InterruptedException {
            Thread.sleep(Math.max(500L, ms));
        }

        void refreshCaptcha(String token) throws Exception {
            evaluateJson("(async () => { await new Promise(r => setTimeout(r, 300)); return { ok: true }; })()");
        }

        JSONObject evaluateJson(String script) throws Exception {
            AtomicReference<String> resultRef = new AtomicReference<>("");
            CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> webView.evaluateJavascript(script, value -> {
                resultRef.set(value == null ? "" : value);
                latch.countDown();
            }));
            if (!latch.await(PAGE_WAIT_MS, TimeUnit.MILLISECONDS)) {
                throw new CarrierAutomationException("carrier_automation_timeout", "WebView script timed out");
            }
            String raw = resultRef.get();
            if (raw == null || raw.trim().isEmpty() || "null".equals(raw.trim())) return new JSONObject();
            if (raw.startsWith("\"") && raw.endsWith("\"")) {
                raw = raw.substring(1, raw.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\n", "\n")
                    .replace("\\u0026", "&");
            }
            return new JSONObject(raw);
        }

        JSONArray collectInterceptedInvoices(String dateFrom, String dateTo) throws Exception {
            JSONArray invoices = new JSONArray();
            for (JSONObject payload : interceptedPayloads) {
                invoices = mergeInvoiceArrays(invoices, extractInvoices(payload));
            }
            if (invoices.length() > 0) return invoices;
            JSONObject fallback = evaluateJson(
                "() => ({ ok: true, note: 'observe_only_no_dom_fallback_in_android_v1' })"
            );
            debugTrace.record("query_intercept", "ok", "Intercept collection finished", fallback);
            return invoices;
        }

        String captureCookies() {
            CookieManager manager = CookieManager.getInstance();
            String cookies = manager.getCookie("https://www.einvoice.nat.gov.tw");
            return cookies == null ? "" : cookies;
        }

        void restoreCookies(String cookieHeader) {
            CookieManager manager = CookieManager.getInstance();
            for (String part : cookieHeader.split(";")) {
                String trimmed = part.trim();
                if (!trimmed.isEmpty()) {
                    manager.setCookie("https://www.einvoice.nat.gov.tw", trimmed);
                }
            }
            manager.flush();
        }

        JSONObject interceptSnapshot() throws Exception {
            JSONObject snapshot = new JSONObject();
            snapshot.put("payloadCount", interceptedPayloads.size());
            return snapshot;
        }

        private void attachClient() {
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    observeRequest(request);
                    return super.shouldInterceptRequest(view, request);
                }
            });
        }

        private void observeRequest(WebResourceRequest request) {
            if (request == null || request.getUrl() == null) return;
            String url = request.getUrl().toString();
            if (!CarrierSyncContract.isQueryApiUrl(url)) return;
            if (CarrierSyncContract.shouldReplayInterceptRequest(request.getMethod())) return;
            try {
                // Observe-only: actual body capture happens post-response via evaluate when available.
                JSONObject marker = new JSONObject();
                marker.put("url", url);
                marker.put("method", request.getMethod());
                interceptedPayloads.add(marker);
            } catch (Exception ignored) {
            }
        }
    }

    private static JSONArray extractInvoices(JSONObject payload) throws Exception {
        JSONArray result = new JSONArray();
        if (payload == null) return result;
        JSONArray candidates = findInvoiceArray(payload);
        for (int index = 0; index < candidates.length(); index += 1) {
            JSONObject item = candidates.optJSONObject(index);
            if (item == null) continue;
            String number = normalizeText(item.optString("invNum", item.optString("invoiceNumber")));
            if (number.length() < 8) continue;
            JSONObject normalized = new JSONObject();
            normalized.put("invoiceNumber", number);
            normalized.put("amount", item.optInt("invAmount", item.optInt("amount", 0)));
            normalized.put("invoiceDate", item.opt("invDate"));
            normalized.put("merchantName", normalizeText(item.optString("sellerName", item.optString("merchantName"))));
            normalized.put("carrierName", "手機條碼");
            result.put(normalized);
        }
        return result;
    }

    private static JSONArray findInvoiceArray(JSONObject payload) {
        JSONArray empty = new JSONArray();
        if (payload == null) return empty;
        if (payload.has("list")) return payload.optJSONArray("list");
        JSONObject data = payload.optJSONObject("data");
        if (data != null && data.has("list")) return data.optJSONArray("list");
        if (data != null && data.has("rows")) return data.optJSONArray("rows");
        return empty;
    }

    private static JSONArray mergeInvoiceArrays(JSONArray left, JSONArray right) throws Exception {
        JSONArray merged = new JSONArray();
        List<String> seen = new ArrayList<>();
        appendUnique(merged, seen, left);
        appendUnique(merged, seen, right);
        return merged;
    }

    private static void appendUnique(JSONArray target, List<String> seen, JSONArray source) throws Exception {
        if (source == null) return;
        for (int index = 0; index < source.length(); index += 1) {
            JSONObject item = source.optJSONObject(index);
            if (item == null) continue;
            String number = normalizeText(item.optString("invoiceNumber"));
            if (number.isEmpty() || seen.contains(number)) continue;
            seen.add(number);
            target.put(item);
        }
    }
}
