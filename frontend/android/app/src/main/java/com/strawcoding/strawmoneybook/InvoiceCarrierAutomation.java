package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class InvoiceCarrierAutomation {
    private static final String PROVIDER_ID = "einvoice_tw";
    private static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login";
    private static final String SEARCH_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search";
    private static final String DETAIL_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/detail";
    private static final long PAGE_TIMEOUT_MS = 30_000L;
    private static final long READY_TIMEOUT_MS = 90_000L;
    private static final long POLL_MS = 400L;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US);
    private static final int CAPTCHA_LENGTH = 4;
    private static final int MAX_LOGIN_ATTEMPTS = 5;

    private InvoiceCarrierAutomation() {}

    public static JSONObject connect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String mobilePhone = requireText(payload, "mobile_phone", "invoice_carrier_credentials_required", "缺少手機號碼");
        String password = requireText(payload, "password", "invoice_carrier_credentials_required", "缺少密碼");
        String connectionId = createProviderConnectionId(mobilePhone);

        for (int attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt++) {
            debugTrace.record("connect_attempt", "running", "eInvoice connect attempt " + (attempt + 1) + "/" + MAX_LOGIN_ATTEMPTS);

            BrowserSession session = new BrowserSession(activity, webView);
            session.loadUrl(LOGIN_URL);
            JSONObject status = waitForInteractiveStatus(session, debugTrace, true);

            if (status.optBoolean("cloudflare_blocked", false)) {
                throw new BankAutomationException("invoice_carrier_automation_blocked", "電子發票網站目前阻擋登入流程，請稍後再試");
            }
            if (status.optBoolean("search_form_ready", false)) {
                debugTrace.record("connect_success", "ok", "Already authenticated, building result");
                return buildConnectSuccessResult(connectionId, mobilePhone, password, session, status, vault);
            }
            if (!status.optBoolean("login_form_ready", false)) {
                debugTrace.record("connect_attempt", "warn", "Login form not ready on attempt " + (attempt + 1));
                sleep(POLL_MS);
                continue;
            }

            String captchaDataUrl = normalizeText(status.optString("captcha_image"));
            String captchaCode = recognizeCaptchaOcr(activity, debugTrace, attempt, captchaDataUrl);

            if (captchaCode.length() != CAPTCHA_LENGTH) {
                debugTrace.record("connect_attempt", "warn", "captcha_ocr failed, refreshing on attempt " + (attempt + 1));
                refreshCaptchaImage(session, debugTrace);
                JSONObject refreshedStatus = waitForInteractiveStatus(session, debugTrace, true);
                String refreshedDataUrl = normalizeText(refreshedStatus.optString("captcha_image"));
                captchaCode = recognizeCaptchaOcr(activity, debugTrace, attempt, refreshedDataUrl);
            }

            if (captchaCode.length() != CAPTCHA_LENGTH) {
                debugTrace.record("connect_attempt", "warn", "captcha_ocr still failed after refresh on attempt " + (attempt + 1));
                continue;
            }

            submitLogin(session, mobilePhone, password, captchaCode);
            JSONObject afterStatus = waitForSearchStatus(session, debugTrace);

            if (afterStatus.optBoolean("search_form_ready", false)) {
                debugTrace.record("connect_success", "ok", "eInvoice connect succeeded on attempt " + (attempt + 1));
                return buildConnectSuccessResult(connectionId, mobilePhone, password, session, afterStatus, vault);
            }

            String errorMessage = normalizeText(afterStatus.optString("error_message"));
            debugTrace.record("connect_attempt", "warn", "Login failed on attempt " + (attempt + 1) + ": " + errorMessage);
            if (!errorMessage.isEmpty() && isCredentialError(errorMessage)) {
                throw new BankAutomationException("invoice_carrier_login_failed", errorMessage);
            }
        }

        throw new BankAutomationException("invoice_carrier_captcha_ocr_failed", "電子發票圖形驗證碼自動辨識失敗，請稍後再試");
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
            if (status.optBoolean("cloudflare_blocked", false)) {
                throw new BankAutomationException("invoice_carrier_automation_blocked", "電子發票網站目前阻擋同步流程，請稍後再試");
            }
            debugTrace.record("manual_reauth_required", "warn", "eInvoice session expired; re-authentication is required", status);
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

    private static JSONObject buildConnectSuccessResult(String connectionId, String mobilePhone, String password, BrowserSession session, JSONObject searchStatus, BankAutomationVault vault) throws Exception {
        JSONArray carriers = searchStatus.optJSONArray("available_carriers") == null ? new JSONArray() : searchStatus.optJSONArray("available_carriers");

        JSONObject persistedState = new JSONObject();
        persistedState.put("provider", PROVIDER_ID);
        persistedState.put("connectionId", connectionId);
        persistedState.put("mobilePhone", mobilePhone);
        persistedState.put("password", password);
        persistedState.put("cookieHeader", session.captureCookies());
        persistedState.put("carrierOptions", carriers);
        persistedState.put("updatedAt", nowIso());
        vault.saveConnectionState(connectionId, persistedState);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("mobile_phone", mobilePhone);
        result.put("provider_connection_id", connectionId);
        result.put("storage_state", buildNativeStorageState(connectionId));
        result.put("available_carriers", carriers);
        result.put("authenticated_at", nowIso());
        return result;
    }

    private static String recognizeCaptchaOcr(Activity activity, BankAutomationDebugTrace debugTrace, int attempt, String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return "";
        try {
            Bitmap source = decodeCaptchaBitmap(dataUrl);
            if (source == null) return "";
            List<Bitmap> variants = buildCaptchaVariants(source);
            List<TesseractBridge.RecognitionCandidate> candidates = TesseractBridge.recognizeCaptchaCandidates(activity, variants, true);
            String best = selectBestNumericCaptcha(candidates);
            debugTrace.record("captcha_ocr", best.length() == CAPTCHA_LENGTH ? "ok" : "warn",
                "captcha_ocr attempt=" + (attempt + 1) + " result_length=" + best.length());
            return best;
        } catch (Throwable error) {
            debugTrace.record("captcha_ocr", "error", "captcha_ocr exception: " + (error.getMessage() == null ? "unknown" : error.getMessage()));
            return "";
        }
    }

    private static Bitmap decodeCaptchaBitmap(String dataUrl) {
        String base64 = dataUrl.contains(",") ? dataUrl.substring(dataUrl.indexOf(',') + 1) : dataUrl;
        byte[] bytes = Base64.decode(base64.trim(), Base64.DEFAULT);
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    }

    private static List<Bitmap> buildCaptchaVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        variants.add(source);
        variants.add(Bitmap.createScaledBitmap(source, source.getWidth() * 2, source.getHeight() * 2, true));
        variants.add(Bitmap.createScaledBitmap(source, source.getWidth() * 3, source.getHeight() * 3, true));
        return variants;
    }

    private static String selectBestNumericCaptcha(List<TesseractBridge.RecognitionCandidate> candidates) {
        String best = "";
        int bestConfidence = 0;
        for (TesseractBridge.RecognitionCandidate candidate : candidates) {
            String text = normalizeNumericCaptcha(candidate.text);
            if (text.length() == CAPTCHA_LENGTH && candidate.confidence > bestConfidence) {
                best = text;
                bestConfidence = candidate.confidence;
            }
        }
        return best;
    }

    private static String normalizeNumericCaptcha(String value) {
        if (value == null) return "";
        StringBuilder builder = new StringBuilder();
        for (char c : value.toCharArray()) {
            if (c >= '0' && c <= '9') builder.append(c);
        }
        return builder.toString();
    }

    private static boolean isCredentialError(String errorMessage) {
        return errorMessage.contains("手機號碼") || errorMessage.contains("密碼")
            || errorMessage.contains("已停用") || errorMessage.contains("停止");
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

    private static JSONObject waitForInteractiveStatus(BrowserSession session, BankAutomationDebugTrace debugTrace, boolean includeCaptcha) throws Exception {
        long deadline = System.currentTimeMillis() + READY_TIMEOUT_MS;
        JSONObject latest = new JSONObject();
        while (System.currentTimeMillis() < deadline) {
            latest = inspectStatus(session, includeCaptcha);
            boolean loginReady = latest.optBoolean("login_form_ready", false);
            boolean captchaReady = !includeCaptcha || !loginReady || !normalizeText(latest.optString("captcha_image")).isEmpty();
            if (
                (loginReady && captchaReady)
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
            + "return { ok: true, url: location.href, title, cloudflare_blocked: cf, login_form_ready: login, search_form_ready: search, logged_in: search, available_carriers: carriers, error_message: err, captcha_image: cap };"
            + "})()";
        return session.evaluateJson(script);
    }

    private static void refreshCaptchaImage(BrowserSession session, BankAutomationDebugTrace debugTrace) throws Exception {
        JSONObject result = session.evaluateJson(""
            + "(() => {"
            + "const btn = document.querySelector('button[aria-label=\\\"更新圖形驗證碼\\\"], button[title=\\\"更新圖形驗證碼\\\"]');"
            + "if (!btn) return { ok: false, reason: 'invoice_carrier_captcha_refresh_missing' };"
            + "btn.click();"
            + "return { ok: true };"
            + "})()");
        if (!result.optBoolean("ok", false)) {
            debugTrace.record("captcha_refresh", "warn", result.optString("reason", "invoice_carrier_captcha_refresh_missing"), result);
            return;
        }
        debugTrace.record("captcha_refresh", "ok", "eInvoice captcha refresh triggered");
        sleep(800L);
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
        waitForSearchResultPage(session);
    }

    private static void waitForSearchResultPage(BrowserSession session) throws Exception {
        long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
        JSONObject latest = new JSONObject();
        while (System.currentTimeMillis() < deadline) {
            latest = session.evaluateJson(""
                + "(() => {"
                + "const text = String(document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim();"
                + "const hasRows = Boolean(document.querySelector('table tbody tr'));"
                + "const noResult = text.includes('查無') || text.includes('無資料') || text.includes('沒有符合');"
                + "const detail = location.href.includes('/detail');"
                + "return { ok: true, detail, hasRows, noResult, url: location.href };"
                + "})()");
            if (
                latest.optBoolean("detail", false)
                || latest.optBoolean("hasRows", false)
                || latest.optBoolean("noResult", false)
            ) {
                return;
            }
            sleep(POLL_MS);
        }
        throw new BankAutomationException(
            "invoice_carrier_search_timeout",
            "電子發票查詢結果載入逾時"
        );
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
