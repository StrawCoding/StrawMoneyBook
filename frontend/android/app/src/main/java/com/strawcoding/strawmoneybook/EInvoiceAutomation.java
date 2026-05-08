package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class EInvoiceAutomation {
    private static final String TAG = "EInvoiceAutomation";
    static final String LOGIN_URL = "https://www.einvoice.nat.gov.tw/accounts/login";
    static final String QUERY_URL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search";

    private static final String PLATFORM_CHALLENGE_CODE = "einvoice_platform_challenge";
    private static final String PLATFORM_CHALLENGE_MESSAGE =
        "電子發票平台目前擋下內嵌自動化連線，請改用官方 API/後端串接後再啟用自動抓取";
    private static final int CAPTCHA_MAX_ATTEMPTS = 3;
    private static final int CAPTCHA_EXPECTED_LENGTH = 4;
    private static final long CAPTCHA_POLL_MS = 300L;
    private static final long CAPTCHA_READY_TIMEOUT_MS = 15_000L;
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
        String phone = requireText(params, "phone", "einvoice_phone_required", "手機號碼為必填");
        String password = requireText(params, "password", "einvoice_password_required", "密碼為必填");
        String dateFrom = requireText(params, "dateFrom", "einvoice_date_required", "查詢起始日期為必填");
        String dateTo = requireText(params, "dateTo", "einvoice_date_required", "查詢結束日期為必填");
        String invoiceStatus = normalizeText(params.optString("invoiceStatus", "all"));
        String buyerTaxId = normalizeText(params.optString("buyerTaxId", ""));
        String keyword = normalizeText(params.optString("keyword", ""));

        BrowserSession session = new BrowserSession(activity, webView);
        Log.d(TAG, "Loading login page");
        session.loadUrl(LOGIN_URL);
        assertPlatformAllowsAutomation(session, "login");

        performLogin(activity, session, phone, password);
        Log.d(TAG, "Login succeeded");

        JSONArray invoices = fetchInvoices(session, dateFrom, dateTo, invoiceStatus, buyerTaxId, keyword);
        Log.d(TAG, "Fetched invoices count=" + invoices.length());

        JSONObject result = new JSONObject();
        result.put("invoices", invoices);
        return result;
    }

    // ── Login ──────────────────────────────────────────────────────────────────

    private static void performLogin(Activity activity, BrowserSession session, String phone, String password) throws Exception {
        JSONObject carrierSnapshot = selectMobileCarrier(session);
        waitForMobileCarrierLoginFormStable(session, carrierSnapshot);

        for (int attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt++) {
            if (attempt > 0) {
                // Refresh captcha and reload login page if previous attempt failed
                session.evaluateJavaScript(buildRefreshCaptchaScript());
                Thread.sleep(1_000L);
            }

            // Wait for CAPTCHA image to be ready
            String captchaDataUrl = waitForCaptchaReady(session);
            if (captchaDataUrl.isEmpty()) {
                Log.d(TAG, "Captcha not ready on attempt " + (attempt + 1));
                continue;
            }

            // OCR the CAPTCHA (numeric 4-digit)
            String captchaText = recognizeNumericCaptcha(activity, captchaDataUrl);
            if (captchaText.length() != CAPTCHA_EXPECTED_LENGTH) {
                Log.d(TAG, "Captcha OCR result invalid length=" + captchaText.length() + " attempt=" + (attempt + 1));
                continue;
            }

            Log.d(TAG, "Submitting login attempt=" + (attempt + 1));
            Object submitResult = session.evaluateJavaScript(buildSubmitLoginScript(phone, password, captchaText));
            if (!isSubmitLoginResultSuccess(submitResult)) {
                throw new EInvoiceException("einvoice_login_form_missing", describeSubmitLoginFailure(submitResult, carrierSnapshot));
            }

            if (waitForLoginSuccess(session)) {
                return;
            }

            Log.d(TAG, "Login failed attempt=" + (attempt + 1) + ", retrying");
            session.loadUrl(LOGIN_URL);
            carrierSnapshot = selectMobileCarrier(session);
            waitForMobileCarrierLoginFormStable(session, carrierSnapshot);
        }

        throw new EInvoiceException("einvoice_login_failed", "電子發票平台登入失敗，請確認手機號碼、密碼及驗證碼是否正確");
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
        Log.d(TAG, "Login form did not fully stabilize carrier=" + carrierSnapshot + " form=" + lastSnapshot);
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
                    return normalizeText(snapshot.optString("dataUrl", ""));
                }
            }
            Thread.sleep(CAPTCHA_POLL_MS);
        }
        return "";
    }

    private static boolean waitForLoginSuccess(BrowserSession session) throws Exception {
        long deadline = System.currentTimeMillis() + 20_000L;
        while (System.currentTimeMillis() < deadline) {
            boolean onLoginPage = Boolean.TRUE.equals(session.evaluateJavaScript(buildLoginPageDetectScript()));
            if (!onLoginPage) {
                return true;
            }
            Thread.sleep(600L);
        }
        return false;
    }

    // ── Invoice query ──────────────────────────────────────────────────────────

    private static JSONArray fetchInvoices(BrowserSession session, String dateFrom, String dateTo, String invoiceStatus, String buyerTaxId, String keyword) throws Exception {
        // Navigate to query page
        session.loadUrl(QUERY_URL);
        assertPlatformAllowsAutomation(session, "query");

        // Fill query form and submit
        String rocDateFrom = toRocDate(dateFrom);
        String rocDateTo = toRocDate(dateTo);
        boolean formFilled = Boolean.TRUE.equals(session.evaluateJavaScript(
            buildFillQueryFormScript(rocDateFrom, rocDateTo, invoiceStatus, buyerTaxId, keyword)
        ));
        if (!formFilled) {
            throw new EInvoiceException("einvoice_query_form_missing", "找不到發票查詢表單");
        }

        // Wait for results
        long deadline = System.currentTimeMillis() + 30_000L;
        while (System.currentTimeMillis() < deadline) {
            Boolean hasResults = (Boolean) session.evaluateJavaScript(buildWaitForResultsScript());
            if (Boolean.TRUE.equals(hasResults)) break;
            Thread.sleep(500L);
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
            // numeric=true: 4-digit numeric CAPTCHA
            List<TesseractBridge.RecognitionCandidate> candidates = TesseractBridge.recognizeCaptchaCandidates(activity, variants, true);
            String best = selectBestCandidate(candidates);
            // Keep only digits
            String digitsOnly = best.replaceAll("[^0-9]", "");
            Log.d(TAG, "Captcha OCR raw=" + best + " digits=" + digitsOnly);
            return digitsOnly;
        } catch (Exception e) {
            Log.w(TAG, "Captcha OCR failed", e);
            return "";
        }
    }

    private static List<Bitmap> buildCaptchaVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        variants.add(source);
        // Grayscale variant
        Bitmap gray = toGrayscale(source);
        if (gray != null) variants.add(gray);
        // High-contrast variant
        Bitmap contrast = toHighContrast(gray != null ? gray : source);
        if (contrast != null) variants.add(contrast);
        return variants;
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

    private static String selectBestCandidate(List<TesseractBridge.RecognitionCandidate> candidates) {
        String best = "";
        int bestScore = -1;
        for (TesseractBridge.RecognitionCandidate c : candidates) {
            String text = c.text.replaceAll("[^0-9]", "");
            int score = c.confidence * (text.length() == CAPTCHA_EXPECTED_LENGTH ? 2 : 1);
            if (score > bestScore) {
                bestScore = score;
                best = text;
            }
        }
        return best;
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

    private static String buildCaptchaSnapshotScript() {
        return """
            (() => {
              try {
                const img = document.querySelector('#captchaImg, img[id*="captcha"], img[src*="captcha"], img[alt*="驗證碼"], img[alt*="captcha"]');
                if (!img) return { ready: false, reason: 'image_missing' };
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (!img.complete || w === 0 || h === 0) return { ready: false, reason: 'image_incomplete' };
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return { ready: false, reason: 'canvas_blocked' };
                ctx.drawImage(img, 0, 0, w, h);
                let dataUrl = '';
                try { dataUrl = canvas.toDataURL('image/png'); } catch (_) {}
                if (!dataUrl || dataUrl.length < 64) return { ready: false, reason: 'canvas_blocked' };
                return { ready: true, dataUrl };
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
                for (const type of ['input', 'change', 'keyup', 'blur']) {
                  el.dispatchEvent(new Event(type, { bubbles: true }));
                }
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

    private static String buildLoginPageDetectScript() {
        return """
            (() => {
              try {
                // On the login page if we find phone or password input
                return Boolean(
                  document.querySelector('#mobile_phone, input[name="mobile_phone"], #loginPhone, #phoneNo, #phone, #cellphone, #mobile, #carrierMobile, input[name="btc502wQ.userPh"], input[name="phoneNo"], input[type="tel"], input[inputmode="tel"], input[placeholder*="手機"]') ||
                  document.querySelector('#loginPass, #passwd, #password, input[name="btc502wQ.userPasswd"], input[name="passwd"], input[type="password"]') ||
                  document.querySelector('#captcha, #captchaCode, #verifyCode, input[name="captcha"], input[name="verifyCode"], input[placeholder*="驗證碼"]')
                );
              } catch (_) { return false; }
            })();
            """;
    }

    private static String buildFillQueryFormScript(String dateFrom, String dateTo, String status, String buyerTaxId, String keyword) {
        String safeFrom = escapeJs(dateFrom);
        String safeTo = escapeJs(dateTo);
        String safeStatus = escapeJs(status);
        String safeTaxId = escapeJs(buyerTaxId);
        String safeKeyword = escapeJs(keyword);
        return String.format(Locale.US, """
            (() => {
              function setVal(el, value) {
                if (!el) return;
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeInputSetter) {
                  nativeInputSetter.call(el, value);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  el.value = value;
                }
              }
              function setSelect(el, value) {
                if (!el) return;
                for (const opt of el.options) {
                  if (opt.value === value || opt.text.includes(value)) {
                    el.value = opt.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                  }
                }
              }
              // Date range
              const dateFromEl = document.querySelector('#qryDateS, #startDate, input[name*="startDate"], input[name*="dateFrom"]');
              const dateToEl = document.querySelector('#qryDateE, #endDate, input[name*="endDate"], input[name*="dateTo"]');
              setVal(dateFromEl, '%s');
              setVal(dateToEl, '%s');
              // Invoice status
              const statusEl = document.querySelector('#invStatus, select[name*="status"]');
              if (statusEl) setSelect(statusEl, '%s');
              // Buyer tax ID
              const taxIdEl = document.querySelector('#buyerBan, input[name*="buyerBan"], input[name*="taxId"]');
              setVal(taxIdEl, '%s');
              // Keyword
              const keywordEl = document.querySelector('#keyword, input[name*="keyword"]');
              setVal(keywordEl, '%s');
              // Submit
              const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .btn-query, .search-btn, a.btn-primary');
              if (submitBtn) { submitBtn.click(); return true; }
              const form = dateFromEl?.closest('form') || document.querySelector('form');
              if (form) { form.submit(); return true; }
              return false;
            })();
            """, safeFrom, safeTo, safeStatus, safeTaxId, safeKeyword);
    }

    private static String buildWaitForResultsScript() {
        return """
            (() => {
              try {
                // Results table or result count indicator
                return Boolean(
                  document.querySelector('table.inv-list, table[id*="invTable"], .invoice-result, #invResult') ||
                  document.querySelector('tr.inv-row, td.inv-no, td[class*="invoiceNo"]') ||
                  document.querySelector('.no-result, .empty-result, #noData')
                );
              } catch (_) { return false; }
            })();
            """;
    }

    private static String buildParseInvoiceListScript() {
        return """
            (() => {
              try {
                const invoices = [];
                // Try various table selectors for the invoice list
                const rows = Array.from(document.querySelectorAll(
                  'table.inv-list tr:not(:first-child), ' +
                  'table[id*="invTable"] tr:not(:first-child), ' +
                  '#invResult tr.data-row, ' +
                  'tbody tr'
                ));
                for (const row of rows) {
                  const cells = Array.from(row.querySelectorAll('td'));
                  if (cells.length < 3) continue;
                  // Try to find invoice number (format: 2 letters + 8 digits)
                  let invoiceNo = '';
                  let amount = 0;
                  let dateMs = 0;
                  let merchantName = '';
                  let carrierName = '手機條碼';
                  let buyerTaxId = '';
                  for (const cell of cells) {
                    const text = cell.textContent.trim();
                    if (/^[A-Z]{2}\\d{8}$/.test(text) && !invoiceNo) {
                      invoiceNo = text;
                    } else if (/^\\d{1,3}(,\\d{3})*$/.test(text) || /^\\d+$/.test(text)) {
                      const num = parseInt(text.replace(/,/g, ''), 10);
                      if (num > 0 && !amount) amount = num;
                    } else if (/^\\d{3}\\/\\d{2}\\/\\d{2}$/.test(text) || /^\\d{4}-\\d{2}-\\d{2}$/.test(text)) {
                      // ROC date format: YYY/MM/DD or ISO: YYYY-MM-DD
                      try {
                        let parts;
                        if (text.includes('/')) {
                          parts = text.split('/');
                          const year = parseInt(parts[0], 10) + 1911;
                          dateMs = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
                        } else {
                          dateMs = new Date(text).getTime();
                        }
                      } catch (_) {}
                    } else if (text.length > 2 && !merchantName && !/^\\d+$/.test(text)) {
                      merchantName = text;
                    } else if (/^\\d{8}$/.test(text) && !buyerTaxId) {
                      buyerTaxId = text;
                    }
                  }
                  if (invoiceNo) {
                    invoices.push({ invoiceNumber: invoiceNo, amount, invoiceDate: dateMs, merchantName, carrierName, buyerTaxId });
                  }
                }
                // Check if there is a next page button
                const nextPageBtn = document.querySelector('.pagination .next:not(.disabled), a[onclick*="nextPage"]:not([disabled])');
                return { invoices, hasNextPage: Boolean(nextPageBtn) };
              } catch (e) {
                return { invoices: [], hasNextPage: false };
              }
            })();
            """;
    }

    private static String buildGoNextPageScript() {
        return """
            (() => {
              try {
                const nextBtn = document.querySelector('.pagination .next:not(.disabled), a[onclick*="nextPage"]:not([disabled])');
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
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final AtomicReference<CountDownLatch> navigationLatchRef = new AtomicReference<>(null);
        private final AtomicReference<String> lastFinishedUrlRef = new AtomicReference<>("");

        BrowserSession(Activity activity, WebView webView) throws Exception {
            this.activity = activity;
            this.webView = webView;
            installWebViewClient();
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
