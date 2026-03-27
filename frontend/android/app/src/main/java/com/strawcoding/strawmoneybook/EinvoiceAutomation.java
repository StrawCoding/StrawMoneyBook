package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class EinvoiceAutomation {
    private static final String PROVIDER_ID = "tw_einvoice_mobile_barcode";
    private static final String AUTH_MODE = "mobile_barcode";
    private static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login";
    private static final String SEARCH_URL = "https://www.einvoice.nat.gov.tw/portal/btc/btc502w/search";
    private static final String ORIGIN = "https://www.einvoice.nat.gov.tw";
    private static final int CAPTCHA_MAX_ATTEMPTS = 5;
    private static final int CAPTCHA_EXPECTED_LENGTH = 4;
    private static final int CAPTCHA_MIN_TARGET_HEIGHT = 108;
    private static final int CAPTCHA_MIN_DATA_URL_LENGTH = 64;
    private static final long CAPTCHA_READY_TIMEOUT_MS = 12_000L;
    private static final long CAPTCHA_READY_POLL_MS = 250L;
    private static final long CAPTCHA_REFRESH_FALLBACK_READY_MS = 1_500L;

    private EinvoiceAutomation() {}

    static final class CaptchaSnapshot {
        final boolean ready;
        final boolean imageReady;
        final boolean dataReady;
        final String dataUrl;
        final String signature;
        final String reason;
        final boolean complete;
        final int width;
        final int height;
        final String src;
        final String currentSrc;

        CaptchaSnapshot(
            boolean ready,
            boolean imageReady,
            boolean dataReady,
            String dataUrl,
            String signature,
            String reason,
            boolean complete,
            int width,
            int height,
            String src,
            String currentSrc
        ) {
            this.ready = ready;
            this.imageReady = imageReady;
            this.dataReady = dataReady;
            this.dataUrl = dataUrl == null ? "" : dataUrl;
            this.signature = signature == null ? "" : signature;
            this.reason = reason == null ? "" : reason;
            this.complete = complete;
            this.width = Math.max(0, width);
            this.height = Math.max(0, height);
            this.src = src == null ? "" : src;
            this.currentSrc = currentSrc == null ? "" : currentSrc;
        }
    }

    static JSONObject connect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String mobilePhone = requireText(payload, "mobilePhone", "einvoice_mobile_phone_required", "E-invoice mobile phone is required");
        String password = requireText(payload, "password", "einvoice_password_required", "E-invoice password is required");
        String sessionRef = buildSessionRef(mobilePhone);

        BrowserSession session = new BrowserSession(activity, webView);
        debugTrace.record("load_login_page", "running", "Loading e-invoice login page");
        session.loadUrl(LOGIN_URL);
        debugTrace.record("load_login_page", "ok", "E-invoice login page loaded");

        performLogin(activity, session, debugTrace, mobilePhone, password);
        debugTrace.record("login_complete", "ok", "E-invoice login completed");

        session.ensureSearchPageReady();
        JSONArray carrierOptions = session.readCarrierOptions();
        JSONObject sessionState = new JSONObject();
        sessionState.put("provider", PROVIDER_ID);
        sessionState.put("sessionRef", sessionRef);
        sessionState.put("mobilePhone", mobilePhone);
        sessionState.put("cookieHeader", session.captureCookies());
        sessionState.put("localStorageItems", session.captureLocalStorageItems());
        sessionState.put("carrierOptions", carrierOptions);
        sessionState.put("updatedAt", nowIso());
        vault.saveConnectionState(sessionRef, sessionState);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("auth_mode", AUTH_MODE);
        result.put("provider_connection_id", mobilePhone);
        result.put("connection_id", sessionRef);
        result.put("connection_name", "手機條碼 " + maskMobilePhone(mobilePhone));
        result.put("session_token", sessionRef);
        result.put("access_token_ref", sessionRef);
        result.put("carrier_options", carrierOptions);
        result.put("created_at", nowIso());
        return result;
    }

    static JSONObject sync(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String sessionRef = requireSessionRef(payload);
        JSONObject state = vault.getConnectionState(sessionRef);
        if (state == null) {
            throw createSessionExpiredError();
        }

        BrowserSession session = new BrowserSession(activity, webView);
        String cookieHeader = normalizeText(state.optString("cookieHeader"));
        if (!cookieHeader.isEmpty()) {
            debugTrace.record("restore_cookies", "running", "Restoring e-invoice cookies");
            session.restoreCookies(cookieHeader);
            debugTrace.record("restore_cookies", "ok", "E-invoice cookies restored");
        }

        session.ensureSearchPageReady();
        session.restoreLocalStorageItems(state.optJSONArray("localStorageItems"));
        session.ensureSearchPageReady();
        if (session.isLoginPage()) {
            throw createSessionExpiredError();
        }

        JSONObject filter = normalizeFilter(payload.optJSONObject("filter"));
        debugTrace.record("submit_query", "running", "Submitting e-invoice query", new JSONObject().put("filter", filter));
        session.submitQuery(filter);
        debugTrace.record("submit_query", "ok", "E-invoice query submitted");

        JSONArray carrierOptions = session.readCarrierOptions();
        JSONArray invoices = session.readInvoices(filter.optString("status", "all"));
        JSONObject nextState = new JSONObject();
        nextState.put("provider", PROVIDER_ID);
        nextState.put("sessionRef", sessionRef);
        nextState.put("mobilePhone", normalizeText(state.optString("mobilePhone")));
        nextState.put("cookieHeader", session.captureCookies());
        nextState.put("localStorageItems", session.captureLocalStorageItems());
        nextState.put("carrierOptions", carrierOptions);
        nextState.put("updatedAt", nowIso());
        vault.saveConnectionState(sessionRef, nextState);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("auth_mode", AUTH_MODE);
        result.put("sync_time", nowIso());
        result.put("session_token", sessionRef);
        result.put("access_token_ref", sessionRef);
        result.put("carrier_options", carrierOptions);
        result.put("filters_applied", filter);
        result.put("invoices", invoices);
        return result;
    }

    static JSONObject disconnect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String sessionRef = resolveSessionRef(payload);
        BrowserSession session = new BrowserSession(activity, webView);
        try {
            session.loadUrl(LOGIN_URL);
            session.clearLocalStorageItems();
            session.clearSessionCookies();
            debugTrace.record("disconnect_cleanup", "ok", "Cleared e-invoice WebView session state");
        } catch (Exception error) {
            debugTrace.record("disconnect_cleanup", "error", "Failed to clear e-invoice WebView session state");
        }
        if (!sessionRef.isEmpty()) {
            vault.deleteConnectionState(sessionRef);
        }
        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("provider", PROVIDER_ID);
        result.put("disconnected_at", nowIso());
        return result;
    }

    static String buildSessionRef(String mobilePhone) {
        String normalized = normalizeDigits(mobilePhone);
        long hash = 2166136261L;
        for (int index = 0; index < normalized.length(); index += 1) {
            hash ^= normalized.charAt(index);
            hash *= 16777619L;
            hash &= 0xffffffffL;
        }
        return "einv_session_" + Long.toString(Math.abs(hash), 36);
    }

    static String formatDateRangeLabel(String dateFrom, String dateTo) {
        return formatNationalDate(dateFrom) + " ~ " + formatNationalDate(dateTo);
    }

    static String formatNationalDate(String value) {
        String normalized = normalizeText(value);
        String[] parts = normalized.split("-");
        if (parts.length != 3) return "";
        try {
            return String.format(Locale.US, "%d年%d月%d日", Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
        } catch (NumberFormatException error) {
            return "";
        }
    }

    static String getSearchUrlForTest() {
        return SEARCH_URL;
    }

    static boolean isPasswordChangeRequiredMessageForTest(String value) {
        return isPasswordChangeRequiredMessage(value);
    }

    private static void performLogin(Activity activity, BrowserSession session, BankAutomationDebugTrace debugTrace, String mobilePhone, String password) throws Exception {
        boolean attemptedLoginSubmission = false;
        for (int attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt += 1) {
            CaptchaSnapshot snapshot = attempt == 0
                ? session.waitForCaptchaReady("")
                : session.refreshCaptcha();
            JSONObject captchaDetails = new JSONObject();
            captchaDetails.put("attempt", attempt + 1);
            captchaDetails.put("reason", normalizeText(snapshot.reason));
            captchaDetails.put("width", snapshot.width);
            captchaDetails.put("height", snapshot.height);
            debugTrace.record("captcha_wait_ready", "ok", "Captcha ready", captchaDetails);

            String captchaText = recognizeCaptcha(activity, debugTrace, attempt + 1, snapshot.dataUrl);
            if (captchaText.isEmpty()) {
                continue;
            }

            attemptedLoginSubmission = true;
            debugTrace.record("submit_login", "running", "Submitting e-invoice login", new JSONObject().put("attempt", attempt + 1));
            session.submitLogin(mobilePhone, password, captchaText);
            if (session.waitForLoginSuccess()) {
                debugTrace.record("submit_login", "ok", "E-invoice login succeeded", new JSONObject().put("attempt", attempt + 1));
                return;
            }

            String errorText = session.extractErrorText();
            JSONObject errorDetails = new JSONObject();
            errorDetails.put("attempt", attempt + 1);
            errorDetails.put("message", errorText);
            debugTrace.record("submit_login", "error", "E-invoice login failed", errorDetails);
            if (isPasswordChangeRequiredMessage(errorText)) {
                throw new BankAutomationException(
                    "einvoice_password_change_required",
                    "發票載具驗證碼(密碼)已逾期，請先到電子發票平台更改後再重新登入"
                );
            }
        }
        if (!attemptedLoginSubmission) {
            throw new BankAutomationException("einvoice_captcha_ocr_failed", "E-invoice captcha recognition failed");
        }
        throw new BankAutomationException("einvoice_login_failed", "E-invoice login failed");
    }

    private static String recognizeCaptcha(Activity activity, BankAutomationDebugTrace debugTrace, int attempt, String dataUrl) {
        String normalizedDataUrl = normalizeText(dataUrl);
        if (!isCaptchaDataUrlUsable(normalizedDataUrl)) {
            debugTrace.record("captcha_ocr", "error", "Captcha image data is unavailable", buildAttemptDetails(attempt));
            return "";
        }

        String base64Body = normalizedDataUrl.replaceFirst("^data:image/[^;]+;base64,", "");
        byte[] bytes;
        try {
            bytes = Base64.decode(base64Body, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            debugTrace.record("captcha_ocr", "error", "Captcha image data is invalid", buildAttemptDetails(attempt));
            return "";
        }

        Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (source == null) {
            debugTrace.record("captcha_ocr", "error", "Captcha bitmap decode failed", buildAttemptDetails(attempt));
            return "";
        }

        List<Bitmap> variants = buildCaptchaVariants(source);
        List<TesseractBridge.RecognitionCandidate> rawCandidates = TesseractBridge.recognizeCaptchaCandidates(activity, variants, false);
        List<FirstBankAutomation.WeightedCaptchaCandidate> weightedCandidates = new ArrayList<>();
        JSONArray candidatesJson = new JSONArray();
        for (TesseractBridge.RecognitionCandidate candidate : rawCandidates) {
            String normalizedText = normalizeEinvoiceCaptchaString(candidate.text);
            if (normalizedText.isEmpty()) continue;
            int weight = Math.max(1, candidate.confidence);
            if (normalizedText.length() == 4) {
                weight += 25;
            }
            weightedCandidates.add(new FirstBankAutomation.WeightedCaptchaCandidate(
                normalizedText,
                weight,
                candidate.variantIndex,
                candidate.strategy
            ));
            JSONObject item = new JSONObject();
            try {
                item.put("text", normalizedText);
                item.put("confidence", candidate.confidence);
                item.put("variantIndex", candidate.variantIndex);
                item.put("strategy", candidate.strategy);
                candidatesJson.put(item);
            } catch (JSONException ignored) {
                // Trace metadata should never break OCR flow.
            }
        }

        String selected = FirstBankAutomation.selectBestCaptchaCandidateWeighted(weightedCandidates);
        JSONObject details = buildAttemptDetails(attempt);
        try {
            details.put("sourceWidth", source.getWidth());
            details.put("sourceHeight", source.getHeight());
            details.put("selected", selected);
            details.put("candidateCount", weightedCandidates.size());
            details.put("candidates", candidatesJson);
        } catch (JSONException ignored) {
            // Trace metadata should never break OCR flow.
        }
        if (selected.isEmpty()) {
            debugTrace.record("captcha_ocr", "error", "Captcha OCR failed", details);
            return "";
        }
        debugTrace.record("captcha_ocr", "ok", "Captcha OCR succeeded", details);
        return selected;
    }

    private static List<Bitmap> buildCaptchaVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        Bitmap conservativeTrim = cropCaptchaMargins(source, 0.02f, 0.04f);
        Bitmap standardTrim = cropCaptchaMargins(source, 0.04f, 0.08f);
        variants.add(preprocessCaptcha(source, 0, false, 1.25f));
        variants.add(preprocessCaptcha(conservativeTrim, 95, false, 1.40f));
        variants.add(preprocessCaptcha(conservativeTrim, 115, false, 1.45f));
        variants.add(preprocessCaptcha(conservativeTrim, 135, false, 1.50f));
        variants.add(preprocessCaptcha(conservativeTrim, 155, false, 1.55f));
        variants.add(preprocessCaptcha(conservativeTrim, 175, false, 1.60f));
        variants.add(preprocessCaptcha(conservativeTrim, 135, true, 1.50f));
        variants.add(preprocessCaptcha(standardTrim, 110, false, 1.35f));
        variants.add(preprocessCaptcha(standardTrim, 140, false, 1.45f));
        variants.add(preprocessCaptcha(standardTrim, 170, false, 1.55f));
        variants.add(preprocessCaptcha(standardTrim, 140, true, 1.45f));
        return variants;
    }

    private static Bitmap cropCaptchaMargins(Bitmap source, float insetXRatio, float insetYRatio) {
        int insetX = Math.max(1, Math.round(source.getWidth() * insetXRatio));
        int insetY = Math.max(1, Math.round(source.getHeight() * insetYRatio));
        int width = Math.max(1, source.getWidth() - (insetX * 2));
        int height = Math.max(1, source.getHeight() - (insetY * 2));
        if (width >= source.getWidth() || height >= source.getHeight()) {
            return source;
        }
        return Bitmap.createBitmap(source, insetX, insetY, width, height);
    }

    private static Bitmap preprocessCaptcha(Bitmap source, int threshold, boolean invert, float contrast) {
        float scale = Math.max(CAPTCHA_MIN_TARGET_HEIGHT / (float) Math.max(1, source.getHeight()), 4f);
        int targetWidth = Math.max(Math.round(source.getWidth() * scale), 180);
        int targetHeight = Math.max(Math.round(source.getHeight() * scale), CAPTCHA_MIN_TARGET_HEIGHT);
        Bitmap scaled = Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
        Bitmap output = Bitmap.createBitmap(scaled.getWidth(), scaled.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        ColorMatrix colorMatrix = new ColorMatrix();
        colorMatrix.setSaturation(0f);
        paint.setColorFilter(new ColorMatrixColorFilter(colorMatrix));
        canvas.drawBitmap(scaled, 0f, 0f, paint);

        for (int x = 0; x < scaled.getWidth(); x += 1) {
            for (int y = 0; y < scaled.getHeight(); y += 1) {
                int pixel = output.getPixel(x, y);
                int red = Color.red(pixel);
                int green = Color.green(pixel);
                int blue = Color.blue(pixel);
                int average = (red + green + blue) / 3;
                int adjusted = clampToColor(Math.round(((average - 128f) * contrast) + 128f));
                if (threshold > 0) {
                    adjusted = adjusted > threshold ? 255 : 0;
                    if (invert) {
                        adjusted = 255 - adjusted;
                    }
                }
                output.setPixel(x, y, Color.argb(255, adjusted, adjusted, adjusted));
            }
        }
        if (threshold > 0) {
            removeCaptchaNoise(output);
        }
        return output;
    }

    private static int clampToColor(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private static void removeCaptchaNoise(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        Bitmap snapshot = bitmap.copy(bitmap.getConfig(), false);
        for (int x = 1; x < width - 1; x += 1) {
            for (int y = 1; y < height - 1; y += 1) {
                int pixel = snapshot.getPixel(x, y);
                if (Color.red(pixel) > 20) continue;
                int darkNeighbors = 0;
                for (int dx = -1; dx <= 1; dx += 1) {
                    for (int dy = -1; dy <= 1; dy += 1) {
                        if (dx == 0 && dy == 0) continue;
                        if (Color.red(snapshot.getPixel(x + dx, y + dy)) < 20) {
                            darkNeighbors += 1;
                        }
                    }
                }
                if (darkNeighbors == 0) {
                    bitmap.setPixel(x, y, Color.WHITE);
                }
            }
        }
    }

    static String resolveLoginFailureCodeForTest(boolean attemptedLoginSubmission) {
        return attemptedLoginSubmission ? "einvoice_login_failed" : "einvoice_captcha_ocr_failed";
    }

    static String normalizeEinvoiceCaptchaStringForTest(String value) {
        return normalizeEinvoiceCaptchaString(value);
    }

    private static String normalizeEinvoiceCaptchaString(String value) {
        return FirstBankAutomation.normalizeCaptchaString(value);
    }

    private static JSONObject buildAttemptDetails(int attempt) {
        JSONObject details = new JSONObject();
        try {
            details.put("attempt", attempt);
        } catch (JSONException ignored) {
            // Trace metadata should never break automation flow.
        }
        return details;
    }

    private static JSONObject normalizeFilter(JSONObject input) throws JSONException {
        JSONObject next = new JSONObject();
        JSONObject source = input == null ? new JSONObject() : input;
        next.put("dateFrom", normalizeDateInput(source.optString("dateFrom")));
        next.put("dateTo", normalizeDateInput(source.optString("dateTo")));
        next.put("carrier", normalizeText(source.optString("carrier", "all")));
        next.put("status", normalizeText(source.optString("status", "all")));
        next.put("buyerBan", normalizeText(source.optString("buyerBan")));
        next.put("productName", normalizeText(source.optString("productName")));
        return next;
    }

    private static String requireSessionRef(JSONObject payload) throws BankAutomationException {
        String sessionRef = resolveSessionRef(payload);
        if (sessionRef.isEmpty()) {
            throw createSessionExpiredError();
        }
        return sessionRef;
    }

    private static String resolveSessionRef(JSONObject payload) {
        if (payload == null) return "";
        String sessionRef = normalizeText(payload.optString("access_token_ref"));
        if (sessionRef.isEmpty()) {
            sessionRef = normalizeText(payload.optString("session_token"));
        }
        if (sessionRef.isEmpty()) {
            sessionRef = normalizeText(payload.optString("connectionId"));
        }
        if (sessionRef.isEmpty()) {
            sessionRef = normalizeText(payload.optString("connection_id"));
        }
        return sessionRef;
    }

    private static BankAutomationException createSessionExpiredError() {
        return new BankAutomationException("einvoice_session_expired", "電子發票登入 Session 已失效，請重新驗證");
    }

    private static boolean isPasswordChangeRequiredMessage(String value) {
        String normalized = normalizeText(value);
        if (normalized.isEmpty()) return false;
        boolean mentionsPassword = normalized.contains("密碼") || normalized.contains("驗證碼");
        boolean mentionsChange = normalized.contains("變更")
            || normalized.contains("修改")
            || normalized.contains("更新")
            || normalized.contains("更換")
            || normalized.contains("重設");
        boolean mentionsExpiry = normalized.contains("逾期")
            || normalized.contains("到期")
            || normalized.contains("期限")
            || normalized.contains("超過時間")
            || normalized.contains("未變更")
            || normalized.contains("未更換");
        boolean mentionsBlocked = normalized.contains("拒絕登入")
            || normalized.contains("無法登入")
            || normalized.contains("不得登入")
            || normalized.contains("停用")
            || normalized.contains("鎖定");
        boolean mentionsLogin = normalized.contains("登入");
        return mentionsPassword && mentionsChange && (mentionsExpiry || mentionsBlocked || mentionsLogin);
    }

    private static boolean isCaptchaDataUrlUsable(String dataUrl) {
        return normalizeText(dataUrl).startsWith("data:image/")
            && normalizeText(dataUrl).length() >= CAPTCHA_MIN_DATA_URL_LENGTH;
    }

    private static String requireText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        String value = normalizeText(payload.optString(key));
        if (value.isEmpty()) {
            throw new BankAutomationException(code, message);
        }
        return value;
    }

    private static String nowIso() {
        return Instant.now().toString();
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizeDigits(String value) {
        return normalizeText(value).replaceAll("\\D+", "");
    }

    private static String normalizeDateInput(String value) {
        String normalized = normalizeText(value);
        if (normalized.matches("^\\d{4}-\\d{2}-\\d{2}$")) {
            return normalized;
        }
        return "";
    }

    private static String quoteJs(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }

    private static String maskMobilePhone(String value) {
        String normalized = normalizeDigits(value);
        if (normalized.length() <= 4) return normalized;
        return "****" + normalized.substring(normalized.length() - 4);
    }

    private static String buildCaptchaSnapshotScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              const captchaInput = document.querySelector('#captcha');
              const group = captchaInput?.closest('.input-group') || document;
              const image = group.querySelector('.code_num img');
              if (!image) {
                return {
                  ready: false,
                  imageReady: false,
                  dataReady: false,
                  dataUrl: '',
                  signature: '',
                  reason: 'image_missing',
                  complete: false,
                  width: 0,
                  height: 0,
                  src: '',
                  currentSrc: '',
                };
              }
              const width = Number(image.naturalWidth || image.width || 0);
              const height = Number(image.naturalHeight || image.height || 0);
              const complete = Boolean(image.complete);
              const src = text(image.getAttribute('src') || image.src || '');
              const currentSrc = text(image.currentSrc || '');
              let dataUrl = '';
              if (/^data:image\\//i.test(src)) {
                dataUrl = src;
              } else {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (context && width > 0 && height > 0) {
                  try {
                    context.drawImage(image, 0, 0, width, height);
                    dataUrl = String(canvas.toDataURL('image/png') || '');
                  } catch (_error) {
                    dataUrl = '';
                  }
                }
              }
              const imageReady = complete && width > 0 && height > 0;
              const dataReady = /^data:image\\/png;base64,/i.test(dataUrl) && dataUrl.length >= 64;
              const ready = imageReady && dataReady;
              const signature = ready
                ? `${src || currentSrc}|${width}x${height}|${dataUrl.slice(0, 64)}|${dataUrl.slice(Math.max(0, dataUrl.length - 64))}|${dataUrl.length}`
                : `${src || currentSrc}|${width}x${height}`;
              return {
                ready,
                imageReady,
                dataReady,
                dataUrl: ready ? dataUrl : '',
                signature,
                reason: ready ? '' : (imageReady ? 'canvas_blocked' : 'image_incomplete'),
                complete,
                width,
                height,
                src,
                currentSrc,
              };
            })();
            """;
    }

    private static CaptchaSnapshot parseCaptchaSnapshot(Object value) {
        if (!(value instanceof JSONObject)) {
            return new CaptchaSnapshot(false, false, false, "", "", "image_missing", false, 0, 0, "", "");
        }
        JSONObject json = (JSONObject) value;
        return new CaptchaSnapshot(
            json.optBoolean("ready", false),
            json.optBoolean("imageReady", false),
            json.optBoolean("dataReady", false),
            json.optString("dataUrl"),
            json.optString("signature"),
            json.optString("reason"),
            json.optBoolean("complete", false),
            json.optInt("width", 0),
            json.optInt("height", 0),
            json.optString("src"),
            json.optString("currentSrc")
        );
    }

    private static String buildRefreshCaptchaScript() {
        return """
            (() => {
              const captchaInput = document.querySelector('#captcha');
              const group = captchaInput?.closest('.input-group') || document;
              const refreshButton = group.querySelector('button[title="更新圖形驗證碼"], button[aria-label="更新圖形驗證碼"]');
              if (!refreshButton) return false;
              refreshButton.click();
              return true;
            })();
            """;
    }

    private static String buildIsLoginPageScript() {
        return """
            (() => Boolean(
              String(location?.href ?? '').includes('/accounts/login')
              || document.querySelector('#mobile_phone')
              || document.querySelector('#password')
              || document.querySelector('#captcha')
            ))();
            """;
    }

    private static String buildSubmitLoginScript(String mobilePhone, String password, String captchaText) {
        return String.format(Locale.US, """
            (() => {
              const mobilePhone = %s;
              const password = %s;
              const captchaText = %s;
              const mobileInput = document.querySelector('#mobile_phone');
              const passwordInput = document.querySelector('#password');
              const captchaInput = document.querySelector('#captcha');
              const submitButton = document.querySelector('#submitBtn');
              if (!mobileInput || !passwordInput || !captchaInput || !submitButton) return false;
              mobileInput.value = mobilePhone;
              passwordInput.value = password;
              captchaInput.value = captchaText;
              mobileInput.dispatchEvent(new Event('input', { bubbles: true }));
              passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
              captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
              mobileInput.dispatchEvent(new Event('change', { bubbles: true }));
              passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
              captchaInput.dispatchEvent(new Event('change', { bubbles: true }));
              submitButton.click();
              return true;
            })();
            """, quoteJs(mobilePhone), quoteJs(password), quoteJs(captchaText));
    }

    private static String buildExtractErrorTextScript() {
        return """
            (() => {
              const candidates = ['.alert', '.error', '.text-danger', '.text-danger p', '.red_text'];
              for (const selector of candidates) {
                const node = document.querySelector(selector);
                const text = String(node?.textContent ?? '').trim();
                if (text) return text;
              }
              return '';
            })();
            """;
    }

    private static String buildSearchPageReadyScript() {
        return """
            (() => Boolean(
              document.querySelector('#carrier')
              && document.querySelector('#status')
              && document.querySelector('button[title="查詢"]')
            ))();
            """;
    }

    private static String buildReadCarrierOptionsScript() {
        return """
            (() => Array.from(document.querySelectorAll('#carrier option')).map((option) => ({
              value: String(option.value || ''),
              label: String(option.textContent || '').trim(),
            })))();
            """;
    }

    private static String buildCaptureLocalStorageItemsScript() {
        return """
            (() => {
              const items = [];
              try {
                for (let index = 0; index < window.localStorage.length; index += 1) {
                  const name = window.localStorage.key(index);
                  if (!name) continue;
                  items.push({
                    name: String(name),
                    value: String(window.localStorage.getItem(name) ?? ''),
                  });
                }
              } catch (_error) {}
              return items;
            })();
            """;
    }

    private static String buildRestoreLocalStorageItemsScript(JSONArray items) {
        return String.format(Locale.US, """
            (() => {
              const items = %s;
              if (!Array.isArray(items)) return false;
              for (const item of items) {
                if (!item || typeof item.name !== 'string') continue;
                window.localStorage.setItem(item.name, String(item.value ?? ''));
              }
              return true;
            })();
            """, items == null ? "[]" : items.toString());
    }

    private static String buildClearLocalStorageScript() {
        return """
            (() => {
              try {
                window.localStorage.clear();
                return true;
              } catch (_error) {
                return false;
              }
            })();
            """;
    }

    private static String buildSubmitQueryScript(JSONObject filter) {
        String dateFrom = normalizeText(filter.optString("dateFrom"));
        String dateTo = normalizeText(filter.optString("dateTo"));
        String carrier = normalizeText(filter.optString("carrier", "all"));
        String status = normalizeText(filter.optString("status", "all"));
        String buyerBan = normalizeText(filter.optString("buyerBan"));
        String productName = normalizeText(filter.optString("productName"));
        String dateRangeLabel = formatDateRangeLabel(dateFrom, dateTo);
        return String.format(Locale.US, """
            (() => {
              const dateRangeLabel = %s;
              const carrier = %s;
              const status = %s;
              const buyerBan = %s;
              const productName = %s;
              const dateInput = document.querySelector('#dp-input-searchInvoiceDate');
              if (dateInput) {
                dateInput.removeAttribute('readonly');
                dateInput.value = dateRangeLabel;
                dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                dateInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const carrierSelect = document.querySelector('#carrier');
              if (carrierSelect) {
                carrierSelect.value = carrier;
                carrierSelect.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const statusSelect = document.querySelector('#status');
              if (statusSelect) {
                statusSelect.value = status;
                statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const buyerBanInput = document.querySelector('#buyerBan');
              if (buyerBanInput) {
                buyerBanInput.value = buyerBan;
                buyerBanInput.dispatchEvent(new Event('input', { bubbles: true }));
                buyerBanInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const productNameInput = document.querySelector('#productName');
              if (productNameInput) {
                productNameInput.value = productName;
                productNameInput.dispatchEvent(new Event('input', { bubbles: true }));
                productNameInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const queryButton = document.querySelector('button[title="查詢"]');
              if (!queryButton) return false;
              queryButton.click();
              return true;
            })();
            """, quoteJs(dateRangeLabel), quoteJs(carrier), quoteJs(status), quoteJs(buyerBan), quoteJs(productName));
    }

    private static String buildWaitForResultsScript() {
        return """
            (() => {
              const table = document.querySelector('table.have_checkbox tbody');
              if (table) return true;
              const bodyText = String(document.body?.innerText ?? '').trim();
              return /查無資料|沒有資料|目前沒有資料|無符合資料/i.test(bodyText);
            })();
            """;
    }

    private static String buildReadInvoicesScript(String selectedStatus) {
        return String.format(Locale.US, """
            (() => {
              const selectedStatus = %s;
              const table = document.querySelector('table.have_checkbox tbody');
              if (!table) return [];
              const rows = Array.from(table.querySelectorAll('tr'));
              const invoices = [];
              for (let index = 0; index < rows.length; index += 1) {
                const row = rows[index];
                const invoiceLink = row.querySelector('a[title]');
                if (!invoiceLink) continue;
                const nextRow = rows[index + 1];
                const cells = row.querySelectorAll('td');
                const carrierLabel = cells[1]?.textContent?.trim() || row.querySelector('.d-md-none')?.textContent?.trim() || '';
                const amountText = cells[3]?.textContent?.trim() || '0';
                const invoiceDateText = cells[4]?.textContent?.trim() || '';
                const sellerName = nextRow?.querySelector('td[colspan]')?.textContent?.trim() || '';
                const buyerBan = cells[6]?.textContent?.trim() || '';
                const normalizedDate = invoiceDateText
                  .replace(/年/g, '-')
                  .replace(/月/g, '-')
                  .replace(/日/g, '')
                  .replace(/\\s+/g, '');
                invoices.push({
                  invoiceNumber: invoiceLink.getAttribute('title') || invoiceLink.textContent?.trim() || '',
                  invoiceDate: normalizedDate,
                  amountMinor: Math.round(Number(amountText.replace(/[^\\d.-]+/g, '')) * 100),
                  sellerName,
                  carrierLabel,
                  buyerBan,
                  invoiceStatus: String(selectedStatus || 'all'),
                  raw: {
                    invoiceNumber: invoiceLink.getAttribute('title') || invoiceLink.textContent?.trim() || '',
                    invoiceDateText,
                    amountText,
                    sellerName,
                    carrierLabel,
                    buyerBan,
                  },
                });
              }
              return invoices;
            })();
            """, quoteJs(selectedStatus));
    }

    private static final class BrowserSession {
        private final WebView webView;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final CookieManager cookieManager = CookieManager.getInstance();
        private final AtomicReference<CountDownLatch> navigationLatchRef = new AtomicReference<>(null);
        private final AtomicReference<String> lastStartedUrlRef = new AtomicReference<>("");
        private final AtomicReference<String> lastFinishedUrlRef = new AtomicReference<>("");

        BrowserSession(Activity activity, WebView webView) throws BankAutomationException {
            this.webView = webView;
            installWebViewClient();
        }

        private void installWebViewClient() throws BankAutomationException {
            runOnUiThreadAndWait(() -> webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    lastStartedUrlRef.set(normalizeText(url));
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    lastStartedUrlRef.set(normalizeText(url));
                    lastFinishedUrlRef.set(normalizeText(url));
                    CountDownLatch latch = navigationLatchRef.getAndSet(null);
                    if (latch != null) {
                        latch.countDown();
                    }
                }
            }));
        }

        void loadUrl(String url) throws BankAutomationException {
            CountDownLatch latch = new CountDownLatch(1);
            navigationLatchRef.set(latch);
            lastStartedUrlRef.set("");
            lastFinishedUrlRef.set("");
            runOnUiThreadAndWait(() -> webView.loadUrl(url));
            waitForNavigation(url, latch);
            waitForCondition("""
                (() => {
                  try {
                    const state = String(document.readyState ?? '').trim().toLowerCase();
                    const href = String(location?.href ?? '').trim().toLowerCase();
                    return Boolean(document.body)
                      && href !== 'about:blank'
                      && (state === 'interactive' || state === 'complete');
                  } catch (_error) {
                    return false;
                  }
                })();
                """, 15_000L, 300L, "einvoice_dom_ready_timeout", "E-invoice page did not become ready in time");
        }

        void ensureSearchPageReady() throws Exception {
            loadUrl(SEARCH_URL);
            if (isLoginPage()) {
                throw createSessionExpiredError();
            }
            waitForCondition(buildSearchPageReadyScript(), 12_000L, 300L, "einvoice_query_form_missing", "E-invoice query form was not ready in time");
        }

        boolean isLoginPage() throws Exception {
            Object result = evaluateJavaScript(buildIsLoginPageScript());
            return Boolean.TRUE.equals(result);
        }

        CaptchaSnapshot waitForCaptchaReady(String previousSignature) throws Exception {
            long deadline = System.currentTimeMillis() + CAPTCHA_READY_TIMEOUT_MS;
            String expectedPrevious = normalizeText(previousSignature);
            long startedAt = System.currentTimeMillis();
            while (System.currentTimeMillis() < deadline) {
                CaptchaSnapshot snapshot = captureCaptchaSnapshot();
                if (snapshot.ready && expectedPrevious.isEmpty()) {
                    return snapshot;
                }
                if (snapshot.ready && !expectedPrevious.equals(snapshot.signature)) {
                    return snapshot;
                }
                if (snapshot.ready && (System.currentTimeMillis() - startedAt) >= CAPTCHA_REFRESH_FALLBACK_READY_MS) {
                    return snapshot;
                }
                sleep(CAPTCHA_READY_POLL_MS);
            }
            throw new BankAutomationException("einvoice_captcha_not_ready", "E-invoice captcha image was not ready in time");
        }

        CaptchaSnapshot refreshCaptcha() throws Exception {
            CaptchaSnapshot previous = captureCaptchaSnapshot();
            Object result = evaluateJavaScript(buildRefreshCaptchaScript());
            if (!Boolean.TRUE.equals(result)) {
                throw new BankAutomationException("einvoice_captcha_refresh_missing", "E-invoice captcha refresh trigger was not found");
            }
            return waitForCaptchaReady(previous.signature);
        }

        void submitLogin(String mobilePhone, String password, String captchaText) throws Exception {
            Object result = evaluateJavaScript(buildSubmitLoginScript(mobilePhone, password, captchaText));
            if (!Boolean.TRUE.equals(result)) {
                throw new BankAutomationException("einvoice_login_trigger_missing", "E-invoice login trigger was not found");
            }
        }

        boolean waitForLoginSuccess() throws Exception {
            long deadline = System.currentTimeMillis() + 15_000L;
            while (System.currentTimeMillis() < deadline) {
                if (isLoginPage()) {
                    sleep(500L);
                    continue;
                }
                Object ready = evaluateJavaScript(buildSearchPageReadyScript());
                if (Boolean.TRUE.equals(ready)) {
                    return true;
                }
                sleep(500L);
            }
            return false;
        }

        String extractErrorText() throws Exception {
            Object result = evaluateJavaScript(buildExtractErrorTextScript());
            return result == null ? "" : String.valueOf(result).trim();
        }

        JSONArray readCarrierOptions() throws Exception {
            Object result = evaluateJavaScript(buildReadCarrierOptionsScript());
            if (result instanceof JSONArray) {
                return (JSONArray) result;
            }
            return new JSONArray();
        }

        JSONArray captureLocalStorageItems() throws Exception {
            Object result = evaluateJavaScript(buildCaptureLocalStorageItemsScript());
            if (result instanceof JSONArray) {
                return (JSONArray) result;
            }
            return new JSONArray();
        }

        void restoreLocalStorageItems(JSONArray items) throws Exception {
            if (items == null || items.length() == 0) return;
            evaluateJavaScript(buildRestoreLocalStorageItemsScript(items));
        }

        void clearLocalStorageItems() throws Exception {
            evaluateJavaScript(buildClearLocalStorageScript());
        }

        void submitQuery(JSONObject filter) throws Exception {
            Object submitted = evaluateJavaScript(buildSubmitQueryScript(filter));
            if (!Boolean.TRUE.equals(submitted)) {
                throw new BankAutomationException("einvoice_query_button_not_found", "E-invoice query button was not found");
            }
            waitForCondition(buildWaitForResultsScript(), 15_000L, 400L, "einvoice_query_failed", "E-invoice query did not finish in time");
            if (isLoginPage()) {
                throw createSessionExpiredError();
            }
        }

        JSONArray readInvoices(String selectedStatus) throws Exception {
            Object result = evaluateJavaScript(buildReadInvoicesScript(selectedStatus));
            if (result instanceof JSONArray) {
                return (JSONArray) result;
            }
            return new JSONArray();
        }

        String captureCookies() throws BankAutomationException {
            String cookies = callOnUiThreadAndWait(() -> cookieManager.getCookie(ORIGIN));
            return cookies == null ? "" : cookies.trim();
        }

        void restoreCookies(String cookieHeader) throws Exception {
            String normalized = normalizeText(cookieHeader);
            if (normalized.isEmpty()) return;
            String[] cookies = normalized.split(";");
            for (String cookie : cookies) {
                String pair = normalizeText(cookie);
                if (pair.isEmpty()) continue;
                CountDownLatch latch = callOnUiThreadAndWait(() -> {
                    CountDownLatch innerLatch = new CountDownLatch(1);
                    cookieManager.setCookie(ORIGIN, pair, value -> innerLatch.countDown());
                    return innerLatch;
                });
                awaitLatch(latch, 5, "einvoice_cookie_set_timeout", "E-invoice cookie write timed out");
            }
            runOnUiThreadAndWait(cookieManager::flush);
        }

        void clearSessionCookies() throws BankAutomationException {
            CountDownLatch latch = callOnUiThreadAndWait(() -> {
                CountDownLatch innerLatch = new CountDownLatch(1);
                cookieManager.removeSessionCookies(value -> innerLatch.countDown());
                return innerLatch;
            });
            awaitLatch(latch, 5, "einvoice_cookie_clear_timeout", "E-invoice cookie clear timed out");
            runOnUiThreadAndWait(cookieManager::flush);
        }

        private CaptchaSnapshot captureCaptchaSnapshot() throws Exception {
            return parseCaptchaSnapshot(evaluateJavaScript(buildCaptchaSnapshotScript()));
        }

        private void waitForNavigation(String requestedUrl, CountDownLatch latch) throws BankAutomationException {
            long deadline = System.currentTimeMillis() + 30_000L;
            while (System.currentTimeMillis() < deadline) {
                try {
                    if (latch.await(350L, TimeUnit.MILLISECONDS)) {
                        return;
                    }
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new BankAutomationException("einvoice_navigation_timeout", "E-invoice page load timed out");
                }
                NavigationSnapshot snapshot = captureNavigationSnapshot();
                if (snapshot.hasReachedRequestedPage(requestedUrl)) {
                    return;
                }
            }
            throw new BankAutomationException("einvoice_navigation_timeout", "E-invoice page load timed out");
        }

        private NavigationSnapshot captureNavigationSnapshot() throws BankAutomationException {
            return callOnUiThreadAndWait(() -> new NavigationSnapshot(
                normalizeText(webView.getUrl()),
                normalizeText(webView.getOriginalUrl()),
                normalizeText(lastStartedUrlRef.get()),
                normalizeText(lastFinishedUrlRef.get()),
                Math.max(0, webView.getProgress())
            ));
        }

        void waitForCondition(String script, long timeoutMs, long pollMs, String code, String message) throws BankAutomationException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                try {
                    Object result = evaluateJavaScript(script);
                    if (Boolean.TRUE.equals(result)) {
                        return;
                    }
                } catch (Exception ignored) {
                }
                sleep(pollMs);
            }
            throw new BankAutomationException(code, message);
        }

        Object evaluateJavaScript(String script) throws Exception {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<String> rawResult = new AtomicReference<>("null");
            runOnUiThreadAndWait(() -> webView.evaluateJavascript(script, new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    rawResult.set(value);
                    latch.countDown();
                }
            }));
            if (!latch.await(20, TimeUnit.SECONDS)) {
                throw new BankAutomationException("einvoice_js_eval_timeout", "E-invoice automation script timed out");
            }
            String value = rawResult.get();
            if (value == null) return null;
            Object parsed = new JSONTokener(value).nextValue();
            if (parsed == JSONObject.NULL) return null;
            return parsed;
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
            awaitLatch(latch, 20, "einvoice_ui_thread_timeout", "E-invoice UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("einvoice_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
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
            awaitLatch(latch, 20, "einvoice_ui_thread_timeout", "E-invoice UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("einvoice_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
            }
            return resultRef.get();
        }

        private void sleep(long ms) {
            try {
                Thread.sleep(Math.max(0L, ms));
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }

        @FunctionalInterface
        private interface UiThreadSupplier<T> {
            T get() throws Exception;
        }
    }

    private static final class NavigationSnapshot {
        final String currentUrl;
        final String originalUrl;
        final String startedUrl;
        final String finishedUrl;
        final int progress;

        NavigationSnapshot(String currentUrl, String originalUrl, String startedUrl, String finishedUrl, int progress) {
            this.currentUrl = currentUrl == null ? "" : currentUrl;
            this.originalUrl = originalUrl == null ? "" : originalUrl;
            this.startedUrl = startedUrl == null ? "" : startedUrl;
            this.finishedUrl = finishedUrl == null ? "" : finishedUrl;
            this.progress = Math.max(0, progress);
        }

        boolean hasReachedRequestedPage(String requestedUrl) {
            if (matchesRequestedUrl(requestedUrl, finishedUrl)) {
                return true;
            }
            if (progress <= 0) {
                return false;
            }
            return (
                matchesRequestedUrl(requestedUrl, currentUrl)
                || matchesRequestedUrl(requestedUrl, originalUrl)
                || matchesRequestedUrl(requestedUrl, startedUrl)
            );
        }

        private boolean matchesRequestedUrl(String requestedUrl, String candidateUrl) {
            String requested = normalizeText(requestedUrl);
            String candidate = normalizeText(candidateUrl);
            if (requested.isEmpty() || candidate.isEmpty()) return false;
            if (candidate.equals(requested)) return true;
            return candidate.startsWith(requested);
        }
    }
}
