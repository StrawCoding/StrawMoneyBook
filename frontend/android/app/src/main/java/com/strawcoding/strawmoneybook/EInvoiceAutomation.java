package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

final class EInvoiceAutomation {
    private static final String TAG = "EInvoiceAutomation";
    static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login";
    static final String QUERY_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search";

    private static final String PLATFORM_CHALLENGE_CODE = "einvoice_platform_challenge";
    private static final String PLATFORM_CHALLENGE_MESSAGE =
        "電子發票平台目前擋下內嵌自動化連線，請改用官方 API/後端串接後再啟用自動抓取";
    static final int OCR_MAX_ATTEMPTS = 2;
    static final int CAPTCHA_EXPECTED_LENGTH = 4;
    private static final long CAPTCHA_POLL_MS = 300L;
    private static final long CAPTCHA_READY_TIMEOUT_MS = 15_000L;
    static final long AUTO_LOGIN_WAIT_MS = 12_000L;
    static final long MANUAL_LOGIN_WAIT_MS = 90_000L;
    static final long QUERY_FORM_WAIT_MS = 10_000L;
    static final long QUERY_FORM_POLL_MS = 500L;
    private static final long LOGIN_DETECT_POLL_MS = 600L;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter ROC_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.US);

    private EInvoiceAutomation() {}

    static final class EInvoiceException extends Exception {
        private final String code;

        EInvoiceException(String code, String message) {
            super(message == null ? "" : message.trim());
            this.code = code == null ? "einvoice_error" : code.trim();
        }

        String getCode() { return code; }
    }

    // ── Entry point ────────────────────────────────────────────────────────────

    static JSONObject query(Activity activity, WebView webView, JSONObject params) throws Exception {
        return query(activity, webView, params, null);
    }

    static JSONObject query(Activity activity, WebView webView, JSONObject params, Consumer<String> statusUpdater) throws Exception {
        String phone = requireText(params, "phone", "einvoice_phone_required", "手機號碼為必填");
        String password = requireText(params, "password", "einvoice_password_required", "密碼為必填");
        String dateFrom = requireText(params, "dateFrom", "einvoice_date_required", "查詢起始日期為必填");
        String dateTo = requireText(params, "dateTo", "einvoice_date_required", "查詢結束日期為必填");
        String invoiceStatus = normalizeText(params.optString("invoiceStatus", "all"));
        String buyerTaxId = normalizeText(params.optString("buyerTaxId", ""));
        String keyword = normalizeText(params.optString("keyword", ""));

        BrowserSession session = new BrowserSession(activity, webView, statusUpdater);
        session.setStatus("正在開啟電子發票平台…");
        Log.d(TAG, "Loading login page");
        session.loadUrl(LOGIN_URL);
        assertPlatformAllowsAutomation(session, "login");

        performLogin(activity, session, phone, password);
        Log.d(TAG, "Login succeeded");

        session.setStatus("登入成功，正在抓取發票…");
        JSONArray invoices = fetchInvoices(session, dateFrom, dateTo, invoiceStatus, buyerTaxId, keyword);
        Log.d(TAG, "Fetched invoices count=" + invoices.length());
        session.setStatus("已抓取 " + invoices.length() + " 張發票，正在回傳結果…");

        JSONObject result = new JSONObject();
        result.put("invoices", invoices);
        return result;
    }

    // ── Login ──────────────────────────────────────────────────────────────────

    private static void performLogin(Activity activity, BrowserSession session, String phone, String password) throws Exception {
        // SMB-174 redesign: hybrid auto/manual login flow. Stages:
        //   1. Auto-select 手機條碼 carrier and wait for the login form to be ready.
        //   2. Auto-fill phone+password (without submitting) so users can confirm the credentials.
        //   3. Try OCR + auto-submit up to OCR_MAX_ATTEMPTS times (login can succeed without user help).
        //   4. If OCR/auto-submit fails, fall back to MANUAL mode: refresh captcha, focus the
        //      captcha input, prompt the user via the status bar to type it themselves and click
        //      the platform's login button. We watch for the URL to leave /accounts/login and
        //      then continue the scrape automatically. This guarantees the flow can complete
        //      even when OCR is unreliable or the captcha format changes.
        session.setStatus("選取手機條碼載具…");
        JSONObject carrierSnapshot = selectMobileCarrier(session);
        waitForMobileCarrierLoginFormStable(session, carrierSnapshot);

        session.setStatus("自動填入帳號與密碼…");
        Object fillResult = session.evaluateJavaScript(buildFillCredentialsOnlyScript(phone, password));
        if (!isFillCredentialsResultSuccess(fillResult)) {
            throw new EInvoiceException(
                "einvoice_login_form_missing",
                describeFillCredentialsFailure(fillResult, carrierSnapshot)
            );
        }

        int captchaImageMissing = 0;
        int captchaOcrFailed = 0;
        int submitAttempted = 0;
        String lastPageError = "";

        for (int attempt = 0; attempt < OCR_MAX_ATTEMPTS; attempt++) {
            session.setStatus("自動辨識驗證碼…（嘗試 " + (attempt + 1) + "/" + OCR_MAX_ATTEMPTS + "）");
            if (attempt > 0) {
                session.evaluateJavaScript(buildRefreshCaptchaScript());
                Thread.sleep(800L);
                // Phone/password may have been cleared by the failed submit — re-fill defensively.
                session.evaluateJavaScript(buildFillCredentialsOnlyScript(phone, password));
            }

            String captchaDataUrl = waitForCaptchaReady(session);
            if (captchaDataUrl.isEmpty()) {
                captchaImageMissing++;
                Log.d(TAG, "Captcha not ready on attempt " + (attempt + 1));
                continue;
            }

            String captchaText = recognizeNumericCaptcha(activity, captchaDataUrl);
            if (captchaText.length() != CAPTCHA_EXPECTED_LENGTH) {
                captchaOcrFailed++;
                Log.d(TAG, "Captcha OCR result invalid length=" + captchaText.length() + " attempt=" + (attempt + 1));
                continue;
            }

            session.setStatus("送出登入請求…");
            Log.d(TAG, "Submitting login attempt=" + (attempt + 1));
            Object submitResult = session.evaluateJavaScript(buildSubmitLoginScript(phone, password, captchaText));
            if (!isSubmitLoginResultSuccess(submitResult)) {
                throw new EInvoiceException("einvoice_login_form_missing", describeSubmitLoginFailure(submitResult, carrierSnapshot));
            }
            submitAttempted++;

            if (waitForLoginSuccess(session, AUTO_LOGIN_WAIT_MS)) {
                return;
            }

            String pageError = capturePageErrorDetail(session);
            if (!pageError.isEmpty()) lastPageError = pageError;
            Log.d(TAG, "Auto-login failed attempt=" + (attempt + 1) + " pageError=" + pageError);
        }

        // Auto path exhausted — switch to MANUAL captcha mode. The WebView is fully visible
        // (alpha=1.0) so the user can read the captcha image directly, type into the focused
        // input, and click the platform's own login button. We just watch for URL change.
        session.setStatus("驗證碼自動辨識失敗，請看下方驗證碼，輸入後按登入按鈕");
        session.evaluateJavaScript(buildRefreshCaptchaScript());
        Thread.sleep(400L);
        session.evaluateJavaScript(buildFillCredentialsOnlyScript(phone, password));
        session.evaluateJavaScript(buildClearCaptchaInputScript());
        session.evaluateJavaScript(buildFocusCaptchaInputScript());

        if (waitForLoginSuccess(session, MANUAL_LOGIN_WAIT_MS)) {
            return;
        }

        String pageError = capturePageErrorDetail(session);
        if (!pageError.isEmpty()) lastPageError = pageError;
        throw classifyLoginFailure(captchaImageMissing, captchaOcrFailed, submitAttempted, lastPageError);
    }

    static EInvoiceException classifyLoginFailure(int captchaImageMissing, int captchaOcrFailed, int submitAttempted, String lastPageError) {
        // Differentiated diagnosis: pick the dominant blocker so users see a meaningful error.
        if (submitAttempted == 0 && captchaImageMissing >= OCR_MAX_ATTEMPTS) {
            return new EInvoiceException("einvoice_captcha_image_missing",
                "驗證碼圖片無法載入，平台可能要求額外驗證或圖片格式變更");
        }
        if (submitAttempted == 0 && captchaOcrFailed > 0) {
            return new EInvoiceException("einvoice_captcha_recognition_failed",
                "驗證碼自動辨識失敗（連續 " + captchaOcrFailed + " 次無法取得 4 位數字），請稍後再試或回報技術人員");
        }
        String message = "電子發票平台登入失敗，請確認手機號碼、密碼及驗證碼是否正確";
        if (lastPageError != null && !lastPageError.isEmpty()) {
            message += "（網站回應：" + lastPageError + "）";
        }
        return new EInvoiceException("einvoice_login_failed", message);
    }

    private static String capturePageErrorDetail(BrowserSession session) throws Exception {
        Object result = session.evaluateJavaScript(buildPageErrorDetailScript());
        if (result instanceof JSONObject) {
            return normalizeText(((JSONObject) result).optString("text", ""));
        }
        return "";
    }

    private static JSONObject selectMobileCarrier(BrowserSession session) throws Exception {
        Object result = session.evaluateJavaScript(buildSelectMobileCarrierScript());
        JSONObject snapshot = result instanceof JSONObject ? (JSONObject) result : new JSONObject().put("selected", Boolean.TRUE.equals(result));
        Log.d(TAG, "Mobile carrier selection snapshot=" + snapshot);
        return snapshot;
    }

    private static void waitForMobileCarrierLoginFormStable(BrowserSession session, JSONObject carrierSnapshot) throws Exception {
        long deadline = System.currentTimeMillis() + 8_000L;
        JSONObject lastSnapshot = null;
        while (System.currentTimeMillis() < deadline) {
            Object result = session.evaluateJavaScript(buildLoginFormSnapshotScript());
            if (result instanceof JSONObject) {
                lastSnapshot = (JSONObject) result;
                if (
                    lastSnapshot.optBoolean("mobileFieldVisible", false) ||
                    (lastSnapshot.optBoolean("passwordFieldVisible", false) && lastSnapshot.optBoolean("captchaVisible", false))
                ) {
                    Log.d(TAG, "Login form ready carrier=" + carrierSnapshot + " form=" + lastSnapshot);
                    return;
                }
            }
            Thread.sleep(300L);
        }
        Log.w(TAG, "Login form did not fully stabilize carrier=" + carrierSnapshot + " form=" + lastSnapshot);
        boolean partiallyVisible = lastSnapshot != null && (
            lastSnapshot.optBoolean("passwordFieldVisible", false) ||
            lastSnapshot.optBoolean("captchaVisible", false)
        );
        if (!partiallyVisible) {
            throw new EInvoiceException(
                "einvoice_login_form_missing",
                "選取手機條碼後等待 8 秒，登入表單未出現。" +
                " 載具選取結果: " + carrierSnapshot +
                " 表單快照: " + lastSnapshot
            );
        }
        // 表單部分可見，給予額外 2 秒讓動畫完成
        Thread.sleep(2_000L);
    }

    private static boolean isSubmitLoginResultSuccess(Object result) {
        if (Boolean.TRUE.equals(result)) return true;
        if (!(result instanceof JSONObject)) return false;
        return ((JSONObject) result).optBoolean("submitted", false);
    }

    private static String describeSubmitLoginFailure(Object result, JSONObject carrierSnapshot) {
        if (result instanceof JSONObject) {
            JSONObject snapshot = (JSONObject) result;
            String reason = normalizeText(snapshot.optString("reason", ""));
            String missing = normalizeText(snapshot.optString("missing", ""));
            String carrier = String.valueOf(snapshot.opt("carrier"));
            String detail = reason.isEmpty() ? "找不到登入表單" : "找不到登入表單: " + reason;
            if (!missing.isEmpty()) detail += " (" + missing + ")";
            if (!carrier.isEmpty() && !"null".equals(carrier)) detail += " carrier=" + carrier;
            return detail;
        }
        return "找不到登入表單，載具選取結果: " + String.valueOf(carrierSnapshot);
    }

    private static String waitForCaptchaReady(BrowserSession session) throws Exception {
        long deadline = System.currentTimeMillis() + CAPTCHA_READY_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            Object result = session.evaluateJavaScript(buildCaptchaSnapshotScript());
            if (result instanceof JSONObject) {
                JSONObject snapshot = (JSONObject) result;
                if (snapshot.optBoolean("ready", false)) {
                    String dataUrl = normalizeText(snapshot.optString("dataUrl", ""));
                    if (!dataUrl.isEmpty()) return dataUrl;

                    JSONObject rect = snapshot.optJSONObject("rect");
                    if (rect != null) {
                        String captured = session.captureVisibleRegionDataUrl(
                            (float) rect.optDouble("left", 0),
                            (float) rect.optDouble("top", 0),
                            (float) rect.optDouble("width", 0),
                            (float) rect.optDouble("height", 0)
                        );
                        if (!captured.isEmpty()) return captured;
                    }
                }
            }
            Thread.sleep(CAPTCHA_POLL_MS);
        }
        return "";
    }

    private static boolean waitForLoginSuccess(BrowserSession session, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            boolean onLoginPage = Boolean.TRUE.equals(session.evaluateJavaScript(buildLoginPageDetectScript()));
            if (!onLoginPage) {
                return true;
            }
            Thread.sleep(LOGIN_DETECT_POLL_MS);
        }
        return false;
    }

    static boolean isFillCredentialsResultSuccess(Object result) {
        if (Boolean.TRUE.equals(result)) return true;
        if (!(result instanceof JSONObject)) return false;
        return ((JSONObject) result).optBoolean("filled", false);
    }

    private static String describeFillCredentialsFailure(Object result, JSONObject carrierSnapshot) {
        if (result instanceof JSONObject) {
            JSONObject snapshot = (JSONObject) result;
            String reason = normalizeText(snapshot.optString("reason", ""));
            String missing = normalizeText(snapshot.optString("missing", ""));
            JSONObject formDiag = snapshot.optJSONObject("formDiag");
            String url = formDiag != null ? normalizeText(formDiag.optString("url", "")) : "";
            String detail = reason.isEmpty() ? "找不到帳號或密碼欄位" : "找不到帳號或密碼欄位: " + reason;
            if (!missing.isEmpty()) detail += " (" + missing + ")";
            if (!url.isEmpty()) detail += " url=" + url;
            return detail;
        }
        return "找不到帳號或密碼欄位，載具選取結果: " + String.valueOf(carrierSnapshot);
    }

    // ── Invoice query ──────────────────────────────────────────────────────────

    private static JSONArray fetchInvoices(BrowserSession session, String dateFrom, String dateTo, String invoiceStatus, String buyerTaxId, String keyword) throws Exception {
        // Navigate to query page
        session.loadUrl(QUERY_URL);
        assertPlatformAllowsAutomation(session, "query");

        // Fill query form and submit
        String rocDateFrom = toRocDate(dateFrom);
        String rocDateTo = toRocDate(dateTo);
        boolean formFilled = waitForQueryFormAndSubmit(session, rocDateFrom, rocDateTo, invoiceStatus, buyerTaxId, keyword);
        if (!formFilled) {
            throw new EInvoiceException("einvoice_query_form_missing", describeQueryFormMissing(session));
        }

        // Wait for results
        long deadline = System.currentTimeMillis() + 30_000L;
        boolean resultsReady = false;
        while (System.currentTimeMillis() < deadline) {
            Boolean hasResults = (Boolean) session.evaluateJavaScript(buildWaitForResultsScript());
            if (Boolean.TRUE.equals(hasResults)) {
                resultsReady = true;
                break;
            }
            Thread.sleep(500L);
        }
        if (!resultsReady) {
            Object pageSnap = session.evaluateJavaScript(
                "(() => { try { return { url: String(location.href||''), title: String(document.title||'') }; } catch(_) { return null; } })()"
            );
            String diagUrl = pageSnap instanceof JSONObject ? ((JSONObject) pageSnap).optString("url", "") : "";
            String diagTitle = pageSnap instanceof JSONObject ? ((JSONObject) pageSnap).optString("title", "") : "";
            Log.w(TAG, "waitForResults timeout url=" + diagUrl + " title=" + diagTitle);
            throw new EInvoiceException(
                "einvoice_query_results_timeout",
                "等待發票查詢結果逾時（30 秒）。" +
                (diagUrl.isEmpty() ? "" : " 目前頁面: " + diagUrl) +
                (diagTitle.isEmpty() ? "" : " 標題: " + diagTitle)
            );
        }

        // Parse results - may span multiple pages
        JSONArray allInvoices = new JSONArray();
        int pageIndex = 0;
        int maxPages = 20;
        while (pageIndex < maxPages) {
            Object parsed = session.evaluateJavaScript(buildParseInvoiceListScript());
            if (parsed instanceof JSONObject) {
                JSONObject pageResult = (JSONObject) parsed;
                JSONArray pageInvoices = pageResult.optJSONArray("invoices");
                if (pageInvoices != null) {
                    for (int i = 0; i < pageInvoices.length(); i++) {
                        allInvoices.put(pageInvoices.getJSONObject(i));
                    }
                }
                boolean hasNextPage = pageResult.optBoolean("hasNextPage", false);
                if (!hasNextPage) break;

                // Navigate to next page
                session.evaluateJavaScript(buildGoNextPageScript());
                Thread.sleep(1_500L);
                pageIndex++;
            } else {
                break;
            }
        }

        return filterInvoices(allInvoices, keyword, buyerTaxId);
    }

    private static boolean waitForQueryFormAndSubmit(BrowserSession session, String dateFrom, String dateTo, String invoiceStatus, String buyerTaxId, String keyword) throws Exception {
        long deadline = System.currentTimeMillis() + QUERY_FORM_WAIT_MS;
        while (System.currentTimeMillis() < deadline) {
            Object result = session.evaluateJavaScript(
                buildFillQueryFormScript(dateFrom, dateTo, invoiceStatus, buyerTaxId, keyword)
            );
            if (Boolean.TRUE.equals(result)) return true;
            Thread.sleep(QUERY_FORM_POLL_MS);
        }
        return false;
    }

    private static String describeQueryFormMissing(BrowserSession session) throws Exception {
        Object pageSnap = session.evaluateJavaScript(buildQueryPageDiagnosticScript());
        if (!(pageSnap instanceof JSONObject)) {
            return "找不到發票查詢表單";
        }
        JSONObject snap = (JSONObject) pageSnap;
        String url = normalizeText(snap.optString("url", ""));
        String title = normalizeText(snap.optString("title", ""));
        String summary = normalizeText(snap.optString("summary", ""));
        return "找不到發票查詢表單（等待 10 秒）。" +
            (url.isEmpty() ? "" : " 目前頁面: " + url) +
            (title.isEmpty() ? "" : " 標題: " + title) +
            (summary.isEmpty() ? "" : " 頁面摘要: " + summary);
    }

    private static void assertPlatformAllowsAutomation(BrowserSession session, String stage) throws Exception {
        Object result = session.evaluateJavaScript(buildPlatformChallengeDetectScript());
        if (!(result instanceof JSONObject)) return;

        JSONObject snapshot = (JSONObject) result;
        if (!isPlatformChallengeSnapshot(snapshot)) return;

        Log.w(TAG, "E-invoice platform challenge detected stage=" + stage + " snapshot=" + snapshot);
        throw new EInvoiceException(PLATFORM_CHALLENGE_CODE, PLATFORM_CHALLENGE_MESSAGE);
    }

    static boolean isPlatformChallengeSnapshot(JSONObject snapshot) {
        if (snapshot == null) return false;
        if (snapshot.optBoolean("challenge", false)) return true;

        return isPlatformChallengeSnapshotText(
            snapshot.optString("title", ""),
            snapshot.optString("text", ""),
            snapshot.optString("url", "")
        );
    }

    static boolean isPlatformChallengeSnapshotText(String rawTitle, String rawText, String rawUrl) {
        String title = normalizeText(rawTitle).toLowerCase(Locale.US);
        String text = normalizeText(rawText).toLowerCase(Locale.US);
        String url = normalizeText(rawUrl).toLowerCase(Locale.US);

        return title.contains("just a moment")
            || text.contains("cloudflare")
            || text.contains("enable javascript and cookies")
            || text.contains("checking if the site connection is secure")
            || text.contains("cf-mitigated")
            || url.contains("/cdn-cgi/challenge-platform/");
    }

    private static JSONArray filterInvoices(JSONArray invoices, String keyword, String buyerTaxId) throws Exception {
        if (keyword.isEmpty() && buyerTaxId.isEmpty()) return invoices;
        JSONArray filtered = new JSONArray();
        for (int i = 0; i < invoices.length(); i++) {
            JSONObject inv = invoices.getJSONObject(i);
            if (!keyword.isEmpty()) {
                String merchant = normalizeText(inv.optString("merchantName", ""));
                if (!merchant.contains(keyword)) continue;
            }
            if (!buyerTaxId.isEmpty()) {
                String taxId = normalizeText(inv.optString("buyerTaxId", ""));
                if (!taxId.equals(buyerTaxId)) continue;
            }
            filtered.put(inv);
        }
        return filtered;
    }

    // ── Captcha OCR ───────────────────────────────────────────────────────────

    private static String recognizeNumericCaptcha(Activity activity, String dataUrl) {
        if (dataUrl.isEmpty()) return "";
        int commaIndex = dataUrl.indexOf(',');
        if (commaIndex < 0) return "";
        try {
            byte[] bytes = Base64.decode(dataUrl.substring(commaIndex + 1), Base64.DEFAULT);
            Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (source == null) return "";

            List<Bitmap> variants = buildCaptchaVariants(source);
            try {
                // numeric=true: 4-digit numeric CAPTCHA
                List<TesseractBridge.RecognitionCandidate> candidates = TesseractBridge.recognizeCaptchaCandidates(activity, variants, true);
                String best = selectBestCandidate(candidates);
                // Keep only digits
                String digitsOnly = best.replaceAll("[^0-9]", "");
                Log.d(TAG, "Captcha OCR raw=" + best + " digits=" + digitsOnly);
                return digitsOnly;
            } finally {
                for (Bitmap variant : variants) {
                    if (variant != null && !variant.isRecycled()) variant.recycle();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Captcha OCR failed", e);
            return "";
        }
    }

    private static List<Bitmap> buildCaptchaVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        addBitmapVariant(variants, source);
        addBitmapVariant(variants, scaleBitmap(source, 3));

        Bitmap gray = toGrayscale(source);
        addBitmapVariant(variants, gray);
        addBitmapVariant(variants, scaleBitmap(gray != null ? gray : source, 3));

        Bitmap contrast = toHighContrast(gray != null ? gray : source);
        addBitmapVariant(variants, contrast);
        addBitmapVariant(variants, scaleBitmap(contrast != null ? contrast : source, 3));

        Bitmap binaryDark = toBinaryThreshold(gray != null ? gray : source, 150, false);
        addBitmapVariant(variants, binaryDark);
        addBitmapVariant(variants, scaleBitmap(binaryDark != null ? binaryDark : source, 3));

        Bitmap binaryLight = toBinaryThreshold(gray != null ? gray : source, 190, false);
        addBitmapVariant(variants, binaryLight);
        addBitmapVariant(variants, toBinaryThreshold(gray != null ? gray : source, 150, true));
        return variants;
    }

    private static void addBitmapVariant(List<Bitmap> variants, Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) {
            variants.add(bitmap);
        }
    }

    private static Bitmap scaleBitmap(Bitmap src, int factor) {
        try {
            if (src == null || factor <= 1) return src;
            return Bitmap.createScaledBitmap(
                src,
                Math.max(1, src.getWidth() * factor),
                Math.max(1, src.getHeight() * factor),
                true
            );
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap toGrayscale(Bitmap src) {
        try {
            android.graphics.Paint paint = new android.graphics.Paint();
            android.graphics.ColorMatrix cm = new android.graphics.ColorMatrix();
            cm.setSaturation(0);
            paint.setColorFilter(new android.graphics.ColorMatrixColorFilter(cm));
            Bitmap result = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(result);
            canvas.drawBitmap(src, 0, 0, paint);
            return result;
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap toHighContrast(Bitmap src) {
        try {
            android.graphics.Paint paint = new android.graphics.Paint();
            android.graphics.ColorMatrix cm = new android.graphics.ColorMatrix(new float[]{
                3f, 0,  0,  0, -200f,
                0,  3f, 0,  0, -200f,
                0,  0,  3f, 0, -200f,
                0,  0,  0,  1f, 0
            });
            paint.setColorFilter(new android.graphics.ColorMatrixColorFilter(cm));
            Bitmap result = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(result);
            canvas.drawBitmap(src, 0, 0, paint);
            return result;
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap toBinaryThreshold(Bitmap src, int threshold, boolean invert) {
        if (src == null || src.isRecycled()) return null;
        try {
            Bitmap result = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
            int width = src.getWidth();
            int height = src.getHeight();
            int normalizedThreshold = Math.max(0, Math.min(255, threshold));
            for (int y = 0; y < height; y += 1) {
                for (int x = 0; x < width; x += 1) {
                    int pixel = src.getPixel(x, y);
                    int r = (pixel >> 16) & 0xff;
                    int g = (pixel >> 8) & 0xff;
                    int b = pixel & 0xff;
                    int luminance = Math.round((0.299f * r) + (0.587f * g) + (0.114f * b));
                    boolean dark = luminance < normalizedThreshold;
                    int value = (dark ^ invert) ? 0x00 : 0xff;
                    result.setPixel(x, y, 0xff000000 | (value << 16) | (value << 8) | value);
                }
            }
            return result;
        } catch (Exception e) {
            return null;
        }
    }

    private static String selectBestCandidate(List<TesseractBridge.RecognitionCandidate> candidates) {
        String best = "";
        int bestScore = -1;
        int bestConfidence = -1;
        for (TesseractBridge.RecognitionCandidate c : candidates) {
            String text = normalizeCaptchaDigits(c.text);
            int score = c.confidence * (text.length() == CAPTCHA_EXPECTED_LENGTH ? 2 : 1);
            if (score > bestScore || (score == bestScore && c.confidence > bestConfidence)) {
                bestScore = score;
                bestConfidence = c.confidence;
                best = text;
            }
        }
        Log.d(TAG, "Best captcha candidate score=" + bestScore + " confidence=" + bestConfidence + " text=" + best);
        return best;
    }

    private static String normalizeCaptchaDigits(String rawText) {
        String digits = rawText == null ? "" : rawText.replaceAll("[^0-9]", "");
        if (digits.length() <= CAPTCHA_EXPECTED_LENGTH) return digits;
        return digits.substring(0, CAPTCHA_EXPECTED_LENGTH);
    }

    // ── JavaScript scripts ─────────────────────────────────────────────────────

    static String buildSelectMobileCarrierScript() {
        return """
            (() => {
              try {
                const visible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const normalize = (value) => String(value || '').replace(/\\s+/g, '').toLowerCase();
                const dataText = (el) => Object.keys(el?.dataset || {}).map((key) => `${key}:${el.dataset[key]}`).join(' ');
                const textOf = (el) => [
                  el?.textContent,
                  el?.getAttribute?.('aria-label'),
                  el?.getAttribute?.('title'),
                  el?.getAttribute?.('for'),
                  el?.getAttribute?.('name'),
                  el?.getAttribute?.('id'),
                  el?.getAttribute?.('value'),
                  dataText(el),
                ].filter(Boolean).join(' ');
                const isMobileCarrierSignal = (el) => {
                  const text = normalize(textOf(el));
                  return text.includes('手機條碼') ||
                    text.includes('手機載具') ||
                    text.includes('mobilebarcode') ||
                    text.includes('mobilecarrier') ||
                    text.includes('barcode') ||
                    text.includes('mobile');
                };
                const dispatchFull = (el) => {
                  for (const type of ['input', 'change', 'click', 'blur']) {
                    el.dispatchEvent(new Event(type, { bubbles: true }));
                  }
                };
                const mobileField = document.querySelector(
                  '#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]'
                );
                if (mobileField && visible(mobileField)) {
                  return { selected: true, method: 'already_visible', reason: 'mobile_field_visible' };
                }

                const selects = Array.from(document.querySelectorAll('select')).filter(visible);
                for (const select of selects) {
                  const options = Array.from(select.options || []);
                  const match = options.find((option) => isMobileCarrierSignal(option));
                  if (match) {
                    select.value = match.value;
                    dispatchFull(select);
                    return { selected: true, method: 'select_option', reason: normalize(textOf(match)) };
                  }
                }

                const controls = Array.from(document.querySelectorAll(
                  'a, button, label, input[type="radio"], input[type="checkbox"], [role="tab"], [role="button"], [data-tab], [data-target], [data-bs-target]'
                )).filter(visible);
                for (const el of controls) {
                  if (!isMobileCarrierSignal(el)) continue;
                  if (el.tagName === 'LABEL') {
                    const forId = el.getAttribute('for');
                    const target = forId ? document.getElementById(forId) : null;
                    if (target) {
                      target.checked = true;
                      dispatchFull(target);
                    }
                  }
                  el.click();
                  dispatchFull(el);
                  return { selected: true, method: el.tagName.toLowerCase(), reason: normalize(textOf(el)).slice(0, 120) };
                }

                const attrSelectors = [
                  'a[href*="mobile"]',
                  'a[href*="barcode"]',
                  '[data-type="0"]',
                  '[data-target*="phone"]',
                  '[data-target*="mobile"]',
                  '[data-bs-target*="mobile"]',
                  '[data-carrier-type*="phone"]',
                  '[data-carrier-type*="mobile"]',
                  '[data-tab*="mobile"]',
                ];
                for (const sel of attrSelectors) {
                  try {
                    const el = document.querySelector(sel);
                    if (el && visible(el)) {
                      el.click();
                      dispatchFull(el);
                      return { selected: true, method: 'selector', reason: sel };
                    }
                  } catch (_) {}
                }
                return { selected: false, method: 'none', reason: 'mobile_carrier_control_missing' };
              } catch (e) {
                return { selected: false, method: 'error', reason: String(e?.message || 'error') };
              }
            })();
            """;
    }

    static String buildLoginFormSnapshotScript() {
        return """
            (() => {
              try {
                const visible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const mobileSelectors = '#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]';
                const passwordSelectors = '#loginPass, #passwd, #password, input[name="btc502wQ.userPasswd"], input[name="passwd"], input[type="password"]';
                const captchaSelectors = '#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"], input[maxlength="4"], img[id*="captcha"], img[src*="captcha"], img[alt*="驗證碼"]';
                return {
                  url: String(location.href || ''),
                  title: String(document.title || ''),
                  mobileFieldVisible: Array.from(document.querySelectorAll(mobileSelectors)).some(visible),
                  passwordFieldVisible: Array.from(document.querySelectorAll(passwordSelectors)).some(visible),
                  captchaVisible: Array.from(document.querySelectorAll(captchaSelectors)).some(visible),
                };
              } catch (e) {
                return { error: String(e?.message || 'error') };
              }
            })();
            """;
    }

    static String buildCaptchaSnapshotScript() {
        return """
            (() => {
              try {
                const visible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const candidates = Array.from(document.querySelectorAll([
                  '#captchaImg',
                  '#captcha_image',
                  '#captchaImage',
                  'img[id*="captcha" i]',
                  'img[name*="captcha" i]',
                  'img[src*="captcha" i]',
                  'img[alt*="驗證碼"]',
                  'img[alt*="captcha" i]',
                  '[style*="captcha" i]'
                ].join(','))).filter(visible);
                const img = candidates[0] || null;
                if (!img) return { ready: false, reason: 'image_missing' };
                if (typeof img.scrollIntoView === 'function') {
                  img.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
                const rect = img.getBoundingClientRect();
                const rectSnapshot = {
                  left: Math.max(0, rect.left || 0),
                  top: Math.max(0, rect.top || 0),
                  width: Math.max(0, rect.width || img.width || 0),
                  height: Math.max(0, rect.height || img.height || 0),
                  devicePixelRatio: Number(window.devicePixelRatio || 1)
                };
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if ((img.tagName || '').toLowerCase() !== 'img') {
                  return rectSnapshot.width > 0 && rectSnapshot.height > 0
                    ? { ready: true, dataUrl: '', rect: rectSnapshot, reason: 'element_capture' }
                    : { ready: false, reason: 'element_rect_empty', rect: rectSnapshot };
                }
                if (!img.complete || w === 0 || h === 0) return { ready: false, reason: 'image_incomplete', rect: rectSnapshot };
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return { ready: true, dataUrl: '', rect: rectSnapshot, reason: 'canvas_context_missing' };
                ctx.drawImage(img, 0, 0, w, h);
                let dataUrl = '';
                try { dataUrl = canvas.toDataURL('image/png'); } catch (_) {}
                if (!dataUrl || dataUrl.length < 64) return { ready: true, dataUrl: '', rect: rectSnapshot, reason: 'canvas_blocked' };
                return { ready: true, dataUrl, rect: rectSnapshot };
              } catch (e) {
                return { ready: false, reason: String(e.message || 'error') };
              }
            })();
            """;
    }

    private static String buildPlatformChallengeDetectScript() {
        return """
            (() => {
              try {
                const title = String(document.title || '');
                const text = String(document.body?.innerText || document.documentElement?.textContent || '').slice(0, 4000);
                const html = String(document.documentElement?.innerHTML || '').slice(0, 12000);
                const challenge = Boolean(
                  document.querySelector('script[src*="challenges.cloudflare.com"]') ||
                  document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
                  document.querySelector('#challenge-running, .cf-browser-verification, .cf-challenge') ||
                  html.includes('cf-mitigated') ||
                  html.includes('/cdn-cgi/challenge-platform/') ||
                  /just a moment/i.test(title) ||
                  /enable javascript and cookies/i.test(text) ||
                  /checking if the site connection is secure/i.test(text) ||
                  /cloudflare/i.test(text)
                );
                return { challenge, title, text, url: String(location.href || '') };
              } catch (e) {
                return { challenge: false, reason: String(e?.message || 'error') };
              }
            })();
            """;
    }

    private static String buildRefreshCaptchaScript() {
        return """
            (() => {
              try {
                const refreshSelectors = [
                  '#refreshCaptcha',
                  'a[onclick*="captcha"]',
                  'a[href*="captcha"]',
                  'img[onclick*="captcha"]',
                  '.captcha-refresh',
                  'button[aria-label*="更新"]',
                  'button[title*="更新"]',
                ];
                for (const sel of refreshSelectors) {
                  const el = document.querySelector(sel);
                  if (el) { el.click(); return true; }
                }
                // Fallback: reload captcha img src with cache-bust
                const img = document.querySelector('#captchaImg, img[id*="captcha"], img[src*="captcha"]');
                if (img && img.src) {
                  const base = img.src.split('?')[0];
                  img.src = base + '?t=' + Date.now();
                  return true;
                }
                return false;
              } catch (_) { return false; }
            })();
            """;
    }

    static String buildFillCredentialsOnlyScript(String phone, String password) {
        // SMB-174 redesign: fill phone + password without submitting and without filling captcha.
        // Used both for the visible auto-fill stage (so users can verify the credentials we
        // typed) and for the manual-captcha fallback (so the user only needs to handle the
        // captcha + login button themselves). Returns { filled, reason, missing } so the Java
        // side can report a precise failure when the form fields are not present.
        String safePhone = escapeJs(phone);
        String safePassword = escapeJs(password);
        return String.format(Locale.US, """
            (() => {
              const visible = (el) => {
                if (!el) return false;
                const style = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return !el.disabled && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
              };
              const normalize = (value) => String(value || '').replace(/\\s+/g, '').toLowerCase();
              const dataText = (el) => Object.keys(el?.dataset || {}).map((key) => `${key}:${el.dataset[key]}`).join(' ');
              const textOf = (el) => [
                el?.textContent,
                el?.getAttribute?.('aria-label'),
                el?.getAttribute?.('title'),
                el?.getAttribute?.('for'),
                el?.getAttribute?.('name'),
                el?.getAttribute?.('id'),
                el?.getAttribute?.('value'),
                dataText(el),
              ].filter(Boolean).join(' ');
              function dispatchFull(el) {
                el.dispatchEvent(new (typeof InputEvent !== 'undefined' ? InputEvent : Event)('input', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('keyup', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }
              function setVal(el, value) {
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeInputSetter) nativeInputSetter.call(el, value); else el.value = value;
                dispatchFull(el);
              }
              const roots = Array.from(document.querySelectorAll(
                'form, [role="tabpanel"], .tab-pane, .tab-content, .login-panel, .login-form, .card, section, main, body'
              )).filter(visible);
              const mobileRoots = roots.filter((root) =>
                root.querySelector('#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]') ||
                normalize(textOf(root)).includes('手機條碼') ||
                normalize(textOf(root)).includes('手機載具') ||
                normalize(textOf(root)).includes('mobilebarcode') ||
                normalize(textOf(root)).includes('mobilecarrier')
              );
              const searchRoots = (mobileRoots.length ? mobileRoots : roots.length ? roots : [document]).filter(Boolean);
              function findInput(selectors) {
                for (const root of searchRoots) {
                  for (const sel of selectors) {
                    try {
                      const matches = Array.from(root.querySelectorAll(sel)).filter(visible);
                      if (matches.length) return matches[0];
                    } catch (_) {}
                  }
                }
                for (const sel of selectors) {
                  try {
                    const matches = Array.from(document.querySelectorAll(sel)).filter(visible);
                    if (matches.length) return matches[0];
                  } catch (_) {}
                }
                return null;
              }
              const phoneEl = findInput([
                '#mobile_phone', 'input[name="mobile_phone"]',
                '#loginPhone', '#phoneNo', '#phone',
                '#cellphone', '#mobile', '#carrierMobile',
                'input[name="btc502wQ.userPh"]', 'input[name="phoneNo"]',
                'input[name*="mobile"]', 'input[name*="phone"]', 'input[id*="mobile"]', 'input[id*="phone"]',
                'input[type="tel"]', 'input[inputmode="tel"]', 'input[autocomplete="tel"]',
                'input[placeholder*="手機"]', 'input[placeholder*="條碼"]', 'input[aria-label*="手機"]',
              ]);
              const passEl = findInput([
                '#loginPass', '#passwd', '#password',
                'input[name="btc502wQ.userPasswd"]', 'input[name="passwd"]',
                'input[name*="password"]', 'input[name*="passwd"]', 'input[id*="password"]', 'input[id*="passwd"]',
                'input[type="password"]',
              ]);
              const missing = [];
              if (!phoneEl) missing.push('phone_missing');
              if (!passEl) missing.push('password_missing');
              if (missing.length) {
                const formDiag = {
                  url: String(location.href || ''),
                  visibleInputs: Array.from(document.querySelectorAll('input'))
                    .filter(visible)
                    .map((el) => ({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder }))
                    .slice(0, 10),
                };
                return { filled: false, reason: missing[0], missing: missing.join(','), formDiag };
              }
              setVal(phoneEl, '%s');
              setVal(passEl, '%s');
              return { filled: true, reason: 'phone_password_filled' };
            })();
            """, safePhone, safePassword);
    }

    static String buildClearCaptchaInputScript() {
        // Manual-captcha fallback: clear any auto-OCR'd value so the user types a fresh one.
        return """
            (() => {
              try {
                const el = document.querySelector(
                  '#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"], input[name*="captcha"], input[name*="verify"], input[id*="captcha"], input[id*="verify"], input[placeholder*="驗證碼"], input[aria-label*="驗證碼"], input[maxlength="4"]'
                );
                if (!el) return false;
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeInputSetter) nativeInputSetter.call(el, ''); else el.value = '';
                el.dispatchEvent(new (typeof InputEvent !== 'undefined' ? InputEvent : Event)('input', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              } catch (_) { return false; }
            })();
            """;
    }

    static String buildFocusCaptchaInputScript() {
        // Manual-captcha fallback: scroll the captcha into view, focus it, and select any
        // existing value so the user's first keystroke replaces it. Helps make the manual
        // step obvious immediately after the status bar prompt.
        return """
            (() => {
              try {
                const el = document.querySelector(
                  '#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"], input[name*="captcha"], input[name*="verify"], input[id*="captcha"], input[id*="verify"], input[placeholder*="驗證碼"], input[aria-label*="驗證碼"], input[maxlength="4"]'
                );
                if (!el) return false;
                if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                if (typeof el.focus === 'function') el.focus({ preventScroll: false });
                if (typeof el.select === 'function') el.select();
                return true;
              } catch (_) { return false; }
            })();
            """;
    }

    static String buildSubmitLoginScript(String phone, String password, String captcha) {
        String safePhone = escapeJs(phone);
        String safePassword = escapeJs(password);
        String safeCaptcha = escapeJs(captcha);
        return String.format(Locale.US, """
            (() => {
              const visible = (el) => {
                if (!el) return false;
                const style = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return !el.disabled && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
              };
              const normalize = (value) => String(value || '').replace(/\\s+/g, '').toLowerCase();
              const dataText = (el) => Object.keys(el?.dataset || {}).map((key) => `${key}:${el.dataset[key]}`).join(' ');
              const textOf = (el) => [
                el?.textContent,
                el?.getAttribute?.('aria-label'),
                el?.getAttribute?.('title'),
                el?.getAttribute?.('for'),
                el?.getAttribute?.('name'),
                el?.getAttribute?.('id'),
                el?.getAttribute?.('value'),
                dataText(el),
              ].filter(Boolean).join(' ');
              const isMobileCarrierSignal = (el) => {
                const text = normalize(textOf(el));
                return text.includes('手機條碼') ||
                  text.includes('手機載具') ||
                  text.includes('mobilebarcode') ||
                  text.includes('mobilecarrier') ||
                  text.includes('barcode') ||
                  text.includes('mobile');
              };
              function dispatchFull(el) {
                // Real browser order: input → keyup (while focused), then change → blur (on focus loss).
                // Using InputEvent for 'input' so framework synthetic-event systems treat it as user input.
                el.dispatchEvent(new (typeof InputEvent !== 'undefined' ? InputEvent : Event)('input', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('keyup', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }
              function ensureMobileCarrier() {
                const existing = document.querySelector(
                  '#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]'
                );
                if (existing && visible(existing)) return { selected: true, method: 'already_visible', reason: 'mobile_field_visible' };

                for (const select of Array.from(document.querySelectorAll('select')).filter(visible)) {
                  const match = Array.from(select.options || []).find((option) => isMobileCarrierSignal(option));
                  if (!match) continue;
                  select.value = match.value;
                  dispatchFull(select);
                  return { selected: true, method: 'select_option', reason: normalize(textOf(match)) };
                }

                const controls = Array.from(document.querySelectorAll(
                  'a, button, label, input[type="radio"], input[type="checkbox"], [role="tab"], [role="button"], [data-tab], [data-target], [data-bs-target]'
                )).filter(visible);
                for (const el of controls) {
                  if (!isMobileCarrierSignal(el)) continue;
                  if (el.tagName === 'LABEL') {
                    const target = el.getAttribute('for') ? document.getElementById(el.getAttribute('for')) : null;
                    if (target) {
                      target.checked = true;
                      dispatchFull(target);
                    }
                  }
                  el.click();
                  dispatchFull(el);
                  return { selected: true, method: el.tagName.toLowerCase(), reason: normalize(textOf(el)).slice(0, 120) };
                }
                return { selected: false, method: 'none', reason: 'mobile_carrier_control_missing' };
              }
              function setVal(el, value) {
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeInputSetter) {
                  nativeInputSetter.call(el, value);
                } else {
                  el.value = value;
                }
                dispatchFull(el);
              }
              const carrier = ensureMobileCarrier();
              const roots = Array.from(document.querySelectorAll(
                'form, [role="tabpanel"], .tab-pane, .tab-content, .login-panel, .login-form, .card, section, main, body'
              )).filter(visible);
              const mobileRoots = roots.filter((root) =>
                root.querySelector('#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]') ||
                normalize(textOf(root)).includes('手機條碼') ||
                normalize(textOf(root)).includes('手機載具') ||
                normalize(textOf(root)).includes('mobilebarcode') ||
                normalize(textOf(root)).includes('mobilecarrier')
              );
              const searchRoots = (mobileRoots.length ? mobileRoots : roots.length ? roots : [document]).filter(Boolean);
              function findInput(selectors) {
                for (const root of searchRoots) {
                  for (const sel of selectors) {
                    try {
                      const matches = Array.from(root.querySelectorAll(sel)).filter(visible);
                      if (matches.length) return matches[0];
                    } catch (_) {}
                  }
                }
                for (const sel of selectors) {
                  try {
                    const matches = Array.from(document.querySelectorAll(sel)).filter(visible);
                    if (matches.length) return matches[0];
                  } catch (_) {}
                }
                return null;
              }
              const phoneEl = findInput([
                '#mobile_phone', 'input[name="mobile_phone"]',
                '#loginPhone', '#phoneNo', '#phone',
                '#cellphone', '#mobile', '#carrierMobile',
                'input[name="btc502wQ.userPh"]', 'input[name="phoneNo"]',
                'input[name*="mobile"]', 'input[name*="phone"]', 'input[id*="mobile"]', 'input[id*="phone"]',
                'input[type="tel"]', 'input[inputmode="tel"]', 'input[autocomplete="tel"]',
                'input[placeholder*="手機"]', 'input[placeholder*="條碼"]', 'input[aria-label*="手機"]',
              ]);
              const passEl = findInput([
                '#loginPass', '#passwd', '#password',
                'input[name="btc502wQ.userPasswd"]', 'input[name="passwd"]',
                'input[name*="password"]', 'input[name*="passwd"]', 'input[id*="password"]', 'input[id*="passwd"]',
                'input[type="password"]',
              ]);
              const captchaEl = findInput([
                '#captcha', '#captchaCode', '#verifyCode',
                'input[name="captcha"]', 'input[name="verifyCode"]',
                'input[name*="captcha"]', 'input[name*="verify"]', 'input[id*="captcha"]', 'input[id*="verify"]',
                'input[placeholder*="驗證碼"]', 'input[aria-label*="驗證碼"]', 'input[maxlength="4"]',
              ]);
              const missing = [];
              if (!phoneEl) missing.push('phone_missing');
              if (!passEl) missing.push('password_missing');
              if (!captchaEl) missing.push('captcha_missing');
              if (missing.length) {
                return { submitted: false, reason: missing[0], missing: missing.join(','), carrier };
              }
              setVal(phoneEl, '%s');
              setVal(passEl, '%s');
              setVal(captchaEl, '%s');
              const submitSelectors = [
                'button[type="submit"]', 'input[type="submit"]',
                '.btn-login', '.login-btn', 'a.btn-query',
                'button.btn-primary', 'a[onclick*="login"]', 'button[onclick*="login"]',
                'button[aria-label*="登入"]', 'button[title*="登入"]',
              ];
              const submitRoots = [phoneEl.closest('form'), ...searchRoots].filter(Boolean);
              for (const root of submitRoots) {
                for (const sel of submitSelectors) {
                  const btn = root.querySelector(sel);
                  if (btn && visible(btn)) {
                    btn.click();
                    return { submitted: true, reason: 'clicked_submit', carrier };
                  }
                }
              }
              const form = phoneEl.closest('form');
              if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                if (typeof form.submit === 'function') form.submit();
                return { submitted: true, reason: 'submitted_form', carrier };
              }
              return { submitted: false, reason: 'submit_control_missing', missing: '', carrier };
            })();
            """, safePhone, safePassword, safeCaptcha);
    }

    static String buildLoginPageDetectScript() {
        return """
            (() => {
              try {
                // Primary: URL-based detection — if we have left /accounts/login we have successfully logged in.
                // Generic type-based selectors (tel, password) are not used because they match elements
                // on the post-login query page and cause waitForLoginSuccess to always time out.
                if (!String(location.href || '').includes('/accounts/login')) return false;
                // Fallback: specific ID/name selectors that only exist on the login page itself
                return Boolean(
                  document.querySelector('#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, input[name="btc502wQ.userPh"], input[name="phoneNo"]') ||
                  document.querySelector('#loginPass, #passwd, input[name="btc502wQ.userPasswd"], input[name="passwd"]') ||
                  document.querySelector('#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"]')
                );
              } catch (_) { return false; }
            })();
            """;
    }

    static String buildPageErrorDetailScript() {
        // SMB-174: capture any error/alert text rendered by the einvoice site after a failed
        // submit so the user sees the platform's actual error (e.g. 驗證碼錯誤 / 帳號或密碼錯誤)
        // instead of only the generic einvoice_login_failed message.
        return """
            (() => {
              try {
                const isVisible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const selectors = [
                  '.error-message', '.alert-danger', '.alert-error', '.alert-warning',
                  '#errorMsg', '#errMsg', '#loginError',
                  '[role="alert"]', '.invalid-feedback', '.help-block.error',
                  '.text-danger', '.error', '.errMsg',
                ];
                for (const sel of selectors) {
                  for (const el of Array.from(document.querySelectorAll(sel))) {
                    if (!isVisible(el)) continue;
                    const text = String(el.textContent || '').trim();
                    if (text) return { text: text.slice(0, 200) };
                  }
                }
                return { text: '' };
              } catch (e) { return { text: '' }; }
            })();
            """;
    }

    static String buildFillQueryFormScript(String dateFrom, String dateTo, String status, String buyerTaxId, String keyword) {
        String safeFrom = escapeJs(dateFrom);
        String safeTo = escapeJs(dateTo);
        String safeStatus = escapeJs(status);
        String safeTaxId = escapeJs(buyerTaxId);
        String safeKeyword = escapeJs(keyword);
        return String.format(Locale.US, """
            (() => {
              const textOf = (el) => String(el?.innerText || el?.textContent || '').trim();
              const pageText = textOf(document.body || document.documentElement);
              const hasResultSignal = () => (
                /[A-Z]{2}\\d{8}/.test(pageText) ||
                pageText.includes('載具清單資料') ||
                pageText.includes('發票清單') ||
                pageText.includes('發票號碼') ||
                pageText.includes('營業人') ||
                pageText.includes('賣方') ||
                pageText.includes('查無資料') ||
                pageText.includes('查無符合')
              );
              if (hasResultSignal()) return true;
              function setVal(el, value) {
                if (!el) return;
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeInputSetter) {
                  nativeInputSetter.call(el, value);
                } else {
                  el.value = value;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('keyup', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }
              function setSelect(el, value) {
                if (!el) return;
                const normalized = String(value || '').trim();
                for (const opt of el.options) {
                  if (
                    opt.value === normalized ||
                    opt.text.includes(normalized) ||
                    (normalized === 'all' && (/全部|所有|不限/.test(opt.text) || opt.value === ''))
                  ) {
                    el.value = opt.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                  }
                }
              }
              const find = (selectors) => {
                for (const selector of selectors) {
                  const el = document.querySelector(selector);
                  if (el) return el;
                }
                return null;
              };
              // btc502w query form fields. The exact name selectors are first so site
              // re-rendering does not accidentally match unrelated generic date inputs.
              const dateFromEl = find([
                'input[name="btc502wQ.qryDateS"]',
                '#qryDateS',
                'input[name*="qryDateS"]',
                'input[placeholder*="起"]',
              ]);
              const dateToEl = find([
                'input[name="btc502wQ.qryDateE"]',
                '#qryDateE',
                'input[name*="qryDateE"]',
                'input[placeholder*="迄"]',
              ]);
              const submitBtn = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], .btn-query, .search-btn, a.btn-primary, button, a'))
                .find((el) => /查詢|搜尋|送出|確定|query|search/i.test(textOf(el) || el.value || el.getAttribute?.('aria-label') || ''));
              const form = dateFromEl?.closest('form') || dateToEl?.closest('form') || submitBtn?.closest?.('form') || document.querySelector('form[name="btc502wForm"], form[id*="btc502w"], form[action*="btc502w"]');
              if (!dateFromEl && !dateToEl && !submitBtn && !form) return false;
              setVal(dateFromEl, '%s');
              setVal(dateToEl, '%s');
              // Invoice status
              const statusEl = find([
                'select[name="btc502wQ.invStatus"]',
                '#invStatus',
                'select[name*="invStatus"]',
                'select[name*="status"]',
              ]);
              if (statusEl) setSelect(statusEl, '%s');
              // Buyer tax ID
              const taxIdEl = find([
                'input[name="btc502wQ.buyerBan"]',
                '#buyerBan',
                'input[name*="buyerBan"]',
                'input[name*="taxId"]',
                'input[placeholder*="統編"]',
              ]);
              setVal(taxIdEl, '%s');
              // Keyword
              const keywordEl = find([
                'input[name="btc502wQ.keyword"]',
                '#keyword',
                'input[name*="keyword"]',
                'input[placeholder*="關鍵字"]',
                'input[placeholder*="品名"]',
              ]);
              setVal(keywordEl, '%s');
              // Submit
              if (submitBtn) { submitBtn.click(); return true; }
              if (form) { form.submit(); return true; }
              return hasResultSignal();
            })();
            """, safeFrom, safeTo, safeStatus, safeTaxId, safeKeyword);
    }

    static String buildQueryPageDiagnosticScript() {
        return """
            (() => {
              try {
                const textOf = (el) => String(el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
                const text = textOf(document.body || document.documentElement);
                return {
                  url: String(location.href || ''),
                  title: String(document.title || ''),
                  summary: text.slice(0, 240),
                };
              } catch (_) {
                return { url: '', title: '', summary: '' };
              }
            })();
            """;
    }

    static String buildWaitForResultsScript() {
        return """
            (() => {
              try {
                const textOf = (el) => String(el?.innerText || el?.textContent || '').trim();
                const pageText = textOf(document.body || document.documentElement);
                const invoiceLike = (pageText.match(/[A-Z]{2}\\d{8}/g) || []).length;
                const rows = Array.from(document.querySelectorAll(
                  'table.inv-list tr, table[id*="invTable"] tr, #invResult tr, tbody tr, [role="row"], .invoice-result, .invoice-list, .list-group-item, .card'
                ));
                const hasResultHeading = [
                  '載具清單資料',
                  '發票清單',
                  '發票號碼',
                  '發票號碼/隨機碼',
                  '營業人',
                  '賣方',
                  '消費日期',
                  '發票日期',
                ].some((needle) => pageText.includes(needle));
                const hasEmptyState = ['查無資料', '查無符合', '無符合條件', '沒有資料', 'No data'].some((needle) => pageText.includes(needle));
                return Boolean(
                  document.querySelector('table.inv-list, table[id*="invTable"], .invoice-result, #invResult') ||
                  document.querySelector('tr.inv-row, td.inv-no, td[class*="invoiceNo"]') ||
                  document.querySelector('.no-result, .empty-result, #noData') ||
                  invoiceLike > 0 ||
                  (hasResultHeading && rows.length > 0) ||
                  hasEmptyState
                );
              } catch (_) { return false; }
            })();
            """;
    }

    static String buildParseInvoiceListScript() {
        return """
            (() => {
              try {
                const invoices = [];
                const visible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const textOf = (el) => String(el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
                const parseAmount = (texts) => {
                  const preferred = texts.find((text) => /金額|總計|合計|銷售額|NT\\$|\\$/.test(text));
                  const sourceTexts = preferred ? [preferred, ...texts] : texts;
                  for (const text of sourceTexts) {
                    const amountLabel = /金額|總計|合計|銷售額|NT[$]|[$]/.test(text);
                    const cleaned = text.replace(/,/g, '');
                    const matches = cleaned.match(/(?:NT[$]|[$])?\\s*(-?\\d{1,7})(?:\\.\\d+)?/g) || [];
                    for (const match of matches) {
                      const normalized = String(match).replace(/[^0-9-]/g, '');
                      if (!normalized) continue;
                      if (/^\\d{8}$/.test(normalized)) continue; // 8 位數為買方統編，無論是否有金額標籤都不視為金額
                      if (!amountLabel && /^\\d{7}$/.test(normalized)) continue;
                      const num = parseInt(normalized, 10);
                      if (Number.isFinite(num) && num > 0) return num;
                    }
                  }
                  return 0;
                };
                const parseDateMs = (texts) => {
                  const joined = texts.join(' ');
                  const match = joined.match(/(\\d{3})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})|(\\d{4})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})/);
                  if (!match) return 0;
                  try {
                    if (match[1]) return new Date(Number(match[1]) + 1911, Number(match[2]) - 1, Number(match[3])).getTime();
                    return new Date(Number(match[4]), Number(match[5]) - 1, Number(match[6])).getTime();
                  } catch (_) {
                    return 0;
                  }
                };
                const inferMerchantName = (texts, invoiceNo, buyerTaxId) => {
                  const ignored = new Set(['發票號碼', '發票日期', '日期', '金額', '總計', '載具', '買方統編', '統一編號', '營業人']);
                  for (const raw of texts) {
                    const text = raw
                      .replace(invoiceNo, '')
                      .replace(buyerTaxId, '')
                      .replace(/\\d{3}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}/g, '')
                      .replace(/\\d{4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}/g, '')
                      .replace(/NT[$]?\\s*\\d[\\d,]*/gi, '')
                      .trim();
                    if (text.length <= 1) continue;
                    if (/^[\\d,\\s$.-]+$/.test(text)) continue;
                    if (ignored.has(text)) continue;
                    if (/電子發票|手機條碼|載具清單資料|查詢結果/.test(text)) continue;
                    return text.slice(0, 80);
                  }
                  return '';
                };
                const containers = Array.from(document.querySelectorAll(
                  'table.inv-list tr:not(:first-child), table[id*="invTable"] tr:not(:first-child), #invResult tr.data-row, tbody tr, [role="row"], .invoice-result li, .invoice-list li, .list-group-item, .card, [class*="invoice"], [class*="carrier"]'
                )).filter(visible);
                const seen = new Set();
                for (const row of containers) {
                  const rowText = textOf(row);
                  const invoiceMatches = rowText.match(/[A-Z]{2}\\d{8}/g) || [];
                  if (!invoiceMatches.length) continue;
                  const cells = Array.from(row.querySelectorAll('td, th, div, span, p, li')).map(textOf).filter(Boolean);
                  const texts = cells.length ? cells : [rowText];
                  for (const invoiceNo of invoiceMatches) {
                    if (seen.has(invoiceNo)) continue;
                    const buyerTaxId = (texts.find((text) => /統編|統一編號|buyer/i.test(text) && /\\b\\d{8}\\b/.test(text))?.match(/\\b\\d{8}\\b/) || [])[0] ||
                      ((rowText.replace(invoiceNo, '').match(/\\b\\d{8}\\b/) || [])[0] ?? '');
                    const amount = parseAmount(texts);
                    const dateMs = parseDateMs(texts);
                    const carrierText = texts.find((text) => /手機條碼|載具/.test(text)) || '';
                    const carrierName = carrierText ? carrierText.slice(0, 50) : '手機條碼';
                    const merchantName = inferMerchantName(texts, invoiceNo, buyerTaxId);
                    invoices.push({ invoiceNumber: invoiceNo, amount, invoiceDate: dateMs, merchantName, carrierName, buyerTaxId });
                    seen.add(invoiceNo);
                  }
                }
                // Check if there is a next page button
                const nextPageBtn = Array.from(document.querySelectorAll('.pagination .next:not(.disabled), a[onclick*="nextPage"]:not([disabled]), button, a'))
                  .find((el) => visible(el) && /下一頁|下頁|next/i.test(textOf(el) || el.getAttribute?.('aria-label') || ''));
                return { invoices, hasNextPage: Boolean(nextPageBtn) };
              } catch (e) {
                return { invoices: [], hasNextPage: false };
              }
            })();
            """;
    }

    static String buildGoNextPageScript() {
        return """
            (() => {
              try {
                const textOf = (el) => String(el?.innerText || el?.textContent || el?.getAttribute?.('aria-label') || '').trim();
                const visible = (el) => {
                  if (!el) return false;
                  const style = getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return !el.disabled && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                };
                const nextBtn = Array.from(document.querySelectorAll('.pagination .next:not(.disabled), a[onclick*="nextPage"]:not([disabled]), button, a'))
                  .find((el) => visible(el) && /下一頁|下頁|next/i.test(textOf(el)));
                if (nextBtn) { nextBtn.click(); return true; }
                return false;
              } catch (_) { return false; }
            })();
            """;
    }

    // ── Date format conversion ─────────────────────────────────────────────────

    private static String toRocDate(String isoDate) {
        try {
            LocalDate date = LocalDate.parse(isoDate, DateTimeFormatter.ISO_DATE);
            int rocYear = date.getYear() - 1911;
            return String.format(Locale.US, "%03d%02d%02d", rocYear, date.getMonthValue(), date.getDayOfMonth());
        } catch (Exception e) {
            return isoDate.replace("-", "");
        }
    }

    // ── BrowserSession ─────────────────────────────────────────────────────────

    private static final class BrowserSession {
        private final Activity activity;
        private final WebView webView;
        private final Consumer<String> statusUpdater;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final AtomicReference<CountDownLatch> navigationLatchRef = new AtomicReference<>(null);
        private final AtomicReference<String> lastFinishedUrlRef = new AtomicReference<>("");

        BrowserSession(Activity activity, WebView webView) throws Exception {
            this(activity, webView, null);
        }

        BrowserSession(Activity activity, WebView webView, Consumer<String> statusUpdater) throws Exception {
            this.activity = activity;
            this.webView = webView;
            this.statusUpdater = statusUpdater != null ? statusUpdater : (text) -> {};
            installWebViewClient();
        }

        void setStatus(String text) {
            try {
                statusUpdater.accept(text);
            } catch (Exception ignored) {
                // status updates must never disrupt the automation flow
            }
        }

        private void installWebViewClient() throws Exception {
            runOnUiThreadAndWait(() -> webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    lastFinishedUrlRef.set(url == null ? "" : url.trim());
                    CountDownLatch latch = navigationLatchRef.getAndSet(null);
                    if (latch != null) latch.countDown();
                }
            }));
        }

        void loadUrl(String url) throws Exception {
            CountDownLatch latch = new CountDownLatch(1);
            navigationLatchRef.set(latch);
            runOnUiThreadAndWait(() -> webView.loadUrl(url));
            if (!latch.await(30_000L, TimeUnit.MILLISECONDS)) {
                throw new EInvoiceException("einvoice_navigation_timeout", "頁面載入逾時: " + url);
            }
            // Wait for DOM ready
            long deadline = System.currentTimeMillis() + 10_000L;
            while (System.currentTimeMillis() < deadline) {
                Object ready = evaluateJavaScript("(() => { try { return document.readyState === 'complete' || document.readyState === 'interactive'; } catch(_) { return false; } })();");
                if (Boolean.TRUE.equals(ready)) break;
                Thread.sleep(200L);
            }
        }

        Object evaluateJavaScript(String script) throws Exception {
            final AtomicReference<Object> resultRef = new AtomicReference<>(null);
            final CountDownLatch latch = new CountDownLatch(1);
            // Post evaluateJavascript to the main thread without blocking it.
            // The JS callback is also delivered on the main thread, so we must
            // not hold latch.await() there — wait on the background thread instead.
            mainHandler.post(() ->
                webView.evaluateJavascript(script, value -> {
                    resultRef.set(parseJsResult(value));
                    latch.countDown();
                })
            );
            latch.await(15_000L, TimeUnit.MILLISECONDS);
            return resultRef.get();
        }

        String captureVisibleRegionDataUrl(float left, float top, float width, float height) throws Exception {
            if (width <= 0 || height <= 0) return "";
            final AtomicReference<String> resultRef = new AtomicReference<>("");
            final CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> {
                try {
                    int viewWidth = Math.max(1, webView.getWidth());
                    int viewHeight = Math.max(1, webView.getHeight());
                    if (viewWidth <= 1 || viewHeight <= 1) {
                        resultRef.set("");
                        return;
                    }

                    float scale = Math.max(0.1f, webView.getScale());
                    int x = Math.max(0, Math.round(left * scale));
                    int y = Math.max(0, Math.round(top * scale));
                    int w = Math.max(1, Math.round(width * scale));
                    int h = Math.max(1, Math.round(height * scale));
                    Rect crop = new Rect(
                        Math.max(0, x - 4),
                        Math.max(0, y - 4),
                        Math.min(viewWidth, x + w + 4),
                        Math.min(viewHeight, y + h + 4)
                    );
                    if (crop.width() <= 0 || crop.height() <= 0) {
                        resultRef.set("");
                        return;
                    }

                    Bitmap full = Bitmap.createBitmap(viewWidth, viewHeight, Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(full);
                    webView.draw(canvas);
                    Bitmap cropped = Bitmap.createBitmap(full, crop.left, crop.top, crop.width(), crop.height());
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    cropped.compress(Bitmap.CompressFormat.PNG, 100, output);
                    String encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
                    resultRef.set(encoded.isEmpty() ? "" : "data:image/png;base64," + encoded);
                    if (!cropped.isRecycled()) cropped.recycle();
                    if (!full.isRecycled()) full.recycle();
                } catch (Throwable error) {
                    Log.w(TAG, "Failed to capture captcha element region", error);
                    resultRef.set("");
                } finally {
                    latch.countDown();
                }
            });
            latch.await(5_000L, TimeUnit.MILLISECONDS);
            return resultRef.get();
        }

        private static Object parseJsResult(String value) {
            if (value == null || value.equals("null") || value.equals("undefined")) return null;
            if (value.equals("true")) return Boolean.TRUE;
            if (value.equals("false")) return Boolean.FALSE;
            try { return new JSONObject(value); } catch (Exception ignored) {}
            try { return new JSONArray(value); } catch (Exception ignored) {}
            try { return Long.parseLong(value); } catch (Exception ignored) {}
            try { return Double.parseDouble(value); } catch (Exception ignored) {}
            // Remove JS string quotes
            if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                return value.substring(1, value.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\");
            }
            return value;
        }

        private void runOnUiThreadAndWait(Runnable action) throws Exception {
            if (Looper.myLooper() == Looper.getMainLooper()) {
                action.run();
                return;
            }
            CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> { try { action.run(); } finally { latch.countDown(); } });
            latch.await(10_000L, TimeUnit.MILLISECONDS);
        }

    }

    // ── Utilities ──────────────────────────────────────────────────────────────

    private static String requireText(JSONObject obj, String key, String code, String message) throws EInvoiceException {
        String value = normalizeText(obj.optString(key, ""));
        if (value.isEmpty()) throw new EInvoiceException(code, message);
        return value;
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String escapeJs(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "\\r");
    }
}
