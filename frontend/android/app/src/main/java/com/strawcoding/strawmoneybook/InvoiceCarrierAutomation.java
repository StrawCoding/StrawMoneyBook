package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class InvoiceCarrierAutomation {
    private static final String PROVIDER_ID = "einvoice_tw";
    private static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login";
    private static final String SEARCH_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search";
    private static final String DETAIL_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail";
    private static final long SESSION_TTL_MS = 5 * 60 * 1000L;
    private static final long PAGE_TIMEOUT_MS = 30_000L;
    private static final long READY_TIMEOUT_MS = 90_000L;
    private static final long POLL_MS = 400L;
    private static final int CAPTCHA_MAX_ATTEMPTS = 3;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US);

    private InvoiceCarrierAutomation() {}

    public static JSONObject connect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String mobilePhone = requireText(payload, "mobile_phone", "invoice_carrier_credentials_missing", "缺少手機號碼或密碼");
        String password = requireText(payload, "password", "invoice_carrier_credentials_missing", "缺少手機號碼或密碼");

        BrowserSession session = new BrowserSession(activity, webView);
        debugTrace.record("load_login_page", "running", "Loading eInvoice login page");
        session.loadUrl(LOGIN_URL);

        JSONObject authenticatedStatus = authenticateSession(session, mobilePhone, password, debugTrace);
        String connectionId = createProviderConnectionId(mobilePhone);
        JSONObject carriers = new JSONObject();
        carriers.put("available_carriers", authenticatedStatus.optJSONArray("available_carriers") == null ? new JSONArray() : authenticatedStatus.optJSONArray("available_carriers"));

        JSONObject persistedState = buildPersistedConnectionState(
            connectionId,
            mobilePhone,
            password,
            session.captureCookies(),
            carriers.optJSONArray("available_carriers")
        );
        vault.saveConnectionState(connectionId, persistedState);

        JSONObject result = buildSuccessPayload(connectionId, mobilePhone);
        result.put("available_carriers", carriers.optJSONArray("available_carriers"));
        result.put("authenticated_at", nowIso());
        return result;
    }

    public static JSONObject createLinkSession(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String sessionId = "native_einv_" + UUID.randomUUID().toString().replace("-", "");
        BrowserSession session = new BrowserSession(activity, webView);
        debugTrace.record("load_login_page", "running", "Loading eInvoice login page");
        session.loadUrl(LOGIN_URL);
        JSONObject status = waitForInteractiveStatus(session, debugTrace, true);
        saveTemporarySession(vault, sessionId, session.captureCookies());
        debugTrace.record("session_ready", "ok", "eInvoice link session is ready");
        return buildSessionPayload(sessionId, status);
    }

    public static JSONObject getSessionStatus(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String sessionId = requireText(payload, "session_id", "invoice_carrier_session_required", "缺少電子發票驗證 session");
        JSONObject state = requireTemporarySession(vault, sessionId);
        BrowserSession session = new BrowserSession(activity, webView);
        session.restoreCookies(state.optString("cookieHeader", ""));
        debugTrace.record("reload_login_page", "running", "Reloading eInvoice session");
        session.loadUrl(LOGIN_URL);
        JSONObject status = waitForInteractiveStatus(session, debugTrace, payload.optBoolean("refresh_captcha", false));
        saveTemporarySession(vault, sessionId, session.captureCookies());
        return buildSessionPayload(sessionId, status);
    }

    public static JSONObject exchangeAuth(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String sessionId = requireText(payload, "session_id", "invoice_carrier_session_required", "缺少電子發票驗證 session");
        String mobilePhone = requireText(payload, "mobile_phone", "invoice_carrier_credentials_required", "缺少手機號碼或密碼");
        String password = requireText(payload, "password", "invoice_carrier_credentials_required", "缺少手機號碼或密碼");
        String captchaCode = normalizeText(payload.optString("captcha_code"));
        if (captchaCode.isEmpty()) {
            throw new BankAutomationException("invoice_carrier_credentials_required", "缺少圖形驗證碼");
        }

        JSONObject tempState = requireTemporarySession(vault, sessionId);
        BrowserSession session = new BrowserSession(activity, webView);
        session.restoreCookies(tempState.optString("cookieHeader", ""));
        debugTrace.record("load_login_page", "running", "Loading eInvoice login page for auth exchange");
        session.loadUrl(LOGIN_URL);
        JSONObject beforeStatus = waitForInteractiveStatus(session, debugTrace, false);
        if (beforeStatus.optBoolean("cloudflare_blocked", false)) {
            throw new BankAutomationException("invoice_carrier_cloudflare_verification_required", "請先在手機頁面完成 Cloudflare 安全驗證");
        }
        if (!beforeStatus.optBoolean("login_form_ready", false) && !beforeStatus.optBoolean("search_form_ready", false)) {
            throw new BankAutomationException("invoice_carrier_login_required", "電子發票登入頁尚未就緒，請先完成安全驗證");
        }
        if (!beforeStatus.optBoolean("search_form_ready", false)) {
            submitLogin(session, mobilePhone, password, captchaCode);
        }

        JSONObject afterStatus = waitForSearchStatus(session, debugTrace);
        if (!afterStatus.optBoolean("search_form_ready", false)) {
            throw new BankAutomationException(
                "invoice_carrier_login_failed",
                normalizeText(afterStatus.optString("error_message")).isEmpty()
                    ? "電子發票登入失敗，請確認手機號碼、密碼與驗證碼"
                    : afterStatus.optString("error_message")
            );
        }

        String connectionId = createProviderConnectionId(mobilePhone);
        JSONObject persistedState = new JSONObject();
        persistedState.put("provider", PROVIDER_ID);
        persistedState.put("connectionId", connectionId);
        persistedState.put("mobilePhone", mobilePhone);
        persistedState.put("password", password);
        persistedState.put("cookieHeader", session.captureCookies());
        persistedState.put("carrierOptions", afterStatus.optJSONArray("available_carriers") == null ? new JSONArray() : afterStatus.optJSONArray("available_carriers"));
        persistedState.put("updatedAt", nowIso());
        vault.saveConnectionState(connectionId, persistedState);
        vault.deleteConnectionState(tempSessionKey(sessionId));

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("mobile_phone", mobilePhone);
        result.put("provider_connection_id", connectionId);
        result.put("storage_state", buildNativeStorageState(connectionId));
        result.put("available_carriers", afterStatus.optJSONArray("available_carriers") == null ? new JSONArray() : afterStatus.optJSONArray("available_carriers"));
        result.put("authenticated_at", nowIso());
        return result;
    }

    public static JSONObject sync(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String connectionId = requireText(payload, "connection_id", "invoice_carrier_connection_required", "缺少電子發票連線識別");
        JSONObject state = vault.getConnectionState(connectionId);
        JSONObject credentials = payload.optJSONObject("credentials");
        if (state == null && credentials != null) {
            state = new JSONObject();
            state.put("provider", PROVIDER_ID);
            state.put("connectionId", connectionId);
            state.put("mobilePhone", normalizeText(credentials.optString("mobile_phone")));
            state.put("password", credentials.optString("password", ""));
        }
        if (state == null) {
            throw new BankAutomationException("invoice_carrier_reauth_required", "手機端載具憑證遺失，請重新驗證");
        }

        BrowserSession session = new BrowserSession(activity, webView);
        String cookieHeader = normalizeText(state.optString("cookieHeader"));
        if (!cookieHeader.isEmpty()) {
            session.restoreCookies(cookieHeader);
        }
        debugTrace.record("load_search_page", "running", "Loading eInvoice search page");
        session.loadUrl(SEARCH_URL);
        JSONObject status = inspectStatus(session, false);

        if (!status.optBoolean("search_form_ready", false)) {
            String mobilePhone = normalizeText(state.optString("mobilePhone"));
            String password = state.optString("password", "");
            if (mobilePhone.isEmpty() || password.trim().isEmpty()) {
                throw new BankAutomationException("invoice_carrier_reauth_required", "載具登入狀態已失效，請重新驗證載具");
            }
            debugTrace.record("silent_relogin_needed", "running", "eInvoice session expired; trying credential relogin");
            session.loadUrl(LOGIN_URL);
            try {
                status = authenticateSession(session, mobilePhone, password, debugTrace);
            } catch (BankAutomationException error) {
                if ("invoice_carrier_automation_blocked".equals(error.getCode())) {
                    throw new BankAutomationException("invoice_carrier_reauth_required", "電子發票自動重登入需要重新驗證載具");
                }
                throw error;
            }
        }

        if (!status.optBoolean("search_form_ready", false)) {
            throw new BankAutomationException("invoice_carrier_reauth_required", "電子發票登入狀態已失效，請重新驗證載具");
        }

        DateRange range = defaultDateRange();
        String startDate = parseDate(payload.optString("start_date"), range.startDate);
        String endDate = parseDate(payload.optString("end_date"), range.endDate);
        String carrierCode = normalizeText(payload.optString("carrier_code"));
        if (carrierCode.isEmpty()) carrierCode = "all";

        submitSearch(session, startDate, endDate, carrierCode);
        JSONArray invoices = extractInvoices(session);
        JSONArray carriers = status.optJSONArray("available_carriers") == null ? new JSONArray() : status.optJSONArray("available_carriers");

        state.put("cookieHeader", session.captureCookies());
        state.put("carrierOptions", carriers);
        state.put("updatedAt", nowIso());
        vault.saveConnectionState(connectionId, state);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("connection_id", connectionId);
        result.put("invoices", invoices);
        result.put("available_carriers", carriers);
        result.put("storage_state", buildNativeStorageState(connectionId));
        result.put("sync_time", nowIso());
        result.put("result_page_url", DETAIL_URL);
        result.put("error_code", "");
        result.put("error_message", "");
        result.put("debug_trace", new JSONObject());
        return result;
    }

    public static JSONObject disconnect(BankAutomationVault vault, JSONObject payload) throws JSONException {
        String sessionId = normalizeText(payload.optString("session_id"));
        if (!sessionId.isEmpty()) {
            vault.deleteConnectionState(tempSessionKey(sessionId));
        }
        String connectionId = normalizeText(payload.optString("connection_id"));
        if (!connectionId.isEmpty()) {
            vault.deleteConnectionState(connectionId);
        }
        JSONObject result = new JSONObject();
        result.put("ok", true);
        return result;
    }

    static void runThreadAffinityRegressionHarness(Activity activity, WebView webView) throws Exception {
        BrowserSession session = new BrowserSession(activity, webView);
        session.loadUrl("about:blank");
        session.evaluateJson("(() => ({ ok: true }))();");
        session.captureCookies();
        session.restoreCookies("thread_affinity_test=1");
        session.captureCookies();
    }

    private static JSONObject buildSessionPayload(String sessionId, JSONObject status) throws JSONException {
        JSONObject result = new JSONObject(status.toString());
        result.put("provider", PROVIDER_ID);
        result.put("session_id", sessionId);
        result.put("link_url", LOGIN_URL);
        result.put("requires_manual_verification", true);
        result.put("expires_at", java.time.Instant.ofEpochMilli(System.currentTimeMillis() + SESSION_TTL_MS).toString());
        return result;
    }

    private static JSONObject buildNativeStorageState(String connectionId) throws JSONException {
        JSONObject storageState = new JSONObject();
        storageState.put("native", true);
        storageState.put("provider", PROVIDER_ID);
        storageState.put("connectionId", connectionId);
        storageState.put("cookies", new JSONArray());
        storageState.put("origins", new JSONArray());
        return storageState;
    }

    private static JSONObject buildPersistedConnectionState(String connectionId, String mobilePhone, String password, String cookieHeader, JSONArray carrierOptions) throws JSONException {
        JSONObject persistedState = new JSONObject();
        persistedState.put("provider", PROVIDER_ID);
        persistedState.put("connectionId", connectionId);
        persistedState.put("mobilePhone", mobilePhone);
        persistedState.put("password", password);
        persistedState.put("cookieHeader", cookieHeader);
        persistedState.put("carrierOptions", carrierOptions == null ? new JSONArray() : carrierOptions);
        persistedState.put("updatedAt", nowIso());
        return persistedState;
    }

    private static JSONObject buildSuccessPayload(String connectionId, String mobilePhone) throws JSONException {
        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("mobile_phone", mobilePhone);
        result.put("provider_connection_id", connectionId);
        result.put("storage_state", buildNativeStorageState(connectionId));
        result.put("error_code", "");
        result.put("error_message", "");
        result.put("debug_trace", new JSONObject());
        return result;
    }

    private static void saveTemporarySession(BankAutomationVault vault, String sessionId, String cookieHeader) throws JSONException {
        JSONObject state = new JSONObject();
        state.put("sessionId", sessionId);
        state.put("cookieHeader", cookieHeader);
        state.put("expiresAtMs", System.currentTimeMillis() + SESSION_TTL_MS);
        state.put("updatedAt", nowIso());
        vault.saveConnectionState(tempSessionKey(sessionId), state);
    }

    private static JSONObject requireTemporarySession(BankAutomationVault vault, String sessionId) throws Exception {
        JSONObject state = vault.getConnectionState(tempSessionKey(sessionId));
        if (state == null || state.optLong("expiresAtMs", 0L) <= System.currentTimeMillis()) {
            vault.deleteConnectionState(tempSessionKey(sessionId));
            throw new BankAutomationException("invoice_carrier_session_expired", "電子發票驗證視窗已失效，請重新啟動");
        }
        return state;
    }

    private static String tempSessionKey(String sessionId) {
        return "invoice_carrier.session." + normalizeText(sessionId);
    }

    private static JSONObject waitForInteractiveStatus(BrowserSession session, BankAutomationDebugTrace debugTrace, boolean includeCaptcha) throws Exception {
        long deadline = System.currentTimeMillis() + READY_TIMEOUT_MS;
        JSONObject latest = new JSONObject();
        while (System.currentTimeMillis() < deadline) {
            latest = inspectStatus(session, includeCaptcha);
            if (
                latest.optBoolean("login_form_ready", false)
                || latest.optBoolean("search_form_ready", false)
                || latest.optBoolean("cloudflare_blocked", false)
            ) {
                debugTrace.record("inspect_status", "ok", "eInvoice page status detected", latest);
                return latest;
            }
            sleep(POLL_MS);
        }
        debugTrace.record("inspect_status", "timeout", "eInvoice page did not become interactive", latest);
        return latest;
    }

    private static JSONObject waitForSearchStatus(BrowserSession session, BankAutomationDebugTrace debugTrace) throws Exception {
        long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
        JSONObject latest = new JSONObject();
        while (System.currentTimeMillis() < deadline) {
            latest = inspectStatus(session, false);
            if (latest.optBoolean("search_form_ready", false) || latest.optBoolean("cloudflare_blocked", false)) {
                debugTrace.record("search_status", "ok", "eInvoice search status detected", latest);
                return latest;
            }
            sleep(POLL_MS);
        }
        debugTrace.record("search_status", "timeout", "eInvoice search page was not ready", latest);
        return latest;
    }

    private static JSONObject authenticateSession(BrowserSession session, String mobilePhone, String password, BankAutomationDebugTrace debugTrace) throws Exception {
        JSONObject status = waitForInteractiveStatus(session, debugTrace, true);
        if (status.optBoolean("search_form_ready", false)) {
            return status;
        }
        if (status.optBoolean("cloudflare_blocked", false)) {
            throw new BankAutomationException("invoice_carrier_automation_blocked", "電子發票網站目前阻擋自動化登入，請稍後再試");
        }
        if (!status.optBoolean("login_form_ready", false)) {
            throw new BankAutomationException("invoice_carrier_login_failed", "電子發票登入頁尚未就緒");
        }

        for (int attempt = 1; attempt <= CAPTCHA_MAX_ATTEMPTS; attempt += 1) {
            JSONObject captchaResult = solveCaptcha(session, attempt > 1);
            String captchaCode = normalizeText(captchaResult.optString("code"));
            int captchaConfidence = captchaResult.optInt("confidence", 0);
            debugTrace.record(
                "captcha_ocr_attempt",
                captchaCode.isEmpty() ? "warn" : "ok",
                "Attempting local captcha OCR",
                captchaResult
            );

            if (captchaCode.isEmpty()) {
                continue;
            }

            submitLogin(session, mobilePhone, password, captchaCode);
            JSONObject nextStatus = waitForSearchStatus(session, debugTrace);
            if (nextStatus.optBoolean("search_form_ready", false)) {
                return nextStatus;
            }
            if (nextStatus.optBoolean("cloudflare_blocked", false)) {
                throw new BankAutomationException("invoice_carrier_automation_blocked", "電子發票網站目前阻擋自動化登入，請稍後再試");
            }

            String errorMessage = normalizeText(nextStatus.optString("error_message"));
            String lowered = errorMessage.toLowerCase(Locale.US);
            if (lowered.contains("驗證碼") || lowered.contains("captcha")) {
                debugTrace.record("captcha_retry", "warn", "Retrying captcha OCR after upstream validation failure", nextStatus);
                if (attempt < CAPTCHA_MAX_ATTEMPTS) {
                    session.loadUrl(LOGIN_URL);
                    status = waitForInteractiveStatus(session, debugTrace, true);
                    if (status.optBoolean("cloudflare_blocked", false)) {
                        throw new BankAutomationException("invoice_carrier_automation_blocked", "電子發票網站目前阻擋自動化登入，請稍後再試");
                    }
                    continue;
                }
                throw new BankAutomationException(
                    "invoice_carrier_captcha_failed",
                    captchaConfidence <= 0
                        ? "電子發票驗證碼自動辨識失敗，請稍後再試"
                        : "電子發票驗證碼辨識後仍無法通過驗證，請稍後再試"
                );
            }

            throw new BankAutomationException(
                "invoice_carrier_login_failed",
                errorMessage.isEmpty() ? "電子發票登入失敗，請確認手機號碼與密碼" : errorMessage
            );
        }

        throw new BankAutomationException("invoice_carrier_captcha_failed", "電子發票驗證碼自動辨識失敗，請稍後再試");
    }

    private static JSONObject solveCaptcha(BrowserSession session, boolean refreshCaptcha) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("refreshCaptcha", refreshCaptcha);
        String script = ""
            + "(() => {"
            + "const p = " + payload.toString() + ";"
            + "const imgSelector = '.code_num img, .input-group-text.code_num img, img[alt=\"圖形驗證碼\"]';"
            + "const refreshSelector = 'button[title=\"更新圖形驗證碼\"], button[aria-label=\"更新圖形驗證碼\"]';"
            + "const fonts = ['bold 26px Arial', 'bold 26px Helvetica', 'bold 26px sans-serif', 'bold 26px monospace'];"
            + "const img = document.querySelector(imgSelector);"
            + "if (!img) return { ok: false, code: '', confidence: 0, reason: 'captcha_image_not_found' };"
            + "if (p.refreshCaptcha) { const btn = document.querySelector(refreshSelector); if (btn) { btn.click(); } }"
            + "const source = document.querySelector(imgSelector);"
            + "if (!source || !source.complete || source.naturalWidth <= 0) return { ok: false, code: '', confidence: 0, reason: 'captcha_image_not_ready' };"
            + "const baseCanvas = document.createElement('canvas');"
            + "baseCanvas.width = source.naturalWidth;"
            + "baseCanvas.height = source.naturalHeight;"
            + "const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });"
            + "baseCtx.drawImage(source, 0, 0);"
            + "const { width, height } = baseCanvas;"
            + "const raw = baseCtx.getImageData(0, 0, width, height);"
            + "const data = raw.data;"
            + "const gray = new Uint8ClampedArray(width * height);"
            + "let minX = width, minY = height, maxX = -1, maxY = -1;"
            + "for (let y = 0; y < height; y += 1) {"
            + " for (let x = 0; x < width; x += 1) {"
            + "  const offset = (y * width + x) * 4;"
            + "  const value = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);"
            + "  gray[y * width + x] = value;"
            + " }"
            + "}"
            + "const histogram = new Array(256).fill(0);"
            + "for (const value of gray) histogram[value] += 1;"
            + "let total = gray.length;"
            + "let sum = 0;"
            + "for (let i = 0; i < 256; i += 1) sum += i * histogram[i];"
            + "let sumB = 0; let wB = 0; let maxVariance = 0; let threshold = 170;"
            + "for (let i = 0; i < 256; i += 1) {"
            + " wB += histogram[i];"
            + " if (!wB) continue;"
            + " const wF = total - wB;"
            + " if (!wF) break;"
            + " sumB += i * histogram[i];"
            + " const mB = sumB / wB;"
            + " const mF = (sum - sumB) / wF;"
            + " const variance = wB * wF * (mB - mF) * (mB - mF);"
            + " if (variance > maxVariance) { maxVariance = variance; threshold = i; }"
            + "}"
            + "const binary = new Uint8Array(width * height);"
            + "for (let y = 0; y < height; y += 1) {"
            + " for (let x = 0; x < width; x += 1) {"
            + "  const idx = y * width + x;"
            + "  const dark = gray[idx] < threshold;"
            + "  binary[idx] = dark ? 1 : 0;"
            + "  if (dark) {"
            + "   if (x < minX) minX = x;"
            + "   if (y < minY) minY = y;"
            + "   if (x > maxX) maxX = x;"
            + "   if (y > maxY) maxY = y;"
            + "  }"
            + " }"
            + "}"
            + "if (maxX < minX || maxY < minY) return { ok: false, code: '', confidence: 0, reason: 'captcha_dark_pixels_missing' };"
            + "const croppedWidth = maxX - minX + 1;"
            + "const columns = [];"
            + "for (let x = minX; x <= maxX; x += 1) {"
            + " let count = 0;"
            + " for (let y = minY; y <= maxY; y += 1) count += binary[y * width + x];"
            + " columns.push(count);"
            + "}"
            + "const segments = [];"
            + "let start = -1;"
            + "for (let index = 0; index < columns.length; index += 1) {"
            + " if (columns[index] > 0 && start < 0) start = index;"
            + " if ((columns[index] === 0 || index === columns.length - 1) && start >= 0) {"
            + "  const end = columns[index] === 0 ? index - 1 : index;"
            + "  segments.push({ start, end });"
            + "  start = -1;"
            + " }"
            + "}"
            + "if (!segments.length) {"
            + " const approx = Math.max(1, Math.round(croppedWidth / 4));"
            + " for (let startX = 0; startX < croppedWidth; startX += approx) segments.push({ start: startX, end: Math.min(croppedWidth - 1, startX + approx - 1) });"
            + "}"
            + "while (segments.length > 4) {"
            + " let smallest = 0;"
            + " for (let i = 1; i < segments.length; i += 1) {"
            + "  const currentWidth = segments[i].end - segments[i].start;"
            + "  const smallestWidth = segments[smallest].end - segments[smallest].start;"
            + "  if (currentWidth < smallestWidth) smallest = i;"
            + " }"
            + " if (smallest > 0) {"
            + "  segments[smallest - 1].end = segments[smallest].end;"
            + "  segments.splice(smallest, 1);"
            + " } else if (segments.length > 1) {"
            + "  segments[1].start = segments[0].start;"
            + "  segments.shift();"
            + " } else {"
            + "  break;"
            + " }"
            + "}"
            + "while (segments.length < 4) {"
            + " let widest = 0;"
            + " for (let i = 1; i < segments.length; i += 1) {"
            + "  const currentWidth = segments[i].end - segments[i].start;"
            + "  const widestWidth = segments[widest].end - segments[widest].start;"
            + "  if (currentWidth > widestWidth) widest = i;"
            + " }"
            + " const segment = segments[widest];"
            + " const middle = Math.floor((segment.start + segment.end) / 2);"
            + " segments.splice(widest, 1, { start: segment.start, end: middle }, { start: middle + 1, end: segment.end });"
            + "}"
            + "const normalizeDigit = (segment) => {"
            + " const digitCanvas = document.createElement('canvas');"
            + " digitCanvas.width = 20; digitCanvas.height = 28;"
            + " const digitCtx = digitCanvas.getContext('2d', { willReadFrequently: true });"
            + " digitCtx.fillStyle = '#fff'; digitCtx.fillRect(0, 0, 20, 28);"
            + " const sx = minX + segment.start;"
            + " const sw = Math.max(1, segment.end - segment.start + 1);"
            + " const sh = Math.max(1, maxY - minY + 1);"
            + " digitCtx.drawImage(baseCanvas, sx, minY, sw, sh, 1, 1, 18, 26);"
            + " return digitCanvas;"
            + "};"
            + "const templateScore = (sourceCanvas, digit) => {"
            + " const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });"
            + " const sourceData = sourceCtx.getImageData(0, 0, 20, 28).data;"
            + " let best = Number.POSITIVE_INFINITY;"
            + " for (const font of fonts) {"
            + "  const templateCanvas = document.createElement('canvas');"
            + "  templateCanvas.width = 20; templateCanvas.height = 28;"
            + "  const ctx = templateCanvas.getContext('2d', { willReadFrequently: true });"
            + "  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 20, 28);"
            + "  ctx.fillStyle = '#000'; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';"
            + "  ctx.fillText(String(digit), 10, 14);"
            + "  const candidate = ctx.getImageData(0, 0, 20, 28).data;"
            + "  let diff = 0;"
            + "  for (let i = 0; i < sourceData.length; i += 4) {"
            + "   const leftDark = sourceData[i] < 180 ? 1 : 0;"
            + "   const rightDark = candidate[i] < 180 ? 1 : 0;"
            + "   if (leftDark !== rightDark) diff += 1;"
            + "  }"
            + "  if (diff < best) best = diff;"
            + " }"
            + " return best;"
            + "};"
            + "const digits = [];"
            + "const confidences = [];"
            + "for (const segment of segments.slice(0, 4)) {"
            + " const digitCanvas = normalizeDigit(segment);"
            + " let bestDigit = '';"
            + " let bestScore = Number.POSITIVE_INFINITY;"
            + " for (let digit = 0; digit <= 9; digit += 1) {"
            + "  const score = templateScore(digitCanvas, digit);"
            + "  if (score < bestScore) { bestScore = score; bestDigit = String(digit); }"
            + " }"
            + " digits.push(bestDigit);"
            + " confidences.push(Math.max(0, Math.min(99, Math.round(100 - (bestScore / 5)))));"
            + "}"
            + "const confidence = confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : 0;"
            + "return { ok: digits.every(Boolean), code: digits.join(''), confidence, reason: digits.every(Boolean) ? '' : 'captcha_ocr_failed', segments: segments.length };"
            + "})()";
        return session.evaluateJson(script);
    }

    private static JSONObject inspectStatus(BrowserSession session, boolean includeCaptcha) throws Exception {
        String script = ""
            + "(() => {"
            + "const text = String(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim();"
            + "const title = String(document.title || '');"
            + "const cf = title.includes('Just a moment') || text.includes('Performing security verification') || text.includes('security service') || Boolean(document.querySelector('iframe[src*=\\\"challenges.cloudflare.com\\\"], [data-ray], [name=\\\"cf-turnstile-response\\\"]'));"
            + "const login = Boolean(document.querySelector('#mobile_phone') && document.querySelector('#password') && document.querySelector('#captcha'));"
            + "const search = Boolean(document.querySelector('#carrier') && (document.querySelector('button[title=\\\"查詢\\\"]') || document.querySelector('button[aria-label=\\\"查詢\\\"]')));"
            + "const carriers = Array.from(document.querySelectorAll('#carrier option')).map(o => ({ value: String(o.value || '').trim(), label: String(o.textContent || '').trim() })).filter(o => o.value && o.label);"
            + "const err = Array.from(document.querySelectorAll('.error, .invalid-feedback, .alert, [role=\\\"alert\\\"], .text-danger')).map(n => String(n.textContent || '').replace(/\\s+/g, ' ').trim()).find(Boolean) || '';"
            + "let cap = '';"
            + "if (" + (includeCaptcha ? "true" : "false") + " && login) {"
            + " const img = document.querySelector('.code_num img, .input-group-text.code_num img, img[alt=\\\"圖形驗證碼\\\"]');"
            + " if (img && img.complete && img.naturalWidth > 0) {"
            + "  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;"
            + "  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);"
            + "  try { cap = c.toDataURL('image/png'); } catch (_e) { cap = ''; }"
            + " }"
            + "}"
            + "return { ok: true, url: location.href, title, cloudflare_blocked: cf, login_form_ready: login, search_form_ready: search, logged_in: search, available_carriers: carriers, error_message: err, captcha_image: cap, captcha_auto_filled: null, captcha_confidence: 0 };"
            + "})()";
        return session.evaluateJson(script);
    }

    private static void submitLogin(BrowserSession session, String mobilePhone, String password, String captchaCode) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("mobilePhone", mobilePhone);
        payload.put("password", password);
        payload.put("captchaCode", captchaCode);
        String script = ""
            + "(() => {"
            + "const p = " + payload.toString() + ";"
            + "const set = (sel, value) => { const el = document.querySelector(sel); if (!el) return false; el.focus(); el.value = value; ['input','change','blur'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true }))); return true; };"
            + "set('#mobile_phone', p.mobilePhone); set('#password', p.password); set('#captcha', p.captchaCode);"
            + "const btn = document.querySelector('#submitBtn') || document.querySelector('button[type=submit], input[type=submit]');"
            + "if (!btn) return { ok: false, reason: 'invoice_carrier_login_trigger_missing' };"
            + "btn.click();"
            + "return { ok: true };"
            + "})()";
        JSONObject result = session.evaluateJson(script);
        if (!result.optBoolean("ok", false)) {
            throw new BankAutomationException(result.optString("reason", "invoice_carrier_login_trigger_missing"), "電子發票登入按鈕不可用");
        }
        sleep(1_800L);
    }

    private static void submitSearch(BrowserSession session, String startDate, String endDate, String carrierCode) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("dateLabel", formatDateRangeLabel(startDate, endDate));
        payload.put("carrierCode", carrierCode);
        String script = ""
            + "(() => {"
            + "const p = " + payload.toString() + ";"
            + "const dateInput = document.querySelector('#dp-input-searchInvoiceDate');"
            + "if (dateInput) { dateInput.removeAttribute('readonly'); dateInput.value = p.dateLabel; ['input','change','blur'].forEach(e => dateInput.dispatchEvent(new Event(e, { bubbles: true }))); }"
            + "const carrier = document.querySelector('#carrier'); if (carrier && p.carrierCode) { carrier.value = p.carrierCode; carrier.dispatchEvent(new Event('change', { bubbles: true })); }"
            + "const status = document.querySelector('#status'); if (status && !status.value) { status.value = 'all'; status.dispatchEvent(new Event('change', { bubbles: true })); }"
            + "const btn = document.querySelector('button[title=\\\"查詢\\\"], button[aria-label=\\\"查詢\\\"]');"
            + "if (!btn) return { ok: false, reason: 'invoice_carrier_search_button_not_found' };"
            + "btn.click(); return { ok: true };"
            + "})()";
        JSONObject result = session.evaluateJson(script);
        if (!result.optBoolean("ok", false)) {
            throw new BankAutomationException(result.optString("reason", "invoice_carrier_search_failed"), "電子發票查詢失敗");
        }
        sleep(2_000L);
    }

    private static JSONArray extractInvoices(BrowserSession session) throws Exception {
        JSONObject response = session.evaluateJson(""
            + "(() => {"
            + "const rows = Array.from(document.querySelectorAll('table tbody tr'));"
            + "const invoices = []; let current = null;"
            + "for (const row of rows) {"
            + " const cells = Array.from(row.querySelectorAll('td')); if (!cells.length) continue;"
            + " const link = row.querySelector('a[title], td[data-title=\\\"發票號碼\\\"] a');"
            + " const checkbox = row.querySelector('input[type=\\\"checkbox\\\"][aria-label=\\\"選擇\\\"], input[id^=\\\"all_\\\"]');"
            + " const no = String((link && (link.getAttribute('title') || link.textContent)) || '').trim();"
            + " if (no && checkbox) { current = { invoice_number: no, carrier_label: String(cells[1] && cells[1].textContent || '').replace(/\\s+/g, ' ').trim(), amount: String(cells[3] && cells[3].textContent || '').replace(/[^0-9-]/g, ''), invoice_date: String(cells[4] && cells[4].textContent || '').replace(/\\s+/g, ' ').trim(), seller_name: '' }; invoices.push(current); continue; }"
            + " if (!current) continue;"
            + " const seller = cells.map(c => String(c.textContent || '').replace(/\\s+/g, ' ').trim()).find(Boolean);"
            + " if (seller) { current.seller_name = seller; current = null; }"
            + "}"
            + "return { ok: true, invoices };"
            + "})()");
        JSONArray raw = response.optJSONArray("invoices");
        JSONArray normalized = new JSONArray();
        if (raw == null) return normalized;
        for (int index = 0; index < raw.length(); index += 1) {
            JSONObject item = raw.optJSONObject(index);
            if (item == null) continue;
            String invoiceNumber = normalizeText(item.optString("invoice_number"));
            String invoiceDate = parseInvoiceDateText(item.optString("invoice_date"));
            if (invoiceNumber.isEmpty() || invoiceDate.isEmpty()) continue;
            JSONObject next = new JSONObject();
            next.put("invoice_number", invoiceNumber);
            next.put("invoice_date", invoiceDate);
            next.put("seller_name", normalizeText(item.optString("seller_name")));
            next.put("amount", Math.max(0, item.optInt("amount", 0)));
            next.put("carrier_label", normalizeText(item.optString("carrier_label")));
            normalized.put(next);
        }
        return normalized;
    }

    private static String createProviderConnectionId(String mobilePhone) {
        return "einv_provider_" + simpleHash(PROVIDER_ID + ":" + normalizeText(mobilePhone));
    }

    static String simpleHash(String value) {
        long hash = 0L;
        String text = value == null ? "" : value;
        for (int index = 0; index < text.length(); index += 1) {
            hash = ((hash << 5) - hash) + text.charAt(index);
            hash &= 0xffffffffL;
        }
        return Long.toString(hash, 36);
    }

    private static String requireText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        String value = normalizeText(payload.optString(key));
        if (value.isEmpty()) throw new BankAutomationException(code, message);
        return value;
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String nowIso() {
        return java.time.Instant.now().toString();
    }

    private static void sleep(long ms) throws InterruptedException {
        Thread.sleep(ms);
    }

    private static DateRange defaultDateRange() {
        LocalDate today = LocalDate.now(TAIPEI_ZONE);
        return new DateRange(today.minusMonths(2).format(DATE_FORMAT), today.format(DATE_FORMAT));
    }

    private static String parseDate(String value, String fallback) {
        String parsed = parseInvoiceDateText(value);
        return parsed.isEmpty() ? fallback : parsed;
    }

    private static String parseInvoiceDateText(String value) {
        String text = normalizeText(value);
        if (text.matches("^\\d{4}-\\d{2}-\\d{2}$")) return text;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("^(\\d{4})年(\\d{1,2})月(\\d{1,2})日$").matcher(text);
        if (!matcher.matches()) return "";
        String month = matcher.group(2).length() == 1 ? "0" + matcher.group(2) : matcher.group(2);
        String day = matcher.group(3).length() == 1 ? "0" + matcher.group(3) : matcher.group(3);
        return matcher.group(1) + "-" + month + "-" + day;
    }

    private static String formatDateRangeLabel(String startDate, String endDate) {
        String[] start = startDate.split("-");
        String[] end = endDate.split("-");
        if (start.length != 3 || end.length != 3) return "";
        return Integer.parseInt(start[0]) + "年" + Integer.parseInt(start[1]) + "月" + Integer.parseInt(start[2]) + "日 ~ "
            + Integer.parseInt(end[0]) + "年" + Integer.parseInt(end[1]) + "月" + Integer.parseInt(end[2]) + "日";
    }

    private static final class DateRange {
        final String startDate;
        final String endDate;

        DateRange(String startDate, String endDate) {
            this.startDate = startDate;
            this.endDate = endDate;
        }
    }

    private static final class BrowserSession {
        private final Activity activity;
        private final WebView webView;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final CookieManager cookieManager = CookieManager.getInstance();
        private final AtomicBoolean pageFinished = new AtomicBoolean(false);

        BrowserSession(Activity activity, WebView webView) throws BankAutomationException {
            this.activity = activity;
            this.webView = webView;
            installWebViewClient();
        }

        private void installWebViewClient() throws BankAutomationException {
            runOnUiThreadAndWait(() -> webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return false;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    pageFinished.set(true);
                }
            }));
        }

        void loadUrl(String url) throws Exception {
            pageFinished.set(false);
            CountDownLatch latch = new CountDownLatch(1);
            runOnUiThreadAndWait(() -> {
                webView.loadUrl(url);
                latch.countDown();
            });
            awaitLatch(latch, 3, "invoice_carrier_navigation_start_timeout", "電子發票頁面載入啟動逾時");
            long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
            while (System.currentTimeMillis() < deadline) {
                if (pageFinished.get()) {
                    sleep(500L);
                    return;
                }
                sleep(100L);
            }
        }

        JSONObject evaluateJson(String script) throws Exception {
            AtomicReference<String> resultRef = new AtomicReference<>("");
            CountDownLatch latch = new CountDownLatch(1);
            runOnUiThreadAndWait(() -> webView.evaluateJavascript(script, new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    resultRef.set(value == null ? "" : value);
                    latch.countDown();
                }
            }));
            awaitLatch(latch, 8, "invoice_carrier_script_timeout", "電子發票頁面腳本執行逾時");
            Object parsed = parseEvaluateResult(resultRef.get());
            if (parsed instanceof JSONObject) return (JSONObject) parsed;
            JSONObject wrapped = new JSONObject();
            wrapped.put("ok", false);
            wrapped.put("value", parsed == null ? JSONObject.NULL : parsed);
            return wrapped;
        }

        String captureCookies() throws BankAutomationException {
            String loginCookies = callOnUiThreadAndWait(() -> cookieManager.getCookie(LOGIN_URL));
            String searchCookies = callOnUiThreadAndWait(() -> cookieManager.getCookie(SEARCH_URL));
            if (loginCookies != null && !loginCookies.trim().isEmpty()) return loginCookies.trim();
            return searchCookies == null ? "" : searchCookies.trim();
        }

        void restoreCookies(String cookieHeader) throws Exception {
            String header = normalizeText(cookieHeader);
            if (header.isEmpty()) return;
            String[] cookies = header.split(";");
            for (String cookie : cookies) {
                String normalized = cookie.trim();
                if (normalized.isEmpty()) continue;
                CountDownLatch latch = callOnUiThreadAndWait(() -> {
                    CountDownLatch innerLatch = new CountDownLatch(1);
                    cookieManager.setCookie("https://www.einvoice.nat.gov.tw", normalized, value -> innerLatch.countDown());
                    return innerLatch;
                });
                awaitLatch(latch, 5, "invoice_carrier_cookie_set_timeout", "電子發票 cookie 寫入逾時");
            }
            runOnUiThreadAndWait(cookieManager::flush);
        }

        private Object parseEvaluateResult(String raw) throws JSONException {
            String text = raw == null ? "" : raw.trim();
            if (text.isEmpty() || "null".equals(text)) return null;
            Object value = new JSONTokener(text).nextValue();
            if (value instanceof String) {
                String nested = ((String) value).trim();
                if ((nested.startsWith("{") && nested.endsWith("}")) || (nested.startsWith("[") && nested.endsWith("]"))) {
                    return new JSONTokener(nested).nextValue();
                }
            }
            return value;
        }

        private void awaitLatch(CountDownLatch latch, int seconds, String code, String message) throws BankAutomationException {
            try {
                if (!latch.await(seconds, TimeUnit.SECONDS)) {
                    throw new BankAutomationException(code, message);
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new BankAutomationException(code, message);
            }
        }

        private void runOnUiThreadAndWait(Runnable runnable) throws BankAutomationException {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<Exception> errorRef = new AtomicReference<>(null);
            mainHandler.post(() -> {
                try {
                    runnable.run();
                } catch (Exception error) {
                    errorRef.set(error);
                } finally {
                    latch.countDown();
                }
            });
            awaitLatch(latch, 20, "invoice_carrier_ui_thread_timeout", "電子發票 UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("invoice_carrier_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
            }
        }

        private <T> T callOnUiThreadAndWait(UiThreadSupplier<T> supplier) throws BankAutomationException {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<T> resultRef = new AtomicReference<>(null);
            AtomicReference<Exception> errorRef = new AtomicReference<>(null);
            mainHandler.post(() -> {
                try {
                    resultRef.set(supplier.get());
                } catch (Exception error) {
                    errorRef.set(error);
                } finally {
                    latch.countDown();
                }
            });
            awaitLatch(latch, 20, "invoice_carrier_ui_thread_timeout", "電子發票 UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("invoice_carrier_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
            }
            return resultRef.get();
        }

        @FunctionalInterface
        private interface UiThreadSupplier<T> {
            T get() throws Exception;
        }
    }
}
