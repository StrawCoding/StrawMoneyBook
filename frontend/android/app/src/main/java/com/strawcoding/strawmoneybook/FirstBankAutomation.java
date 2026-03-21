package com.strawcoding.strawmoneybook;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
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
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class FirstBankAutomation {
    private static final String TAG = "FirstBankAutomation";
    private static final String PROVIDER_ID = "first_bank_tw";
    private static final String LOGIN_URL = "https://ibank.firstbank.com.tw/NetBank/index103.html";
    private static final String FRAME_URL = "https://ibank.firstbank.com.tw/NetBank/frame.html";
    private static final String TXN_URL = "https://ibank.firstbank.com.tw/NetBank/2/010103.html";
    private static final int CAPTCHA_MAX_ATTEMPTS = 5;
    private static final int CAPTCHA_EXPECTED_LENGTH = 4;
    private static final int CAPTCHA_MAX_AMBIGUOUS_VARIANTS = 64;
    private static final int CAPTCHA_MIN_TARGET_HEIGHT = 108;
    private static final int CAPTCHA_MIN_DATA_URL_LENGTH = 64;
    private static final long CAPTCHA_READY_TIMEOUT_MS = 12_000L;
    private static final long CAPTCHA_READY_POLL_MS = 250L;
    private static final long CAPTCHA_REFRESH_FALLBACK_READY_MS = 1_500L;
    private static final int MAX_WINDOW_DAYS = 30;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US);

    private FirstBankAutomation() {}

    static final class WeightedCaptchaCandidate {
        final String text;
        final int weight;
        final int variantIndex;
        final String strategy;

        WeightedCaptchaCandidate(String text, int weight) {
            this(text, weight, -1, "unknown");
        }

        WeightedCaptchaCandidate(String text, int weight, int variantIndex, String strategy) {
            this.text = text == null ? "" : text;
            this.weight = Math.max(1, weight);
            this.variantIndex = variantIndex;
            this.strategy = strategy == null ? "unknown" : strategy;
        }
    }

    static final class CaptchaSnapshot {
        final boolean ready;
        final boolean imageReady;
        final boolean dataReady;
        final String dataUrl;
        final String signature;
        final String reason;
        final boolean foundInFrame;
        final int frameDepth;
        final String frameUrl;
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
            boolean foundInFrame,
            int frameDepth,
            String frameUrl,
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
            this.reason = normalizeText(reason);
            this.foundInFrame = foundInFrame;
            this.frameDepth = Math.max(0, frameDepth);
            this.frameUrl = frameUrl == null ? "" : frameUrl;
            this.complete = complete;
            this.width = Math.max(0, width);
            this.height = Math.max(0, height);
            this.src = src == null ? "" : src;
            this.currentSrc = currentSrc == null ? "" : currentSrc;
        }
    }

    public static JSONObject connect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String nationalId = requireUpperText(payload, "nationalId", "first_bank_national_id_required", "First Bank national ID is required");
        String repeatSeq = normalizeText(payload.optString("repeatSeq", "0"));
        if (repeatSeq.isEmpty()) {
            throw new BankAutomationException("first_bank_repeat_seq_required", "First Bank repeat sequence is required");
        }
        String userCode = requireText(payload, "userCode", "first_bank_user_code_required", "First Bank user code is required");
        String password = requireText(payload, "password", "first_bank_password_required", "First Bank password is required");
        String initialSyncStartDate = requireDate(payload.optString("initialSyncStartDate"), "first_bank_initial_start_date_required", "First Bank initial sync start date is required");
        String connectionId = normalizeText(payload.optString("connectionId"));
        if (connectionId.isEmpty()) {
            connectionId = buildConnectionId(nationalId, repeatSeq, userCode);
        }

        BrowserSession session = new BrowserSession(activity, webView);
        debugTrace.record("load_login_page", "running", "Loading First Bank login page");
        session.loadUrl(LOGIN_URL);
        debugTrace.record("load_login_page", "ok", "Login page loaded");
        performLogin(activity, session, debugTrace, nationalId, repeatSeq, userCode, password);
        debugTrace.record("login_complete", "ok", "Login completed");
        debugTrace.record("load_frame_page", "running", "Loading account frame page");
        session.loadUrl(FRAME_URL);
        debugTrace.record("load_frame_page", "ok", "Frame page loaded");
        openMyAccounts(session, debugTrace);
        JSONArray accounts = discoverAccounts(session);
        if (accounts.length() == 0) {
            throw new BankAutomationException("first_bank_account_list_not_found", "First Bank account list was not found after login");
        }
        JSONObject accountDetails = new JSONObject();
        accountDetails.put("count", accounts.length());
        debugTrace.record("discover_accounts", "ok", "Discovered syncable accounts", accountDetails);

        JSONObject state = new JSONObject();
        state.put("provider", PROVIDER_ID);
        state.put("connectionId", connectionId);
        state.put("nationalId", nationalId);
        state.put("repeatSeq", repeatSeq);
        state.put("userCode", userCode);
        state.put("password", password);
        state.put("initialSyncStartDate", initialSyncStartDate);
        state.put("cookieHeader", session.captureCookies());
        state.put("updatedAt", nowIso());
        vault.saveConnectionState(connectionId, state);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("institution_name", "First Bank");
        result.put("connection_id", connectionId);
        result.put("connection_name", "First Bank");
        result.put("accounts", accounts);
        result.put("sync_cursor", buildCursor(initialSyncStartDate));
        result.put("created_at", nowIso());
        return result;
    }

    public static JSONObject sync(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String connectionId = requireText(payload, "connectionId", "first_bank_connection_id_required", "First Bank connection ID is required");
        JSONObject state = vault.getConnectionState(connectionId);
        if (state == null) {
            throw new BankAutomationException("first_bank_legacy_reconnect_required", "First Bank native credentials are missing. Please reconnect this bank account.");
        }

        JSONArray accountIds = payload.optJSONArray("accountIds");
        if (accountIds == null || accountIds.length() == 0) {
            throw new BankAutomationException("first_bank_account_ids_required", "First Bank sync requires at least one account ID");
        }

        String initialSyncStartDate = requireDate(state.optString("initialSyncStartDate"), "first_bank_initial_start_date_missing", "First Bank initial sync start date is missing");
        String lastSyncAt = normalizeText(payload.optString("lastSyncAt"));
        String cursor = normalizeText(payload.optString("cursor"));
        LocalDate startDate = resolveSyncStartDate(initialSyncStartDate, lastSyncAt, cursor);
        LocalDate endDate = LocalDate.now(TAIPEI_ZONE);

        BrowserSession session = new BrowserSession(activity, webView);
        String cookieHeader = normalizeText(state.optString("cookieHeader"));
        if (!cookieHeader.isEmpty()) {
            debugTrace.record("restore_cookies", "running", "Restoring saved bank session cookies");
            session.restoreCookies(cookieHeader);
            debugTrace.record("restore_cookies", "ok", "Cookies restored");
        }

        JSONArray added = new JSONArray();
        boolean reloginAttempted = false;

        for (int accountIndex = 0; accountIndex < accountIds.length(); accountIndex += 1) {
            String accountId = normalizeDigits(accountIds.optString(accountIndex));
            if (accountId.isEmpty()) continue;
            for (DateWindow window : splitDateRange(startDate, endDate)) {
                boolean retryCurrentWindow = true;
                while (retryCurrentWindow) {
                    retryCurrentWindow = false;
                    JSONObject loadDetails = new JSONObject();
                    loadDetails.put("accountId", accountId);
                    loadDetails.put("windowStart", window.startDateBank);
                    loadDetails.put("windowEnd", window.endDateBank);
                    debugTrace.record("load_transaction_page", "running", "Loading transaction page", loadDetails);
                    session.loadUrl(TXN_URL + "?acnt=" + accountId);
                    if (session.isLoginPage()) {
                        if (reloginAttempted) {
                            throw new BankAutomationException("first_bank_session_expired", "First Bank session expired and silent relogin failed");
                        }
                        debugTrace.record("silent_relogin", "running", "Session expired; retrying login");
                        performLogin(
                            activity,
                            session,
                            debugTrace,
                            state.optString("nationalId"),
                            state.optString("repeatSeq", "0"),
                            state.optString("userCode"),
                            state.optString("password")
                        );
                        session.loadUrl(FRAME_URL);
                        debugTrace.record("silent_relogin", "ok", "Silent relogin completed");
                        reloginAttempted = true;
                        retryCurrentWindow = true;
                        continue;
                    }

                    debugTrace.record("transaction_query", "running", "Submitting transaction query", loadDetails);
                    queryTransactions(session, window.startDateBank, window.endDateBank);
                    if (session.isLoginPage()) {
                        if (reloginAttempted) {
                            throw new BankAutomationException("first_bank_session_expired", "First Bank session expired during transaction sync");
                        }
                        debugTrace.record("silent_relogin", "running", "Session expired during transaction query");
                        performLogin(
                            activity,
                            session,
                            debugTrace,
                            state.optString("nationalId"),
                            state.optString("repeatSeq", "0"),
                            state.optString("userCode"),
                            state.optString("password")
                        );
                        debugTrace.record("silent_relogin", "ok", "Silent relogin after query completed");
                        reloginAttempted = true;
                        retryCurrentWindow = true;
                        continue;
                    }

                    JSONArray rows = parseTransactions(session, accountId, window.startDateBank, window.endDateBank);
                    JSONObject parseDetails = new JSONObject(loadDetails.toString());
                    parseDetails.put("rows", rows.length());
                    debugTrace.record("parse_transactions", "ok", "Parsed transaction rows", parseDetails);
                    for (int rowIndex = 0; rowIndex < rows.length(); rowIndex += 1) {
                        added.put(rows.getJSONObject(rowIndex));
                    }
                }
            }
        }

        JSONArray deduped = dedupeTransactions(added);
        state.put("cookieHeader", session.captureCookies());
        state.put("updatedAt", nowIso());
        vault.saveConnectionState(connectionId, state);

        JSONObject result = new JSONObject();
        result.put("provider", PROVIDER_ID);
        result.put("added", deduped);
        result.put("modified", new JSONArray());
        result.put("sync_time", nowIso());
        result.put("next_cursor", buildCursor(initialSyncStartDate));
        return result;
    }

    public static JSONObject disconnect(Activity activity, WebView webView, BankAutomationVault vault, BankAutomationDebugTrace debugTrace, JSONObject payload) throws Exception {
        String connectionId = requireText(payload, "connectionId", "first_bank_connection_id_required", "First Bank connection ID is required");
        vault.deleteConnectionState(connectionId);
        BrowserSession session = new BrowserSession(activity, webView);
        debugTrace.record("clear_session_cookies", "running", "Clearing native session cookies");
        session.clearSessionCookies();
        debugTrace.record("clear_session_cookies", "ok", "Session cookies cleared");

        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("provider", PROVIDER_ID);
        result.put("disconnected_at", nowIso());
        return result;
    }

    static void runThreadAffinityRegressionHarness(Activity activity, WebView webView) throws Exception {
        BrowserSession session = new BrowserSession(activity, webView);
        session.loadUrl("about:blank");
        session.evaluateJavaScript("(() => 'ok')();");
        session.captureCookies();
        session.restoreCookies("thread_affinity_test=1");
        session.captureCookies();
        session.clearSessionCookies();
    }

    private static void performLogin(Activity activity, BrowserSession session, BankAutomationDebugTrace debugTrace, String nationalId, String repeatSeq, String userCode, String password) throws Exception {
        boolean hasRecognizedCaptcha = false;
        debugTrace.record("captcha_wait_ready", "running", "Waiting for captcha image");
        try {
            CaptchaSnapshot initialSnapshot = session.waitForCaptchaReady("");
            debugTrace.record("captcha_wait_ready", "ok", "Captcha image became ready", buildCaptchaTraceDetails(initialSnapshot, ""));
        } catch (BankAutomationException error) {
            if ("first_bank_captcha_not_ready".equals(error.getCode())) {
                debugTrace.record(
                    "captcha_wait_ready",
                    "error",
                    "Captcha image was not ready in time",
                    buildCaptchaTraceDetails(session.getLastCaptchaSnapshot(), "")
                );
            }
            throw error;
        }
        for (int attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt += 1) {
            if (attempt > 0) {
                JSONObject refreshDetails = new JSONObject();
                putJsonValue(refreshDetails, "attempt", attempt + 1);
                debugTrace.record("captcha_refresh", "running", "Refreshing captcha image", refreshDetails);
                try {
                    CaptchaSnapshot refreshedSnapshot = session.refreshCaptcha();
                    mergeJsonDetails(refreshDetails, buildCaptchaTraceDetails(refreshedSnapshot, session.getLastCaptchaSignatureBeforeRefresh()));
                    debugTrace.record("captcha_refresh", "ok", "Captcha image refreshed", refreshDetails);
                } catch (BankAutomationException error) {
                    if ("first_bank_captcha_not_ready".equals(error.getCode())) {
                        mergeJsonDetails(refreshDetails, buildCaptchaTraceDetails(session.getLastCaptchaSnapshot(), session.getLastCaptchaSignatureBeforeRefresh()));
                        debugTrace.record("captcha_refresh", "error", "Captcha refresh did not become ready in time", refreshDetails);
                    }
                    throw error;
                }
            }
            String captchaDataUrl = session.captureCaptchaDataUrl();
            JSONObject attemptDetails = new JSONObject();
            putJsonValue(attemptDetails, "attempt", attempt + 1);
            debugTrace.record("captcha_capture", "ok", "Captured captcha image", attemptDetails);
            String captchaText = recognizeCaptcha(activity, debugTrace, attempt + 1, captchaDataUrl);
            if (captchaText.length() != CAPTCHA_EXPECTED_LENGTH) {
                putJsonValue(attemptDetails, "captchaLength", captchaText.length());
                debugTrace.record("captcha_attempt", "error", "OCR did not produce a valid 4-char code", attemptDetails);
                continue;
            }
            hasRecognizedCaptcha = true;
            putJsonValue(attemptDetails, "captchaLength", captchaText.length());
            debugTrace.record("captcha_attempt", "ok", "OCR produced a valid 4-char code", attemptDetails);
            debugTrace.record("submit_login", "running", "Submitting login form", attemptDetails);
            session.submitLogin(nationalId, repeatSeq, userCode, password, captchaText);
            if (session.waitForLoginSuccess()) {
                debugTrace.record("submit_login", "ok", "Login succeeded", attemptDetails);
                return;
            }
            debugTrace.record("submit_login", "error", "Login response still stayed on login page", attemptDetails);
            session.loadUrl(LOGIN_URL);
        }

        if (!hasRecognizedCaptcha) {
            throw new BankAutomationException("first_bank_captcha_ocr_failed", "First Bank CAPTCHA recognition failed");
        }
        throw new BankAutomationException("first_bank_login_failed", "First Bank login failed");
    }

    private static void openMyAccounts(BrowserSession session, BankAutomationDebugTrace debugTrace) throws Exception {
        debugTrace.record("open_my_accounts", "running", "Opening My Accounts");
        session.openMyAccounts();
        if (!session.waitForAccountsReady()) {
            throw new BankAutomationException("first_bank_account_list_not_found", "First Bank account list was not found");
        }
        debugTrace.record("open_my_accounts", "ok", "My Accounts page is ready");
    }

    private static JSONArray discoverAccounts(BrowserSession session) throws Exception {
        Object result = session.evaluateJavaScript(buildDiscoverAccountsScript());
        if (!(result instanceof JSONArray)) {
            return new JSONArray();
        }
        JSONArray accounts = (JSONArray) result;
        JSONArray normalized = new JSONArray();
        for (int index = 0; index < accounts.length(); index += 1) {
            JSONObject item = accounts.getJSONObject(index);
            String accountId = normalizeDigits(item.optString("account_id"));
            if (accountId.isEmpty()) continue;
            JSONObject account = new JSONObject();
            account.put("account_id", accountId);
            account.put("name", "First Bank " + accountId.substring(Math.max(0, accountId.length() - 4)));
            account.put("mask", accountId.substring(Math.max(0, accountId.length() - 4)));
            account.put("type", normalizeText(item.optString("type")).isEmpty() ? "depository" : item.optString("type"));
            account.put("currency", normalizeText(item.optString("currency")).isEmpty() ? "TWD" : item.optString("currency"));
            normalized.put(account);
        }
        return normalized;
    }

    private static void queryTransactions(BrowserSession session, String startDateBank, String endDateBank) throws Exception {
        if (!session.submitTransactionQuery(startDateBank, endDateBank)) {
            throw new BankAutomationException("first_bank_transaction_query_failed", "First Bank transaction query form was not found");
        }
        if (!session.waitForTransactionTable()) {
            throw new BankAutomationException("first_bank_transaction_query_failed", "First Bank transaction query did not finish in time");
        }
    }

    private static JSONArray parseTransactions(BrowserSession session, String accountId, String startDateBank, String endDateBank) throws Exception {
        Object result = session.evaluateJavaScript(buildParseTransactionsScript(accountId, startDateBank, endDateBank));
        if (!(result instanceof JSONArray)) {
            return new JSONArray();
        }
        return (JSONArray) result;
    }

    private static JSONArray dedupeTransactions(JSONArray transactions) throws Exception {
        JSONArray deduped = new JSONArray();
        List<String> seenKeys = new ArrayList<>();
        for (int index = 0; index < transactions.length(); index += 1) {
            JSONObject item = transactions.getJSONObject(index);
            String key = normalizeText(item.optString("providerAccountId")) + ":" + normalizeText(item.optString("providerTransactionId"));
            if (key.equals(":") || seenKeys.contains(key)) continue;
            seenKeys.add(key);
            deduped.put(item);
        }
        return deduped;
    }

    private static String recognizeCaptcha(Activity activity, BankAutomationDebugTrace debugTrace, int attempt, String dataUrl) {
        String normalized = normalizeText(dataUrl);
        if (!isCaptchaDataUrlUsable(normalized)) {
            Log.d(TAG, "Captcha data URL was empty or incomplete");
            JSONObject details = new JSONObject();
            putJsonValue(details, "attempt", attempt);
            debugTrace.record("captcha_ocr", "error", "Captcha data URL was empty or incomplete", details);
            return "";
        }
        int commaIndex = normalized.indexOf(',');
        byte[] bytes = Base64.decode(normalized.substring(commaIndex + 1), Base64.DEFAULT);
        Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (source == null) {
            Log.d(TAG, "Captcha bitmap decode failed");
            JSONObject details = new JSONObject();
            putJsonValue(details, "attempt", attempt);
            debugTrace.record("captcha_ocr", "error", "Captcha bitmap decode failed", details);
            return "";
        }
        List<Bitmap> variants = buildCaptchaVariants(source);
        List<TesseractBridge.RecognitionCandidate> recognitions = TesseractBridge.recognizeCaptchaCandidates(activity, variants);
        List<WeightedCaptchaCandidate> weightedCandidates = new ArrayList<>();
        for (TesseractBridge.RecognitionCandidate recognition : recognitions) {
            weightedCandidates.add(new WeightedCaptchaCandidate(
                recognition.text,
                recognition.confidence,
                recognition.variantIndex,
                recognition.strategy
            ));
        }
        String selected = selectBestCaptchaCandidateWeighted(weightedCandidates);
        Log.d(TAG, "Captcha OCR source=" + source.getWidth() + "x" + source.getHeight()
            + " variants=" + variants.size()
            + " recognitions=" + recognitions.size()
            + " selected=" + selected
            + " validLength=" + (selected.length() == CAPTCHA_EXPECTED_LENGTH));
        JSONObject details = new JSONObject();
        putJsonValue(details, "attempt", attempt);
        putJsonValue(details, "sourceWidth", source.getWidth());
        putJsonValue(details, "sourceHeight", source.getHeight());
        putJsonValue(details, "variantCount", variants.size());
        putJsonValue(details, "recognitionCount", recognitions.size());
        putJsonValue(details, "selectedLength", selected.length());
        putJsonValue(details, "selected", normalizeCaptchaString(selected));
        debugTrace.record(
            "captcha_ocr",
            selected.length() == CAPTCHA_EXPECTED_LENGTH ? "ok" : "error",
            selected.length() == CAPTCHA_EXPECTED_LENGTH ? "OCR selected a valid captcha candidate" : "OCR did not select a valid captcha candidate",
            details
        );
        for (TesseractBridge.RecognitionCandidate recognition : recognitions) {
            Log.d(TAG, "Captcha candidate strategy=" + recognition.strategy
                + " variant=" + recognition.variantIndex
                + " confidence=" + recognition.confidence
                + " text=" + normalizeCaptchaString(recognition.text));
        }
        dumpCaptchaDebugImages(activity, source, variants, resolveBestCaptchaVariantIndex(selected, weightedCandidates));
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

    private static Bitmap cropCaptchaMargins(Bitmap source) {
        return cropCaptchaMargins(source, 0.04f, 0.08f);
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

        for (int x = 0; x < output.getWidth(); x += 1) {
            for (int y = 0; y < output.getHeight(); y += 1) {
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

    private static void addCaptchaCandidateVariants(List<String> out, String value) {
        String normalized = normalizeCaptchaString(value);
        if (normalized.isEmpty()) return;
        if (normalized.length() <= CAPTCHA_EXPECTED_LENGTH) {
            out.add(normalized);
            return;
        }
        for (int index = 0; index <= normalized.length() - CAPTCHA_EXPECTED_LENGTH; index += 1) {
            out.add(normalized.substring(index, index + CAPTCHA_EXPECTED_LENGTH));
        }
    }

    static String normalizeCaptchaString(String value) {
        return normalizeText(value)
            .replaceAll("[^A-Za-z0-9]", "")
            .toUpperCase(Locale.US)
            .trim();
    }

    static boolean isCaptchaDataUrlUsable(String dataUrl) {
        String normalized = normalizeText(dataUrl);
        int commaIndex = normalized.indexOf(',');
        return normalized.startsWith("data:image/")
            && commaIndex > 0
            && commaIndex < normalized.length() - 1
            && normalized.length() >= CAPTCHA_MIN_DATA_URL_LENGTH;
    }

    static String selectBestCaptchaCandidate(List<String> candidates) {
        List<WeightedCaptchaCandidate> weighted = new ArrayList<>();
        if (candidates == null) {
            return "";
        }
        for (String candidate : candidates) {
            weighted.add(new WeightedCaptchaCandidate(candidate, 50));
        }
        return selectBestCaptchaCandidateWeighted(weighted);
    }

    static String selectBestCaptchaCandidateWeighted(List<WeightedCaptchaCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) return "";
        Map<String, Integer> scores = new LinkedHashMap<>();
        for (WeightedCaptchaCandidate raw : candidates) {
            String candidate = normalizeCaptchaString(raw.text);
            if (candidate.isEmpty()) continue;
            int score = scoreCaptchaCandidate(candidate);
            if (score <= 0) continue;
            int weightedScore = (score * 10) + Math.min(100, Math.max(1, raw.weight));
            scores.put(candidate, scores.getOrDefault(candidate, 0) + weightedScore);
            int ambiguityScore = Math.max(1, weightedScore / 8);
            for (String expanded : expandCaptchaAmbiguousCandidates(candidate)) {
                if (expanded.equals(candidate)) continue;
                scores.put(expanded, scores.getOrDefault(expanded, 0) + ambiguityScore);
            }
        }
        String best = "";
        int bestScore = -1;
        for (Map.Entry<String, Integer> entry : scores.entrySet()) {
            String candidate = entry.getKey();
            int score = entry.getValue();
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
                continue;
            }
            if (score == bestScore && candidate.length() == CAPTCHA_EXPECTED_LENGTH && best.length() != CAPTCHA_EXPECTED_LENGTH) {
                best = candidate;
            }
        }
        if (best.length() == CAPTCHA_EXPECTED_LENGTH) {
            return best;
        }
        return "";
    }

    static String combineCaptchaSegments(List<String> segments) {
        if (segments == null || segments.size() < CAPTCHA_EXPECTED_LENGTH) {
            return "";
        }
        StringBuilder builder = new StringBuilder(CAPTCHA_EXPECTED_LENGTH);
        for (int index = 0; index < CAPTCHA_EXPECTED_LENGTH; index += 1) {
            String normalized = normalizeCaptchaString(segments.get(index));
            if (normalized.isEmpty()) {
                return "";
            }
            builder.append(normalized.charAt(0));
        }
        return builder.length() == CAPTCHA_EXPECTED_LENGTH ? builder.toString() : "";
    }

    static List<String> expandCaptchaAmbiguousCandidates(String candidate) {
        String normalized = normalizeCaptchaString(candidate);
        List<String> results = new ArrayList<>();
        if (normalized.isEmpty()) return results;
        Set<String> seen = new LinkedHashSet<>();
        seen.add(normalized);

        for (int index = 0; index < normalized.length(); index += 1) {
            List<String> snapshot = new ArrayList<>(seen);
            for (String current : snapshot) {
                for (char replacement : getAmbiguousCaptchaReplacements(current.charAt(index))) {
                    if (replacement == current.charAt(index)) continue;
                    String expanded = current.substring(0, index) + replacement + current.substring(index + 1);
                    if (seen.add(expanded) && seen.size() >= CAPTCHA_MAX_AMBIGUOUS_VARIANTS) {
                        return new ArrayList<>(seen);
                    }
                }
            }
        }

        return new ArrayList<>(seen);
    }

    private static char[] getAmbiguousCaptchaReplacements(char value) {
        switch (Character.toUpperCase(value)) {
            case '0':
                return new char[] { 'O', 'Q', 'D' };
            case 'O':
                return new char[] { '0', 'Q', 'D' };
            case 'Q':
                return new char[] { '0', 'O' };
            case 'D':
                return new char[] { '0', 'O' };
            case '1':
                return new char[] { 'I', 'L', 'T' };
            case 'I':
                return new char[] { '1', 'L' };
            case 'L':
                return new char[] { '1', 'I' };
            case 'T':
                return new char[] { '1', 'I' };
            case '2':
                return new char[] { 'Z' };
            case 'Z':
                return new char[] { '2' };
            case '5':
                return new char[] { 'S' };
            case 'S':
                return new char[] { '5' };
            case '6':
                return new char[] { 'G' };
            case 'G':
                return new char[] { '6' };
            case '8':
                return new char[] { 'B' };
            case 'B':
                return new char[] { '8' };
            default:
                return new char[0];
        }
    }

    static int scoreCaptchaCandidate(String candidate) {
        String normalized = normalizeCaptchaString(candidate);
        if (normalized.isEmpty()) return 0;
        if (normalized.length() == CAPTCHA_EXPECTED_LENGTH) return 100;
        if (normalized.length() < CAPTCHA_EXPECTED_LENGTH) return normalized.length() * 10;
        return 5;
    }

    static boolean hasReachedRequestedPageForTest(
        String requestedUrl,
        String currentUrl,
        String originalUrl,
        String startedUrl,
        String finishedUrl,
        int progress
    ) {
        return new NavigationSnapshot(
            currentUrl,
            originalUrl,
            startedUrl,
            finishedUrl,
            progress
        ).hasReachedRequestedPage(requestedUrl);
    }

    static String buildCaptchaSnapshotScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function byId(doc, id) {
                try {
                  if (doc && typeof doc.getElementById === 'function') {
                    const found = doc.getElementById(id);
                    if (found) return found;
                  }
                  return doc ? doc.querySelector(`#${id}`) : null;
                } catch (_error) {
                  return null;
                }
              }
              function collectEntries() {
                const found = [];
                const seen = new Set();
                function visit(win, depth) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    const doc = win.document;
                    found.push({
                      win,
                      doc,
                      depth,
                      url: text(win.location?.href || doc?.URL || ''),
                    });
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index], depth + 1);
                    }
                  } catch (_error) {}
                }
                visit(window, 0);
                return found.filter((entry) => Boolean(entry.doc));
              }
              function buildSignature(dataUrl, src, width, height) {
                if (!dataUrl) return `${src}|${width}x${height}`;
                const head = dataUrl.slice(0, 96);
                const tail = dataUrl.slice(Math.max(0, dataUrl.length - 96));
                let checksum = 0;
                for (let index = 0; index < dataUrl.length; index += Math.max(1, Math.floor(dataUrl.length / 32))) {
                  checksum = ((checksum * 33) + dataUrl.charCodeAt(index)) >>> 0;
                }
                return `${src}|${width}x${height}|${head}|${tail}|${dataUrl.length}|${checksum}`;
              }
              function buildSnapshot(base, dataUrl, reasonOverride) {
                const src = text(base?.src);
                const currentSrc = text(base?.currentSrc);
                const width = Number(base?.width || 0);
                const height = Number(base?.height || 0);
                const imageReady = Boolean(base?.imageReady);
                const dataReady = /^data:image\\/png;base64,/i.test(dataUrl) && dataUrl.length >= 64;
                const ready = imageReady && dataReady;
                const reason = text(reasonOverride || (ready ? '' : base?.reason || (imageReady ? 'canvas_blocked' : 'image_incomplete')));
                const signature = ready
                  ? buildSignature(dataUrl, src || currentSrc, width, height)
                  : `${src || currentSrc}|${width}x${height}`;
                return {
                  ready,
                  imageReady,
                  dataReady,
                  dataUrl: ready ? dataUrl : '',
                  signature,
                  reason,
                  foundInFrame: Boolean(base?.foundInFrame),
                  frameDepth: Number(base?.frameDepth || 0),
                  frameUrl: text(base?.frameUrl),
                  complete: Boolean(base?.complete),
                  width,
                  height,
                  src,
                  currentSrc,
                };
              }
              const entries = collectEntries();
              let candidate = null;
              let htmlMatch = null;
              for (const entry of entries) {
                const image = byId(entry.doc, 'code_verify')
                  || entry.doc.querySelector('img[src*="code_verify"]')
                  || entry.doc.querySelector('img[src*="code_verify1.jpg"]');
                if (!image) {
                  const html = text(entry.doc.documentElement?.outerHTML || '');
                  if (!htmlMatch && /code_verify|code_verify1\\.jpg/i.test(html)) {
                    htmlMatch = {
                      imageReady: false,
                      foundInFrame: entry.depth > 0,
                      frameDepth: entry.depth,
                      frameUrl: entry.url,
                      complete: false,
                      width: 0,
                      height: 0,
                      src: '',
                      currentSrc: '',
                      reason: entry.depth > 0 ? 'frame_mismatch' : 'image_incomplete',
                    };
                  }
                  continue;
                }
                const width = Number(image.naturalWidth || image.width || 0);
                const height = Number(image.naturalHeight || image.height || 0);
                const complete = Boolean(image.complete);
                const src = text(image.getAttribute('src') || image.src || '');
                const currentSrc = text(image.currentSrc || '');
                candidate = {
                  image,
                  width,
                  height,
                  complete,
                  src,
                  currentSrc,
                  imageReady: complete && width > 0 && height > 0,
                  foundInFrame: entry.depth > 0,
                  frameDepth: entry.depth,
                  frameUrl: entry.url,
                  reason: complete && width > 0 && height > 0 ? '' : 'image_incomplete',
                };
                if (candidate.imageReady) break;
              }
              if (!candidate) {
                if (htmlMatch) {
                  return buildSnapshot(htmlMatch, '', htmlMatch.reason);
                }
                return buildSnapshot({
                  imageReady: false,
                  foundInFrame: false,
                  frameDepth: 0,
                  frameUrl: '',
                  complete: false,
                  width: 0,
                  height: 0,
                  src: '',
                  currentSrc: '',
                  reason: 'image_missing',
                }, '', 'image_missing');
              }
              if (!candidate.imageReady) {
                return buildSnapshot(candidate, '', candidate.foundInFrame ? 'frame_mismatch' : 'image_incomplete');
              }
              const canvas = document.createElement('canvas');
              canvas.width = candidate.width;
              canvas.height = candidate.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                return buildSnapshot(candidate, '', 'canvas_blocked');
              }
              ctx.drawImage(candidate.image, 0, 0, candidate.width, candidate.height);
              let dataUrl = '';
              try {
                dataUrl = String(canvas.toDataURL('image/png') || '');
              } catch (_error) {
                dataUrl = '';
              }
              return buildSnapshot(candidate, dataUrl, dataUrl ? '' : 'canvas_blocked');
            })();
            """;
    }

    static String buildFrameAwareLoginPageScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function byId(doc, id) {
                try {
                  if (doc && typeof doc.getElementById === 'function') {
                    const found = doc.getElementById(id);
                    if (found) return found;
                  }
                  return doc ? doc.querySelector(`#${id}`) : null;
                } catch (_error) {
                  return null;
                }
              }
              function collectEntries() {
                const found = [];
                const seen = new Set();
                function visit(win, depth) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    const doc = win.document;
                    found.push({ win, doc, depth, url: text(win.location?.href || doc?.URL || '') });
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index], depth + 1);
                    }
                  } catch (_error) {}
                }
                visit(window, 0);
                return found.filter((entry) => Boolean(entry.doc));
              }
              return collectEntries().some((entry) => Boolean(
                byId(entry.doc, 'loginCustIdFake')
                || byId(entry.doc, 'loginCustSeq')
                || byId(entry.doc, 'loginCustIdRptSeq')
                || byId(entry.doc, 'usrIdInput')
                || byId(entry.doc, 'pwd')
                || byId(entry.doc, 'vrfyCode')
              ));
            })();
            """;
    }

    static String buildPostLoginLandingReadyScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function collectEntries() {
                const found = [];
                const seen = new Set();
                function visit(win, depth) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    const doc = win.document;
                    found.push({ win, doc, depth, url: text(win.location?.href || doc?.URL || '') });
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index], depth + 1);
                    }
                  } catch (_error) {}
                }
                visit(window, 0);
                return found.filter((entry) => Boolean(entry.doc));
              }
              return collectEntries().some((entry) => {
                try {
                  const doc = entry.doc;
                  const bodyText = text(doc.body?.innerText || '');
                  if (/帳戶總覽|我的帳戶/.test(bodyText)) return true;
                  if (typeof entry.win.openIt === 'function') return true;
                  if (doc.querySelector('#btnOpen, #overview-account, #tab1')) return true;
                  const myAccountsLink = Array.from(doc.querySelectorAll('a')).find((anchor) => /我的帳戶/.test(text(anchor.textContent)));
                  return Boolean(myAccountsLink);
                } catch (_error) {
                  return false;
                }
              });
            })();
            """;
    }

    static String buildReplyMessagePageScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function collectDocs() {
                const docs = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    docs.push(win.document);
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index]);
                    }
                  } catch (_error) {}
                }
                visit(window);
                return docs.filter(Boolean);
              }
              return collectDocs().some((doc) => {
                try {
                  const blob = `${text(doc.title)} ${text(doc.body?.innerText)}`;
                  return /訊息回覆頁|系統回覆訊息|登入失敗|資料錯誤|身分證|統一編號|代號|密碼/.test(blob);
                } catch (_error) {
                  return false;
                }
              });
            })();
            """;
    }

    static String buildRefreshCaptchaScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function byId(doc, id) {
                try {
                  if (doc && typeof doc.getElementById === 'function') {
                    const found = doc.getElementById(id);
                    if (found) return found;
                  }
                  return doc ? doc.querySelector(`#${id}`) : null;
                } catch (_error) {
                  return null;
                }
              }
              function collectEntries() {
                const found = [];
                const seen = new Set();
                function visit(win, depth) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    const doc = win.document;
                    found.push({ win, doc, depth, url: text(win.location?.href || doc?.URL || '') });
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index], depth + 1);
                    }
                  } catch (_error) {}
                }
                visit(window, 0);
                return found.filter((entry) => Boolean(entry.doc));
              }
              const entries = collectEntries();
              const captchaEntry = entries.find((entry) => Boolean(byId(entry.doc, 'code_verify') || entry.doc.querySelector('img[src*="code_verify"]')));
              const fallbackEntry = entries.find((entry) => Boolean(
                byId(entry.doc, 'loginCustIdFake')
                || byId(entry.doc, 'usrIdInput')
                || byId(entry.doc, 'pwd')
                || byId(entry.doc, 'vrfyCode')
              ));
              const target = captchaEntry || fallbackEntry || entries[0] || null;
              if (!target) return false;
              if (typeof target.win.chgImg === 'function') {
                target.win.chgImg();
                return true;
              }
              const trigger = Array.from(target.doc.querySelectorAll('a,input[type="button"],button')).find((node) => {
                const onclick = text(typeof node.getAttribute === 'function' ? node.getAttribute('onclick') : '');
                const href = text(typeof node.getAttribute === 'function' ? node.getAttribute('href') : '');
                const value = text(node.value || node.textContent || '');
                return /chgImg\\(/.test(onclick) || /重新產生|驗證碼|更新/.test(value) || /chgImg\\(/.test(href);
              });
              if (trigger && typeof trigger.click === 'function') {
                trigger.click();
                return true;
              }
              return false;
            })();
            """;
    }

    static String buildSubmitLoginScript(String nationalId, String repeatSeq, String userCode, String password, String captchaText) {
        return String.format(Locale.US, """
            (() => {
              const nationalId = %s;
              const repeatSeq = %s;
              const userCode = %s;
              const password = %s;
              const captcha = %s;
              function text(value) { return String(value ?? '').trim(); }
              function byId(doc, id) {
                try {
                  if (doc && typeof doc.getElementById === 'function') {
                    const found = doc.getElementById(id);
                    if (found) return found;
                  }
                  return doc ? doc.querySelector(`#${id}`) : null;
                } catch (_error) {
                  return null;
                }
              }
              function collectEntries() {
                const found = [];
                const seen = new Set();
                function visit(win, depth) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    const doc = win.document;
                    found.push({ win, doc, depth, url: text(win.location?.href || doc?.URL || '') });
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index], depth + 1);
                    }
                  } catch (_error) {}
                }
                visit(window, 0);
                return found.filter((entry) => Boolean(entry.doc));
              }
              const entries = collectEntries();
              const loginEntry = entries.find((entry) => Boolean(
                byId(entry.doc, 'loginCustIdFake')
                || byId(entry.doc, 'usrIdInput')
                || byId(entry.doc, 'pwd')
                || byId(entry.doc, 'vrfyCode')
              ));
              const captchaEntry = entries.find((entry) => Boolean(byId(entry.doc, 'code_verify') || entry.doc.querySelector('img[src*="code_verify"]')));
              const target = loginEntry || captchaEntry || entries[0] || null;
              if (!target) return false;
              function setInput(selector, value) {
                const candidates = selector.split(',').map((part) => text(part).replace(/^#/, '')).filter(Boolean);
                const input = candidates.map((id) => byId(target.doc, id)).find(Boolean);
                if (!input) return false;
                input.removeAttribute('readonly');
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              setInput('#loginCustIdFake', nationalId);
              setInput('#loginCustSeq, #loginCustIdRptSeq', repeatSeq);
              setInput('#usrIdInput', userCode);
              setInput('#pwd', password);
              setInput('#vrfyCode', captcha);
              const coords = (() => {
                const area = target.doc.querySelector('area[href*="clickArea"], area[onclick*="clickArea"]');
                if (!area) return { x: '160', y: '27' };
                const parts = String(area.getAttribute('coords') ?? '')
                  .split(',')
                  .map((part) => Number(String(part ?? '').trim()))
                  .filter((value) => Number.isFinite(value));
                if (parts.length < 4) return { x: '160', y: '27' };
                return {
                  x: String(Math.round((parts[0] + parts[2]) / 2)),
                  y: String(Math.round((parts[1] + parts[3]) / 2)),
                };
              })();
              setInput('#hitXinput, #hitX', coords.x);
              setInput('#hitYinput, #hitY', coords.y);
              const positionInput = byId(target.doc, 'position');
              if (positionInput) {
                positionInput.value = `${coords.x},${coords.y}`;
              }
              if (typeof target.win.clickArea === 'function') {
                target.win.clickArea();
                return true;
              }
              const img = byId(target.doc, 'captchaLoginArea');
              if (img && typeof img.click === 'function') {
                img.click();
                return true;
              }
              const submitInput = Array.from(target.doc.querySelectorAll('input[type="image"],input[type="submit"],input[type="button"],button'))
                .find((node) => /登入|確定|送出/.test(text(node.value || node.textContent || node.getAttribute('alt') || '')));
              if (submitInput && typeof submitInput.click === 'function') {
                submitInput.click();
                return true;
              }
              const form = target.doc.querySelector('form');
              if (form) {
                form.submit();
                return true;
              }
              return false;
            })();
            """, quoteJs(nationalId), quoteJs(repeatSeq), quoteJs(userCode), quoteJs(password), quoteJs(captchaText));
    }

    static CaptchaSnapshot parseCaptchaSnapshot(Object value) {
        if (!(value instanceof JSONObject)) {
            return emptyCaptchaSnapshot("image_missing");
        }
        JSONObject json = (JSONObject) value;
        return new CaptchaSnapshot(
            json.optBoolean("ready", false),
            json.optBoolean("imageReady", false),
            json.optBoolean("dataReady", false),
            json.optString("dataUrl"),
            json.optString("signature"),
            json.optString("reason"),
            json.optBoolean("foundInFrame", false),
            json.optInt("frameDepth", 0),
            json.optString("frameUrl"),
            json.optBoolean("complete", false),
            json.optInt("width", 0),
            json.optInt("height", 0),
            json.optString("src"),
            json.optString("currentSrc")
        );
    }

    static CaptchaSnapshot emptyCaptchaSnapshot(String reason) {
        return new CaptchaSnapshot(false, false, false, "", "", reason, false, 0, "", false, 0, 0, "", "");
    }

    static JSONObject buildCaptchaTraceDetails(CaptchaSnapshot snapshot, String previousSignature) {
        JSONObject details = new JSONObject();
        CaptchaSnapshot safeSnapshot = snapshot == null ? emptyCaptchaSnapshot("image_missing") : snapshot;
        putJsonValue(details, "reason", normalizeText(safeSnapshot.reason));
        putJsonValue(details, "foundInFrame", safeSnapshot.foundInFrame);
        putJsonValue(details, "frameDepth", safeSnapshot.frameDepth);
        putJsonValue(details, "frameUrl", safeSnapshot.frameUrl);
        putJsonValue(details, "complete", safeSnapshot.complete);
        putJsonValue(details, "imageReady", safeSnapshot.imageReady);
        putJsonValue(details, "dataReady", safeSnapshot.dataReady);
        putJsonValue(details, "width", safeSnapshot.width);
        putJsonValue(details, "height", safeSnapshot.height);
        putJsonValue(details, "src", safeSnapshot.src);
        putJsonValue(details, "currentSrc", safeSnapshot.currentSrc);
        putJsonValue(details, "srcChanged", hasCaptchaSignatureChanged(previousSignature, safeSnapshot.signature));
        return details;
    }

    static boolean hasCaptchaSignatureChanged(String previousSignature, String currentSignature) {
        String previous = normalizeText(previousSignature);
        String current = normalizeText(currentSignature);
        if (current.isEmpty()) return false;
        if (previous.isEmpty()) return true;
        return !previous.equals(current);
    }

    private static int resolveBestCaptchaVariantIndex(String selected, List<WeightedCaptchaCandidate> candidates) {
        String normalizedSelected = normalizeCaptchaString(selected);
        if (normalizedSelected.isEmpty() || candidates == null) {
            return -1;
        }
        int bestIndex = -1;
        int bestWeight = -1;
        for (WeightedCaptchaCandidate candidate : candidates) {
            if (!normalizedSelected.equals(normalizeCaptchaString(candidate.text))) continue;
            if (candidate.variantIndex < 0) continue;
            if (candidate.weight > bestWeight) {
                bestWeight = candidate.weight;
                bestIndex = candidate.variantIndex;
            }
        }
        return bestIndex;
    }

    private static void dumpCaptchaDebugImages(Activity activity, Bitmap source, List<Bitmap> variants, int bestVariantIndex) {
        boolean isDebuggable = activity != null
            && (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!isDebuggable || source == null || source.isRecycled()) {
            return;
        }
        try {
            File debugDir = new File(activity.getCacheDir(), "first-bank-captcha-debug");
            if (!debugDir.exists() && !debugDir.mkdirs()) {
                return;
            }
            writeDebugBitmap(new File(debugDir, "source.png"), source);
            if (bestVariantIndex >= 0 && variants != null && bestVariantIndex < variants.size()) {
                writeDebugBitmap(new File(debugDir, "best-variant.png"), variants.get(bestVariantIndex));
            }
        } catch (IOException error) {
            Log.d(TAG, "Failed to write captcha debug images", error);
        }
    }

    private static void writeDebugBitmap(File file, Bitmap bitmap) throws IOException {
        if (bitmap == null || bitmap.isRecycled()) {
            return;
        }
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                throw new IOException("Failed to encode bitmap");
            }
            output.flush();
        }
    }

    private static int clampToColor(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private static LocalDate resolveSyncStartDate(String initialSyncStartDate, String lastSyncAt, String cursor) {
        LocalDate initialDate = parseDate(initialSyncStartDate);
        LocalDate cursorDate = initialDate;
        try {
            if (cursor != null && !cursor.trim().isEmpty()) {
                JSONObject cursorJson = new JSONObject(cursor);
                String initialFromCursor = cursorJson.optString("initialStartDate");
                if (parseDate(initialFromCursor) != null) {
                    cursorDate = parseDate(initialFromCursor);
                }
            }
        } catch (Exception ignored) {
        }

        LocalDate lastSyncDate = parseDateFromInstant(lastSyncAt);
        if (lastSyncDate == null) return cursorDate == null ? LocalDate.now(TAIPEI_ZONE) : cursorDate;
        if (cursorDate == null) return lastSyncDate;
        return lastSyncDate.isAfter(cursorDate) ? lastSyncDate : cursorDate;
    }

    private static List<DateWindow> splitDateRange(LocalDate startDate, LocalDate endDate) {
        List<DateWindow> windows = new ArrayList<>();
        LocalDate cursor = startDate;
        while (!cursor.isAfter(endDate)) {
            LocalDate windowEnd = cursor.plusDays(MAX_WINDOW_DAYS - 1L);
            if (windowEnd.isAfter(endDate)) {
                windowEnd = endDate;
            }
            windows.add(new DateWindow(
                cursor,
                windowEnd,
                formatBankDate(cursor),
                formatBankDate(windowEnd)
            ));
            cursor = windowEnd.plusDays(1L);
        }
        return windows;
    }

    private static String buildCursor(String initialStartDate) throws Exception {
        JSONObject cursor = new JSONObject();
        cursor.put("initialStartDate", initialStartDate);
        return cursor.toString();
    }

    private static void putJsonValue(JSONObject target, String key, Object value) {
        if (target == null || key == null || key.trim().isEmpty()) return;
        try {
            target.put(key, value);
        } catch (JSONException ignored) {
            // Debug metadata should never interrupt the bank automation flow.
        }
    }

    private static void mergeJsonDetails(JSONObject target, JSONObject source) {
        if (target == null || source == null || source.length() == 0) return;
        JSONArray names = source.names();
        if (names == null) return;
        for (int index = 0; index < names.length(); index += 1) {
            String key = names.optString(index, "");
            if (key.isEmpty()) continue;
            putJsonValue(target, key, source.opt(key));
        }
    }

    private static String buildConnectionId(String nationalId, String repeatSeq, String userCode) {
        String source = normalizeText(nationalId).toUpperCase(Locale.US)
            + ":" + normalizeText(repeatSeq)
            + ":" + normalizeText(userCode);
        long hash = 2166136261L;
        for (int index = 0; index < source.length(); index += 1) {
            hash ^= source.charAt(index);
            hash *= 16777619L;
            hash &= 0xffffffffL;
        }
        return "first_bank_identity_" + Long.toString(Math.abs(hash), 36);
    }

    private static String requireText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        String value = normalizeText(payload.optString(key));
        if (value.isEmpty()) {
            throw new BankAutomationException(code, message);
        }
        return value;
    }

    private static String requireUpperText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        return requireText(payload, key, code, message).toUpperCase(Locale.US);
    }

    private static String requireDate(String value, String code, String message) throws BankAutomationException {
        LocalDate parsed = parseDate(value);
        if (parsed == null) {
            throw new BankAutomationException(code, message);
        }
        return parsed.format(DATE_FORMAT);
    }

    private static LocalDate parseDate(String value) {
        String normalized = normalizeText(value);
        if (normalized.isEmpty()) return null;
        try {
            return LocalDate.parse(normalized.substring(0, Math.min(10, normalized.length())), DATE_FORMAT);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static LocalDate parseDateFromInstant(String value) {
        String normalized = normalizeText(value);
        if (normalized.isEmpty()) return null;
        try {
            return Instant.parse(normalized).atZone(TAIPEI_ZONE).toLocalDate();
        } catch (Exception ignored) {
            return parseDate(normalized);
        }
    }

    private static String formatBankDate(LocalDate date) {
        return date.format(DateTimeFormatter.ofPattern("yyyy/MM/dd", Locale.US));
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

    private static String quoteJs(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }

    private static String buildDiscoverAccountsScript() {
        return """
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function collectWindows() {
                const wins = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  wins.push(win);
                  try {
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index]);
                    }
                  } catch (_error) {}
                }
                visit(window);
                return wins;
              }
              function collectEntries() {
                return collectWindows().flatMap((win) => {
                  try {
                    return win.document ? [{ win, doc: win.document }] : [];
                  } catch (_error) {
                    return [];
                  }
                });
              }
              const found = new Map();
              for (const { doc } of collectEntries()) {
                const anchors = Array.from(doc.querySelectorAll('a'));
                for (const anchor of anchors) {
                  const onclick = text(anchor.getAttribute('onclick'));
                  const href = text(anchor.getAttribute('href'));
                  const raw = `${onclick} ${href}`;
                  if (!/010103\\.html|近期交易明細/.test(raw) && !/010103\\.html|近期交易明細/.test(text(anchor.textContent))) continue;
                  const accountMatch = raw.match(/'([0-9]{6,})'/);
                  const accountId = text(accountMatch?.[1]);
                  if (!accountId) continue;
                  const row = anchor.closest('tr');
                  const cells = row ? Array.from(row.querySelectorAll('td,th')).map((cell) => text(cell.textContent).replace(/\\s+/g, ' ')) : [];
                  const type = text(cells[1] ?? '').replace(/\\s+/g, ' ');
                  const currency = /美金|USD/i.test(cells[3] ?? '') ? 'USD' : 'TWD';
                  found.set(accountId, {
                    account_id: accountId,
                    type: type || 'depository',
                    currency,
                  });
                }
              }
              return Array.from(found.values());
            })();
            """;
    }

    private static String buildParseTransactionsScript(String accountId, String startDateBank, String endDateBank) {
        return String.format(Locale.US, """
            (() => {
              const accountId = %s;
              const rangeStart = %s;
              const rangeEnd = %s;
              function text(value) { return String(value ?? '').trim(); }
              function collectWindows() {
                const wins = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  wins.push(win);
                  try {
                    for (let index = 0; index < win.frames.length; index += 1) {
                      visit(win.frames[index]);
                    }
                  } catch (_error) {}
                }
                visit(window);
                return wins;
              }
              function collectDocs() {
                return collectWindows().flatMap((win) => {
                  try {
                    return win.document ? [win.document] : [];
                  } catch (_error) {
                    return [];
                  }
                });
              }
              function parseMinor(value) {
                const source = text(value);
                if (!source) return 0;
                const negative = source.includes('(') || source.includes('-');
                const numeric = source.replace(/[^0-9.]/g, '');
                if (!numeric) return 0;
                const minor = Math.round(Number(numeric) * 100);
                if (!Number.isFinite(minor)) return 0;
                return negative ? minor * -1 : minor;
              }
              function parsePostedAt(value) {
                const match = text(value).match(/(\\d{2,4})[/-](\\d{1,2})[/-](\\d{1,2})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?/);
                if (!match) return '';
                let year = Number(match[1]);
                if (year < 1000) year += 1911;
                const month = String(Number(match[2])).padStart(2, '0');
                const day = String(Number(match[3])).padStart(2, '0');
                const hour = String(Number(match[4] ?? 0)).padStart(2, '0');
                const minute = String(Number(match[5] ?? 0)).padStart(2, '0');
                const second = String(Number(match[6] ?? 0)).padStart(2, '0');
                return new Date(`${String(year).padStart(4, '0')}-${month}-${day}T${hour}:${minute}:${second}+08:00`).toISOString();
              }
              function detectColumns(headers) {
                return headers.map((header, index) => {
                  const value = text(header).toLowerCase();
                  if (value.includes('日期') || value.includes('時間')) return 'postedAt';
                  if (value.includes('交易類別')) return 'transactionType';
                  if (value.includes('支出') || value.includes('提出') || value.includes('借方')) return 'debit';
                  if (value.includes('存入') || value.includes('貸方')) return 'credit';
                  if (value.includes('餘額')) return 'balance';
                  if (value.includes('狀態')) return 'status';
                  if (value.includes('備註')) return 'note';
                  if (value.includes('摘要')) return 'summary';
                  if (value.includes('說明')) return 'description';
                  return `col_${index}`;
                });
              }
              function hash(value) {
                let result = 2166136261;
                for (let index = 0; index < value.length; index += 1) {
                  result ^= value.charCodeAt(index);
                  result = Math.imul(result, 16777619);
                }
                return Math.abs(result >>> 0).toString(36);
              }
              const docs = collectDocs();
              const table = docs.map((doc) => doc.querySelector('table.CnbTable')).find(Boolean);
              if (!table) {
                const textBlob = docs.map((doc) => text(doc.body?.innerText)).join(' ');
                if (/查無資料|沒有資料|no data/i.test(textBlob)) {
                  return [];
                }
                return [];
              }
              const rows = Array.from(table.querySelectorAll('tr')).map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => text(cell.textContent).replace(/\\s+/g, ' ')));
              const headerIndex = rows.findIndex((cells) => cells.some((cell) => /日期|交易類別|支出|存入|餘額|摘要/.test(cell)));
              const headerRow = rows[headerIndex >= 0 ? headerIndex : 0] ?? [];
              const columns = detectColumns(headerRow);
              const items = [];
              for (const cells of rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1)) {
                if (!cells.length) continue;
                const cellMap = {};
                cells.forEach((cell, index) => {
                  cellMap[columns[index] || `col_${index}`] = cell;
                });
                const postedAtText = text(cellMap.postedAt);
                const transactionType = text(cellMap.transactionType);
                const debitMinor = parseMinor(cellMap.debit);
                const creditMinor = parseMinor(cellMap.credit);
                const amountMinor = creditMinor || (debitMinor ? debitMinor * -1 : 0);
                if (!postedAtText || !amountMinor) continue;
                const summary = text(cellMap.summary);
                const note = text(cellMap.note);
                const statusText = text(cellMap.status) || '正常';
                const balanceMinor = parseMinor(cellMap.balance);
                const postedAt = parsePostedAt(postedAtText);
                const sourceText = `${accountId}|${cells.join('|')}`;
                items.push({
                  providerTransactionId: `fbtxn_${hash(sourceText)}`,
                  providerAccountId: accountId,
                  postedAt,
                  amountMinor,
                  balanceMinor: balanceMinor || null,
                  currency: 'TWD',
                  transactionType,
                  note: note || null,
                  summary: summary || null,
                  description: summary || transactionType || note || 'First Bank transaction',
                  merchant: note || '',
                  status: /沖銷/.test(statusText) ? 'reversed' : 'posted',
                  rawJson: JSON.stringify({
                    accountId,
                    rangeStart,
                    rangeEnd,
                    cells,
                  }),
                });
              }
              return items;
            })();
            """, quoteJs(accountId), quoteJs(startDateBank), quoteJs(endDateBank));
    }

    private static final class DateWindow {
        final LocalDate startDate;
        final LocalDate endDate;
        final String startDateBank;
        final String endDateBank;

        DateWindow(LocalDate startDate, LocalDate endDate, String startDateBank, String endDateBank) {
            this.startDate = startDate;
            this.endDate = endDate;
            this.startDateBank = startDateBank;
            this.endDateBank = endDateBank;
        }
    }

    private static final class BrowserSession {
        private final Activity activity;
        private final WebView webView;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final CookieManager cookieManager = CookieManager.getInstance();
        private final AtomicReference<CountDownLatch> navigationLatchRef = new AtomicReference<>(null);
        private final AtomicReference<String> lastStartedUrlRef = new AtomicReference<>("");
        private final AtomicReference<String> lastFinishedUrlRef = new AtomicReference<>("");
        private volatile CaptchaSnapshot lastCaptchaSnapshot = emptyCaptchaSnapshot("image_missing");
        private volatile String lastCaptchaSignatureBeforeRefresh = "";

        BrowserSession(Activity activity, WebView webView) throws BankAutomationException {
            this.activity = activity;
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
                """, 15_000L, 300L, "first_bank_dom_ready_timeout", "First Bank page did not become ready in time");
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
                    throw buildNavigationTimeout(requestedUrl);
                }
                NavigationSnapshot snapshot = captureNavigationSnapshot();
                if (snapshot.hasReachedRequestedPage(requestedUrl)) {
                    return;
                }
            }
            throw buildNavigationTimeout(requestedUrl);
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

        private BankAutomationException buildNavigationTimeout(String requestedUrl) throws BankAutomationException {
            NavigationSnapshot snapshot = captureNavigationSnapshot();
            return new BankAutomationException(
                "first_bank_navigation_timeout",
                String.format(
                    Locale.US,
                    "First Bank page load timed out (requested=%s, current=%s, original=%s, started=%s, finished=%s, progress=%d)",
                    normalizeText(requestedUrl),
                    snapshot.currentUrl,
                    snapshot.originalUrl,
                    snapshot.startedUrl,
                    snapshot.finishedUrl,
                    snapshot.progress
                )
            );
        }

        boolean isLoginPage() throws Exception {
            Object result = evaluateJavaScript(buildFrameAwareLoginPageScript());
            return Boolean.TRUE.equals(result);
        }

        CaptchaSnapshot waitForCaptchaReady(String previousSignature) throws BankAutomationException {
            long deadline = System.currentTimeMillis() + CAPTCHA_READY_TIMEOUT_MS;
            String expectedPrevious = normalizeText(previousSignature);
            long startedAt = System.currentTimeMillis();
            while (System.currentTimeMillis() < deadline) {
                try {
                    CaptchaSnapshot snapshot = captureCaptchaSnapshot();
                    lastCaptchaSnapshot = snapshot;
                    if (snapshot.ready && expectedPrevious.isEmpty()) {
                        return snapshot;
                    }
                    if (snapshot.ready && !expectedPrevious.equals(snapshot.signature)) {
                        return snapshot;
                    }
                    if (snapshot.ready && (System.currentTimeMillis() - startedAt) >= CAPTCHA_REFRESH_FALLBACK_READY_MS) {
                        Log.d(TAG, "Captcha refresh fallback accepted ready image with unchanged signature");
                        return snapshot;
                    }
                } catch (Exception ignored) {
                }
                sleep(CAPTCHA_READY_POLL_MS);
            }
            throw new BankAutomationException("first_bank_captcha_not_ready", "First Bank captcha image was not ready in time");
        }

        String captureCaptchaDataUrl() throws Exception {
            CaptchaSnapshot snapshot = captureCaptchaSnapshot();
            if (!snapshot.ready) {
                snapshot = waitForCaptchaReady("");
            }
            return snapshot.ready ? snapshot.dataUrl : "";
        }

        CaptchaSnapshot refreshCaptcha() throws Exception {
            CaptchaSnapshot previous = captureCaptchaSnapshot();
            lastCaptchaSnapshot = previous;
            lastCaptchaSignatureBeforeRefresh = previous.signature;
            evaluateJavaScript(buildRefreshCaptchaScript());
            return waitForCaptchaReady(previous.signature);
        }

        void submitLogin(String nationalId, String repeatSeq, String userCode, String password, String captchaText) throws Exception {
            Object result = evaluateJavaScript(buildSubmitLoginScript(nationalId, repeatSeq, userCode, password, captchaText));
            if (!Boolean.TRUE.equals(result)) {
                throw new BankAutomationException("first_bank_login_trigger_missing", "First Bank login trigger was not found");
            }
        }

        boolean waitForLoginSuccess() throws Exception {
            long deadline = System.currentTimeMillis() + 15_000L;
            while (System.currentTimeMillis() < deadline) {
                if (!isLoginPage() && Boolean.TRUE.equals(evaluateJavaScript(buildPostLoginLandingReadyScript()))) {
                    return true;
                }
                if (!isLoginPage() && Boolean.TRUE.equals(evaluateJavaScript(buildReplyMessagePageScript()))) {
                    return false;
                }
                sleep(600L);
            }
            return false;
        }

        void openMyAccounts() throws Exception {
            waitForCondition("""
                (() => {
                  function collectWindows() {
                    const wins = [];
                    const seen = new Set();
                    function visit(win) {
                      if (!win || seen.has(win)) return;
                      seen.add(win);
                      wins.push(win);
                      try {
                        for (let index = 0; index < win.frames.length; index += 1) {
                          visit(win.frames[index]);
                        }
                      } catch (_error) {}
                    }
                    visit(window);
                    return wins;
                  }
                  function text(value) {
                    return String(value ?? '').trim();
                  }
                  for (const win of collectWindows()) {
                    try {
                      if (typeof win.openIt === 'function') {
                        return true;
                      }
                    } catch (_error) {}
                  }
                  for (const win of collectWindows()) {
                    try {
                      const doc = win.document;
                      if (!doc) continue;
                      const link = Array.from(doc.querySelectorAll('a')).find((anchor) => /我的帳戶/.test(text(anchor.textContent)));
                      if (link) {
                        return true;
                      }
                    } catch (_error) {}
                  }
                  return false;
                })();
                """, 12_000L, 300L, "first_bank_my_accounts_trigger_missing", "First Bank My Accounts trigger was not ready in time");

            Object result = evaluateJavaScript("""
                (() => {
                  function collectWindows() {
                    const wins = [];
                    const seen = new Set();
                    function visit(win) {
                      if (!win || seen.has(win)) return;
                      seen.add(win);
                      wins.push(win);
                      try {
                        for (let index = 0; index < win.frames.length; index += 1) {
                          visit(win.frames[index]);
                        }
                      } catch (_error) {}
                    }
                    visit(window);
                    return wins;
                  }
                  function text(value) {
                    return String(value ?? '').trim();
                  }
                  for (const win of collectWindows()) {
                    try {
                      if (typeof win.openIt === 'function') {
                        win.openIt();
                        return true;
                      }
                    } catch (_error) {}
                  }
                  for (const win of collectWindows()) {
                    try {
                      const doc = win.document;
                      if (!doc) continue;
                      const link = Array.from(doc.querySelectorAll('a')).find((anchor) => /我的帳戶/.test(text(anchor.textContent)));
                      if (link) {
                        link.click();
                        return true;
                      }
                    } catch (_error) {}
                  }
                  return false;
                })();
                """);
            if (!Boolean.TRUE.equals(result)) {
                throw new BankAutomationException("first_bank_my_accounts_trigger_missing", "First Bank My Accounts trigger was not found");
            }
        }

        boolean waitForAccountsReady() throws Exception {
            long deadline = System.currentTimeMillis() + 12_000L;
            while (System.currentTimeMillis() < deadline) {
                Object result = evaluateJavaScript("""
                    (() => {
                      function hasVisibleAccountOverview(doc) {
                        const overview = doc.querySelector('#overview-account');
                        if (!overview) return false;
                        const view = doc.defaultView || window;
                        const style = view.getComputedStyle ? view.getComputedStyle(overview) : null;
                        return style ? style.display !== 'none' : true;
                      }
                      function hasAccountRows(doc) {
                        const tab = doc.querySelector('#tab1');
                        if (!tab) return false;
                        const tabText = text(tab.textContent);
                        if (!tabText || /資料查詢中/.test(tabText)) return false;
                        const rows = Array.from(tab.querySelectorAll('tr'));
                        return rows.some((row) => {
                          const rowText = text(row.textContent);
                          return /帳號與暱稱|可用餘額|各類帳戶餘額|近期交易明細/.test(rowText)
                            || /selectServiceHref|selectService\\('/.test(String(row.innerHTML ?? ''));
                        });
                      }
                      function collectWindows() {
                        const wins = [];
                        const seen = new Set();
                        function visit(win) {
                          if (!win || seen.has(win)) return;
                          seen.add(win);
                          wins.push(win);
                          try {
                            for (let index = 0; index < win.frames.length; index += 1) {
                              visit(win.frames[index]);
                            }
                          } catch (_error) {}
                        }
                        visit(window);
                        return wins;
                      }
                      function text(value) {
                        return String(value ?? '').trim();
                      }
                      for (const win of collectWindows()) {
                        try {
                          const doc = win.document;
                          if (!doc) continue;
                          if (hasVisibleAccountOverview(doc) && hasAccountRows(doc)) {
                            return true;
                          }
                          const anchors = Array.from(doc.querySelectorAll('a'));
                          if (anchors.some((anchor) => /近期交易明細/.test(text(anchor.textContent)))) {
                            return true;
                          }
                        } catch (_error) {}
                      }
                      return false;
                    })();
                    """);
                if (Boolean.TRUE.equals(result)) {
                    return true;
                }
                sleep(500L);
            }
            return false;
        }

        boolean submitTransactionQuery(String startDateBank, String endDateBank) throws Exception {
            Object result = evaluateJavaScript(String.format(Locale.US, """
                (() => {
                  const startDate = %s;
                  const endDate = %s;
                  const startInput = document.querySelector('#txnStart');
                  const endInput = document.querySelector('#txnEnd');
                  if (!startInput || !endInput) return false;
                  startInput.removeAttribute('readonly');
                  endInput.removeAttribute('readonly');
                  startInput.value = startDate;
                  endInput.value = endDate;
                  startInput.dispatchEvent(new Event('input', { bubbles: true }));
                  endInput.dispatchEvent(new Event('input', { bubbles: true }));
                  if (typeof window.contract === 'function') {
                    window.contract();
                    return true;
                  }
                  const queryButton = Array.from(document.querySelectorAll('input[type="button"],button'))
                    .find((button) => /查詢/.test(String(button.value ?? button.textContent ?? '')));
                  if (queryButton) {
                    queryButton.click();
                    return true;
                  }
                  return false;
                })();
                """, quoteJs(startDateBank), quoteJs(endDateBank)));
            return Boolean.TRUE.equals(result);
        }

        boolean waitForTransactionTable() throws Exception {
            long deadline = System.currentTimeMillis() + 12_000L;
            while (System.currentTimeMillis() < deadline) {
                Object result = evaluateJavaScript("""
                    (() => {
                      const table = document.querySelector('table.CnbTable');
                      const text = String(document.body?.innerText ?? '');
                      return Boolean(table) || /查無資料|沒有資料|no data/i.test(text);
                    })();
                    """);
                if (Boolean.TRUE.equals(result)) {
                    return true;
                }
                sleep(500L);
            }
            return false;
        }

        String captureCookies() throws BankAutomationException {
            String cookies = callOnUiThreadAndWait(() -> cookieManager.getCookie("https://ibank.firstbank.com.tw"));
            return cookies == null ? "" : cookies.trim();
        }

        private CaptchaSnapshot captureCaptchaSnapshot() throws Exception {
            CaptchaSnapshot snapshot = parseCaptchaSnapshot(evaluateJavaScript(buildCaptchaSnapshotScript()));
            lastCaptchaSnapshot = snapshot;
            return snapshot;
        }

        CaptchaSnapshot getLastCaptchaSnapshot() {
            return lastCaptchaSnapshot == null ? emptyCaptchaSnapshot("image_missing") : lastCaptchaSnapshot;
        }

        String getLastCaptchaSignatureBeforeRefresh() {
            return normalizeText(lastCaptchaSignatureBeforeRefresh);
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
                    cookieManager.setCookie("https://ibank.firstbank.com.tw", pair, value -> innerLatch.countDown());
                    return innerLatch;
                });
                awaitLatch(latch, 5, "first_bank_cookie_set_timeout", "First Bank cookie write timed out");
            }
            runOnUiThreadAndWait(cookieManager::flush);
        }

        void clearSessionCookies() throws BankAutomationException {
            CountDownLatch latch = callOnUiThreadAndWait(() -> {
                CountDownLatch innerLatch = new CountDownLatch(1);
                cookieManager.removeSessionCookies(value -> innerLatch.countDown());
                return innerLatch;
            });
            awaitLatch(latch, 5, "first_bank_cookie_clear_timeout", "First Bank cookie clear timed out");
            runOnUiThreadAndWait(cookieManager::flush);
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
            AtomicReference<Exception> errorRef = new AtomicReference<>(null);
            runOnUiThreadAndWait(() -> webView.evaluateJavascript(script, new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    rawResult.set(value);
                    latch.countDown();
                }
            }));
            if (!latch.await(20, TimeUnit.SECONDS)) {
                throw new BankAutomationException("first_bank_js_eval_timeout", "First Bank automation script timed out");
            }
            if (errorRef.get() != null) {
                throw errorRef.get();
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
            awaitLatch(latch, 20, "first_bank_ui_thread_timeout", "First Bank UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("first_bank_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
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
            awaitLatch(latch, 20, "first_bank_ui_thread_timeout", "First Bank UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("first_bank_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
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
            String expected = normalizeText(requestedUrl);
            String candidate = normalizeText(candidateUrl);
            if (expected.isEmpty() || candidate.isEmpty()) return false;
            if (expected.equalsIgnoreCase(candidate)) return true;
            if ("about:blank".equalsIgnoreCase(expected)) {
                return "about:blank".equalsIgnoreCase(candidate);
            }
            return isFirstBankUrl(expected) && isFirstBankUrl(candidate);
        }

        private boolean isFirstBankUrl(String url) {
            String normalized = normalizeText(url).toLowerCase(Locale.US);
            return normalized.startsWith("https://ibank.firstbank.com.tw/");
        }
    }
}
