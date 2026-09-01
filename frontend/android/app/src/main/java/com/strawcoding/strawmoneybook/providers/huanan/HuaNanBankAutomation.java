package com.strawcoding.strawmoneybook.providers.huanan;

import com.strawcoding.strawmoneybook.BankAutomationDebugTrace;
import com.strawcoding.strawmoneybook.BankAutomationException;
import com.strawcoding.strawmoneybook.BankAutomationVault;
import com.strawcoding.strawmoneybook.TesseractBridge;
import com.strawcoding.strawmoneybook.core.BankAutomationRuntime;
import com.strawcoding.strawmoneybook.core.BankAutomationSyncContract;

import com.strawcoding.strawmoneybook.core.BankSyncContract;
import com.strawcoding.strawmoneybook.core.CaptchaSolver;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Hua Nan Bank (華南銀行) personal netbank automation.
 * H0 = login page contract (done). H1 = structural account list.
 * H2 inquiry form frozen from live portal DOM (2026-09-01):
 * entry {@code trx=com.lb.wibc.trx.InqMain} / label「明細」, form {@code #acct1} + {@code inqtype}
 * + ROC year selects {@code S_Year}/{@code E_Year}, submit {@code doSubmit()}.
 * Phase A records masked h1_probe / h2_probe + observe-only hncb intercept (never replay).
 * See docs/wiki/Sync-Architecture-B.md.
 */
public final class HuaNanBankAutomation {
    private static final String TAG = "HuaNanBankAutomation";
    private static final String PROVIDER_ID = "hua_nan_bank_tw";
    private static final String COOKIE_URL = "https://netbank.hncb.com.tw";
    private static final String LOGIN_URL =
        "https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher?Recognition=private&state=prompt&target=InsAnTr&trx=com.lb.wibc.trx.Login";
    private static final String CAPTCHA_ABS_URL =
        "https://netbank.hncb.com.tw/netbank/pages/jsp/html/CaptchaImage_2.jsp";
    /** Portal: single custom-range inquiry limited to 3 months. */
    static final int MAX_INQUIRY_MONTHS = 3;
    private static final int CAPTCHA_MAX_ATTEMPTS = 5;
    private static final int CAPTCHA_EXPECTED_LENGTH = 4;
    private static final long CAPTCHA_READY_TIMEOUT_MS = 12_000L;
    private static final ZoneId TAIPEI_ZONE = ZoneId.of("Asia/Taipei");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US);
    static final String INTERCEPT_SKIP_REASON_POST = "post_without_body";
    static final String INTERCEPT_SKIP_REASON_OBSERVE_ONLY = "observe_only_no_replay";
    static final int INTERCEPT_PATH_SAMPLE_LIMIT = 12;
    static final String[] H1_PROBE_REQUIRED_KEYS = new String[] {
        "readableFrameCount",
        "opaqueFrameCount",
        "forms",
        "inputs",
        "tableHeaders",
        "tableIds",
        "structuralAccountFieldCount"
    };
    static final String[] H2_PROBE_REQUIRED_KEYS = new String[] {
        "inquiryMatch",
        "hrefPattern",
        "hasTable",
        "hasDateInput",
        "dateFields",
        "queryButtonFound",
        "hasH2FormAnchors",
        "hasEmptyText"
    };

    private HuaNanBankAutomation() {}

    public static JSONObject connect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        String nationalId = requireUpperText(payload, "nationalId", "hua_nan_national_id_required", "Hua Nan national ID is required");
        String userCode = requireText(payload, "userCode", "hua_nan_user_code_required", "Hua Nan user code is required");
        String password = requireText(payload, "password", "hua_nan_password_required", "Hua Nan password is required");
        String initialSyncStartDate = requireDate(
            payload.optString("initialSyncStartDate"),
            "hua_nan_initial_start_date_required",
            "Hua Nan initial sync start date is required"
        );
        String connectionId = normalizeText(payload.optString("connectionId"));
        if (connectionId.isEmpty()) {
            connectionId = buildConnectionId(nationalId, userCode);
        }

        BankAutomationRuntime runtime = new BankAutomationRuntime(activity, webView, vault, debugTrace, PROVIDER_ID);
        bindActiveRuntime(runtime);
        try {
            runtime.enter(BankAutomationRuntime.Phase.LOADING_LOGIN);
            BrowserSession session = new BrowserSession(activity, webView);
            debugTrace.record("load_login_page", "running", "Loading Hua Nan login page");
            session.loadUrl(LOGIN_URL);
            debugTrace.record("load_login_page", "ok", "Login page loaded");
            performLogin(
                activity,
                session,
                debugTrace,
                runtime,
                nationalId,
                userCode,
                password,
                CaptchaSolver.normalize(payload.optString("captchaCode", ""))
            );
            debugTrace.record("login_complete", "ok", "Login completed");
            runtime.enter(BankAutomationRuntime.Phase.DISCOVERING_ACCOUNTS);

            debugTrace.record("h1_probe", "running", "Capturing masked post-login structure");
            JSONObject h1Probe = captureStructuralProbe(session, "h1");
            mergeInterceptSnapshot(h1Probe, session.interceptSnapshot());

            JSONArray accounts = discoverAccounts(session);
            h1Probe.put("accountCount", accounts.length());
            if (accounts.length() == 0) {
                debugTrace.record("h1_probe", "error", "No syncable accounts via structural anchors", h1Probe);
                runtime.markFailed("hua_nan_account_list_not_found", "Hua Nan account list was not found after login");
                throw queryFailure(
                    "hua_nan_account_list_not_found",
                    "Hua Nan account list was not found after login",
                    "account_list_not_found",
                    h1Probe
                );
            }
            debugTrace.record("h1_probe", "ok", "Post-login structure captured", h1Probe);
            JSONObject accountDetails = new JSONObject();
            accountDetails.put("count", accounts.length());
            debugTrace.record("discover_accounts", "ok", "Discovered syncable accounts", accountDetails);

            JSONObject state = new JSONObject();
            state.put("provider", PROVIDER_ID);
            state.put("connectionId", connectionId);
            state.put("nationalId", nationalId);
            state.put("userCode", userCode);
            state.put("password", password);
            state.put("initialSyncStartDate", initialSyncStartDate);
            state.put("cookieHeader", session.captureCookies());
            state.put("updatedAt", nowIso());
            vault.saveConnectionState(connectionId, state);

            runtime.markSuccess(false);
            JSONObject result = new JSONObject();
            result.put("provider", PROVIDER_ID);
            result.put("institution_name", "Hua Nan Bank");
            result.put("provider_connection_id", connectionId);
            result.put("connection_id", connectionId);
            result.put("connection_name", "Hua Nan Bank");
            result.put("accounts", accounts);
            result.put("sync_cursor", buildCursor(initialSyncStartDate));
            result.put("created_at", nowIso());
            result.put("runtime", runtime.snapshot());
            return result;
        } finally {
            clearActiveRuntime(runtime);
        }
    }

    public static JSONObject sync(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        String connectionId = BankSyncContract.resolveVaultConnectionId(vault, payload);
        if (connectionId.isEmpty()) {
            throw new BankAutomationException("hua_nan_connection_id_required", "Hua Nan connection ID is required");
        }
        JSONObject state = vault.getConnectionState(connectionId);
        if (state == null) {
            throw new BankAutomationException(
                "hua_nan_legacy_reconnect_required",
                "Hua Nan native credentials are missing. Please reconnect this bank account."
            );
        }

        JSONArray accountIds = payload.optJSONArray("accountIds");
        if (accountIds == null || accountIds.length() == 0) {
            throw new BankAutomationException("hua_nan_account_ids_required", "Hua Nan sync requires at least one account ID");
        }

        String initialSyncStartDate = requireDate(
            state.optString("initialSyncStartDate"),
            "hua_nan_initial_start_date_missing",
            "Hua Nan initial sync start date is missing"
        );
        String connectionWatermark = BankSyncContract.readLastSyncWatermark(payload);
        int lookbackDays = BankSyncContract.readLookbackDays(payload);
        String cursor = normalizeText(payload.optString("cursor"));
        Map<String, String> accountWatermarks = BankAutomationSyncContract.readAccountWatermarkMap(payload);
        LocalDate endDate = LocalDate.now(TAIPEI_ZONE);
        LocalDate syncStartedDate = endDate;
        String endText = endDate.format(DATE_FORMAT);

        BankAutomationRuntime runtime = new BankAutomationRuntime(activity, webView, vault, debugTrace, PROVIDER_ID);
        bindActiveRuntime(runtime);
        try {
            runtime.enter(BankAutomationRuntime.Phase.SYNCING_TRANSACTIONS);
            BrowserSession session = new BrowserSession(activity, webView);
            String cookieHeader = normalizeText(state.optString("cookieHeader"));
            if (!cookieHeader.isEmpty()) {
                debugTrace.record("restore_cookies", "running", "Restoring saved bank session cookies");
                session.restoreCookies(cookieHeader);
                debugTrace.record("restore_cookies", "ok", "Cookies restored");
            }

            JSONArray added = new JSONArray();
            JSONArray accountResults = new JSONArray();
            boolean reloginAttempted = false;

            for (int accountIndex = 0; accountIndex < accountIds.length(); accountIndex += 1) {
                ensureNotAborted(runtime);
                String accountId = normalizeAccountId(accountIds.optString(accountIndex));
                if (accountId.isEmpty()) continue;
                String accountWatermark = BankAutomationSyncContract.resolveAccountWatermark(
                    accountWatermarks,
                    accountId,
                    connectionWatermark
                );
                LocalDate startDate = BankSyncContract.resolveQueryStartDate(
                    initialSyncStartDate,
                    accountWatermark,
                    cursor,
                    lookbackDays
                );
                List<LocalDate[]> inquiryWindows = splitInquiryWindows(startDate, endDate);
                int accountRowCount = 0;
                try {
                    boolean retryAccount = true;
                    while (retryAccount) {
                        retryAccount = false;
                        accountRowCount = 0;
                        JSONObject lastPostQueryProbe = null;
                        for (LocalDate[] window : inquiryWindows) {
                            ensureNotAborted(runtime);
                            String windowStartText = window[0].format(DATE_FORMAT);
                            String windowEndText = window[1].format(DATE_FORMAT);
                            JSONObject loadDetails = new JSONObject();
                            loadDetails.put("accountMask", maskAccountId(accountId));
                            loadDetails.put("windowStart", windowStartText);
                            loadDetails.put("windowEnd", windowEndText);
                            loadDetails.put("windowCount", inquiryWindows.size());
                            debugTrace.record("load_transaction_page", "running", "Opening transaction inquiry", loadDetails);

                            if (!openTransactionInquiry(session, debugTrace, accountId, windowStartText, windowEndText)) {
                                if (session.isLoginPage()) {
                                    if (reloginAttempted) {
                                        runtime.markFailed("hua_nan_session_expired", "Hua Nan session expired and silent relogin failed");
                                        throw new BankAutomationException(
                                            "hua_nan_session_expired",
                                            "Hua Nan session expired and silent relogin failed"
                                        );
                                    }
                                    debugTrace.record("silent_relogin", "running", "Session expired; retrying login");
                                    performLogin(
                                        activity,
                                        session,
                                        debugTrace,
                                        runtime,
                                        state.optString("nationalId"),
                                        state.optString("userCode"),
                                        state.optString("password"),
                                        ""
                                    );
                                    runtime.enter(BankAutomationRuntime.Phase.SYNCING_TRANSACTIONS);
                                    reloginAttempted = true;
                                    retryAccount = true;
                                    break;
                                }
                                JSONObject missProbe = captureStructuralProbe(session, "h2");
                                mergeInterceptSnapshot(missProbe, session.interceptSnapshot());
                                missProbe.put("inquiryMatch", "none");
                                missProbe.put("reason", "inquiry_not_found");
                                missProbe.put("accountMask", maskAccountId(accountId));
                                debugTrace.record("h2_probe", "error", "Transaction inquiry entry was not found", missProbe);
                                throw queryFailure(
                                    "hua_nan_transaction_query_failed",
                                    "Hua Nan transaction inquiry was not found for account " + maskAccountId(accountId),
                                    "inquiry_not_found",
                                    missProbe
                                );
                            }

                            if (session.isLoginPage()) {
                                if (reloginAttempted) {
                                    runtime.markFailed("hua_nan_session_expired", "Hua Nan session expired during transaction sync");
                                    throw new BankAutomationException(
                                        "hua_nan_session_expired",
                                        "Hua Nan session expired during transaction sync"
                                    );
                                }
                                debugTrace.record("silent_relogin", "running", "Session expired during transaction query");
                                performLogin(
                                    activity,
                                    session,
                                    debugTrace,
                                    runtime,
                                    state.optString("nationalId"),
                                    state.optString("userCode"),
                                    state.optString("password"),
                                    ""
                                );
                                runtime.enter(BankAutomationRuntime.Phase.SYNCING_TRANSACTIONS);
                                reloginAttempted = true;
                                retryAccount = true;
                                break;
                            }

                            JSONArray rows = parseTransactions(session, accountId, windowStartText, windowEndText);
                            JSONObject postQueryProbe = captureStructuralProbe(session, "h2");
                            mergeInterceptSnapshot(postQueryProbe, session.interceptSnapshot());
                            lastPostQueryProbe = postQueryProbe;
                            JSONObject parseDetails = new JSONObject(loadDetails.toString());
                            parseDetails.put("rows", rows.length());
                            parseDetails.put("hasDateInput", postQueryProbe.optBoolean("hasDateInput", false));
                            parseDetails.put("queryButtonFound", postQueryProbe.optBoolean("queryButtonFound", false));
                            parseDetails.put("hasH2FormAnchors", postQueryProbe.optBoolean("hasH2FormAnchors", false));
                            parseDetails.put("hasEmptyText", postQueryProbe.optBoolean("hasEmptyText", false));
                            debugTrace.record("parse_transactions", "ok", "Parsed transaction rows", parseDetails);
                            for (int rowIndex = 0; rowIndex < rows.length(); rowIndex += 1) {
                                added.put(rows.getJSONObject(rowIndex));
                                accountRowCount += 1;
                            }
                        }
                        if (retryAccount) continue;
                        accountResults.put(buildAccountSyncResult(
                            debugTrace,
                            accountId,
                            endDate,
                            syncStartedDate,
                            accountRowCount,
                            lastPostQueryProbe
                        ));
                    }
                } catch (BankAutomationException accountError) {
                    String code = normalizeText(accountError.getCode()).toLowerCase(Locale.ROOT);
                    if ("hua_nan_session_expired".equals(code) || "hua_nan_login_failed".equals(code)
                        || "hua_nan_legacy_reconnect_required".equals(code)
                        || "hua_nan_captcha_manual_required".equals(code)
                        || "bank_automation_aborted".equals(code)) {
                        throw accountError;
                    }
                    accountResults.put(BankAutomationSyncContract.accountResultError(
                        accountId,
                        accountError.getCode(),
                        accountError.getMessage()
                    ));
                } catch (Exception accountError) {
                    accountResults.put(BankAutomationSyncContract.accountResultError(
                        accountId,
                        "hua_nan_account_sync_failed",
                        String.valueOf(accountError.getMessage())
                    ));
                }
            }

            if (accountResults.length() == 0) {
                runtime.markFailed("hua_nan_account_ids_required", "Hua Nan sync requires at least one account ID");
                throw new BankAutomationException("hua_nan_account_ids_required", "Hua Nan sync requires at least one account ID");
            }
            String aggregateStatus = BankAutomationSyncContract.syncStatusFromAccountResults(accountResults);
            if ("error".equals(aggregateStatus)) {
                JSONObject firstError = accountResults.optJSONObject(0);
                String errorCode = firstError == null ? "hua_nan_account_sync_failed" : firstError.optString("code", "hua_nan_account_sync_failed");
                String errorMessage = firstError == null ? "Hua Nan account sync failed" : firstError.optString("message", "Hua Nan account sync failed");
                runtime.markFailed(errorCode, errorMessage);
                throw new BankAutomationException(errorCode, errorMessage);
            }

            JSONArray deduped = dedupeTransactions(added);
            state.put("cookieHeader", session.captureCookies());
            state.put("updatedAt", nowIso());
            vault.saveConnectionState(connectionId, state);

            boolean partial = "partial".equals(aggregateStatus) || "partial_success".equals(aggregateStatus);
            runtime.markSuccess(partial);
            JSONObject result = new JSONObject();
            result.put("provider", PROVIDER_ID);
            result.put("added", deduped);
            result.put("modified", new JSONArray());
            // Only advance connection-level coveredThrough when every account is ok.
            // partial_success must not claim a false watermark that JS would persist.
            if ("ok".equals(aggregateStatus)) {
                String covered = BankAutomationSyncContract.coveredThroughIsoDate(endDate, syncStartedDate);
                result.put("sync_time", covered);
                result.put("coveredThrough", covered);
            }
            result.put("next_cursor", buildCursor(initialSyncStartDate));
            result.put("accountResults", accountResults);
            result.put("sync_status", aggregateStatus);
            result.put("runtime", runtime.snapshot());
            return result;
        } finally {
            clearActiveRuntime(runtime);
        }
    }

    public static JSONObject disconnect(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        String connectionId = BankSyncContract.resolveVaultConnectionId(vault, payload);
        if (connectionId.isEmpty()) {
            throw new BankAutomationException("hua_nan_connection_id_required", "Hua Nan connection ID is required");
        }
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

    private static volatile boolean abortRequested = false;
    private static volatile BankAutomationRuntime activeRuntime = null;

    private static void bindActiveRuntime(BankAutomationRuntime runtime) {
        activeRuntime = runtime;
        abortRequested = false;
    }

    private static void clearActiveRuntime(BankAutomationRuntime runtime) {
        if (activeRuntime == runtime) {
            activeRuntime = null;
        }
    }

    static void requestAbort() {
        abortRequested = true;
        BankAutomationRuntime runtime = activeRuntime;
        if (runtime != null) {
            runtime.markAborted();
        }
    }

    private static void ensureNotAborted() throws BankAutomationException {
        ensureNotAborted(activeRuntime);
    }

    private static void ensureNotAborted(BankAutomationRuntime runtime) throws BankAutomationException {
        if (abortRequested) {
            abortRequested = false;
            if (runtime != null) {
                runtime.markAborted();
            }
            throw new BankAutomationException(
                "bank_automation_aborted",
                "Bank automation was cancelled"
            );
        }
    }

    static JSONObject buildAccountSyncResult(
        BankAutomationDebugTrace debugTrace,
        String accountId,
        LocalDate endDate,
        LocalDate syncStartedDate,
        int accountRowCount,
        JSONObject postQueryProbe
    ) throws Exception {
        boolean hasStructuralAnchors = hasH2InquiryAnchors(postQueryProbe);
        boolean explicitEmpty = postQueryProbe != null && (
            postQueryProbe.optBoolean("hasEmptyText", false)
                || postQueryProbe.optBoolean("emptyInIframe", false)
        );
        // Verifiable parsed rows are enough even on the result page (form anchors may be gone).
        if (accountRowCount > 0) {
            return BankAutomationSyncContract.accountResultOk(
                accountId,
                BankAutomationSyncContract.coveredThroughIsoDate(endDate, syncStartedDate),
                accountRowCount
            );
        }
        if (accountRowCount == 0 && explicitEmpty && hasStructuralAnchors) {
            return BankAutomationSyncContract.accountResultOk(
                accountId,
                BankAutomationSyncContract.coveredThroughIsoDate(endDate, syncStartedDate),
                0
            );
        }
        if (debugTrace != null && postQueryProbe != null) {
            debugTrace.record(
                "h2_probe",
                "error",
                "Transaction query incomplete — missing anchors or unparsed rows",
                postQueryProbe
            );
        }
        return BankAutomationSyncContract.accountResultPartial(
            accountId,
            "hua_nan_transaction_query_partial",
            "Hua Nan transaction query did not yield verifiable rows for account " + maskAccountId(accountId),
            accountRowCount
        );
    }

    /** True when probe reflects frozen H2 form/result anchors (not legacy date-input heuristics alone). */
    static boolean hasH2InquiryAnchors(JSONObject probe) {
        if (probe == null) return false;
        if (probe.optBoolean("hasH2FormAnchors", false)) return true;
        if (probe.optBoolean("hasDateInput", false)) return true;
        if (probe.optBoolean("queryButtonFound", false)) return true;
        if (probe.optBoolean("hasEmptyText", false) || probe.optBoolean("emptyInIframe", false)) return true;
        return false;
    }

    /**
     * Portal custom range is limited to 3 months per submit. Split inclusive [start, end].
     */
    static List<LocalDate[]> splitInquiryWindows(LocalDate start, LocalDate end) {
        List<LocalDate[]> windows = new ArrayList<>();
        if (start == null || end == null) return windows;
        LocalDate from = start;
        LocalDate to = end;
        if (from.isAfter(to)) {
            LocalDate swap = from;
            from = to;
            to = swap;
        }
        while (!from.isAfter(to)) {
            LocalDate windowEnd = from.plusMonths(MAX_INQUIRY_MONTHS).minusDays(1);
            if (windowEnd.isAfter(to)) windowEnd = to;
            windows.add(new LocalDate[] { from, windowEnd });
            from = windowEnd.plusDays(1);
        }
        return windows;
    }

    /** ROC year option value used by Hua Nan selects (2026 → {@code 0115}). */
    static String toRocYearCode(int westernYear) {
        int roc = westernYear - 1911;
        if (roc < 0) roc = 0;
        return String.format(Locale.US, "%04d", roc);
    }

    static String toRocYearCode(LocalDate date) {
        if (date == null) return "";
        return toRocYearCode(date.getYear());
    }

    private static void performLogin(
        Activity activity,
        BrowserSession session,
        BankAutomationDebugTrace debugTrace,
        BankAutomationRuntime runtime,
        String nationalId,
        String userCode,
        String password,
        String manualCaptcha
    ) throws Exception {
        session.waitForLoginForm();
        boolean hasRecognizedCaptcha = false;
        String lastCaptchaDataUrl = "";
        String normalizedManualCaptcha = CaptchaSolver.normalize(manualCaptcha);
        boolean manualCaptchaPending = normalizedManualCaptcha.length() == CAPTCHA_EXPECTED_LENGTH
            && normalizedManualCaptcha.chars().allMatch(Character::isDigit);

        if (runtime != null) {
            runtime.enter(BankAutomationRuntime.Phase.CAPTCHA);
        }
        debugTrace.record("captcha_wait_ready", "running", "Waiting for captcha image");
        session.waitForCaptchaReady("");
        debugTrace.record("captcha_wait_ready", "ok", "Captcha image became ready");

        for (int attempt = 0; attempt < CAPTCHA_MAX_ATTEMPTS; attempt += 1) {
            ensureNotAborted(runtime);
            if (attempt > 0) {
                JSONObject refreshDetails = new JSONObject();
                putJsonValue(refreshDetails, "attempt", attempt + 1);
                debugTrace.record("captcha_refresh", "running", "Refreshing captcha image", refreshDetails);
                session.refreshCaptcha();
                debugTrace.record("captcha_refresh", "ok", "Captcha image refreshed", refreshDetails);
            }

            String captchaDataUrl = session.captureCaptchaDataUrl();
            lastCaptchaDataUrl = captchaDataUrl;
            JSONObject attemptDetails = new JSONObject();
            putJsonValue(attemptDetails, "attempt", attempt + 1);
            debugTrace.record("captcha_capture", "ok", "Captured captcha image", attemptDetails);

            String captchaText;
            if (manualCaptchaPending) {
                captchaText = normalizedManualCaptcha;
                manualCaptchaPending = false;
                putJsonValue(attemptDetails, "source", "manual");
                debugTrace.record("captcha_manual", "ok", "Using user-provided captcha code", attemptDetails);
            } else {
                captchaText = recognizeCaptcha(activity, debugTrace, attempt + 1, captchaDataUrl);
            }

            if (captchaText.length() != CAPTCHA_EXPECTED_LENGTH || !captchaText.chars().allMatch(Character::isDigit)) {
                putJsonValue(attemptDetails, "captchaLength", captchaText.length());
                debugTrace.record("captcha_attempt", "error", "OCR did not produce a valid 4-digit code", attemptDetails);
                continue;
            }
            hasRecognizedCaptcha = true;
            putJsonValue(attemptDetails, "captchaLength", captchaText.length());
            debugTrace.record("captcha_attempt", "ok", "OCR produced a valid 4-digit code", attemptDetails);
            if (runtime != null) {
                runtime.enter(BankAutomationRuntime.Phase.AUTHENTICATING);
            }
            debugTrace.record("submit_login", "running", "Submitting login form via doSubmit", attemptDetails);
            session.submitLogin(nationalId, userCode, password, captchaText);
            if (session.waitForLoginSuccess()) {
                debugTrace.record("submit_login", "ok", "Login succeeded", attemptDetails);
                return;
            }
            debugTrace.record("submit_login", "error", "Still on login page after submit", attemptDetails);
            if (runtime != null) {
                runtime.enter(BankAutomationRuntime.Phase.CAPTCHA);
            }
            session.loadUrl(LOGIN_URL);
            session.waitForLoginForm();
        }

        if (!hasRecognizedCaptcha) {
            if (runtime != null) {
                runtime.markUserInteractionRequired(
                    "hua_nan_captcha_manual_required",
                    "Hua Nan captcha recognition failed. Please enter the captcha manually."
                );
            }
            throw buildManualCaptchaRequiredException(lastCaptchaDataUrl, "USER_INTERACTION_REQUIRED");
        }
        if (runtime != null) {
            runtime.markFailed("hua_nan_login_failed", "Hua Nan login failed");
        }
        throw new BankAutomationException("hua_nan_login_failed", "Hua Nan login failed");
    }

    private static String recognizeCaptcha(Activity activity, BankAutomationDebugTrace debugTrace, int attempt, String dataUrl) {
        String normalized = normalizeText(dataUrl);
        if (!CaptchaSolver.isDataUrlUsable(normalized)) {
            JSONObject details = new JSONObject();
            putJsonValue(details, "attempt", attempt);
            debugTrace.record("captcha_ocr", "error", "Captcha data URL was empty or incomplete", details);
            return "";
        }
        int commaIndex = normalized.indexOf(',');
        byte[] bytes = Base64.decode(normalized.substring(commaIndex + 1), Base64.DEFAULT);
        Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (source == null) {
            JSONObject details = new JSONObject();
            putJsonValue(details, "attempt", attempt);
            debugTrace.record("captcha_ocr", "error", "Captcha bitmap decode failed", details);
            return "";
        }

        List<Bitmap> variants = buildCaptchaVariants(source);
        List<TesseractBridge.RecognitionCandidate> recognitions =
            TesseractBridge.recognizeCaptchaCandidates(activity, variants, true);
        List<CaptchaSolver.WeightedCandidate> weighted = new ArrayList<>();
        for (TesseractBridge.RecognitionCandidate recognition : recognitions) {
            weighted.add(new CaptchaSolver.WeightedCandidate(
                recognition.text,
                recognition.confidence,
                recognition.variantIndex,
                recognition.strategy
            ));
        }
        String selected = CaptchaSolver.selectBestWeighted(weighted);
        selected = CaptchaSolver.normalize(selected).replaceAll("\\D+", "");
        if (selected.length() > CAPTCHA_EXPECTED_LENGTH) {
            selected = selected.substring(0, CAPTCHA_EXPECTED_LENGTH);
        }
        JSONObject details = new JSONObject();
        putJsonValue(details, "attempt", attempt);
        putJsonValue(details, "selected", selected);
        putJsonValue(details, "candidates", recognitions.size());
        debugTrace.record("captcha_ocr", selected.length() == CAPTCHA_EXPECTED_LENGTH ? "ok" : "error", "Hua Nan captcha OCR finished", details);
        return selected;
    }

    private static List<Bitmap> buildCaptchaVariants(Bitmap source) {
        List<Bitmap> variants = new ArrayList<>();
        variants.add(preprocessCaptcha(source, 0, false, 1.2f));
        variants.add(preprocessCaptcha(source, 120, false, 1.5f));
        variants.add(preprocessCaptcha(source, 150, false, 1.6f));
        variants.add(preprocessCaptcha(source, 140, true, 1.5f));
        return variants;
    }

    private static Bitmap preprocessCaptcha(Bitmap source, int threshold, boolean invert, float contrast) {
        int width = Math.max(1, source.getWidth());
        int height = Math.max(1, source.getHeight());
        float scale = Math.max(1.5f, 120f / Math.max(1, height));
        int outW = Math.round(width * scale);
        int outH = Math.round(height * scale);
        Bitmap scaled = Bitmap.createScaledBitmap(source, outW, outH, true);
        Bitmap output = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        ColorMatrix matrix = new ColorMatrix();
        matrix.setSaturation(0f);
        ColorMatrix contrastMatrix = new ColorMatrix(new float[] {
            contrast, 0, 0, 0, 0,
            0, contrast, 0, 0, 0,
            0, 0, contrast, 0, 0,
            0, 0, 0, 1, 0
        });
        matrix.postConcat(contrastMatrix);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        paint.setColorFilter(new ColorMatrixColorFilter(matrix));
        canvas.drawBitmap(scaled, 0, 0, paint);
        if (threshold > 0) {
            int[] pixels = new int[outW * outH];
            output.getPixels(pixels, 0, outW, 0, 0, outW, outH);
            for (int index = 0; index < pixels.length; index += 1) {
                int color = pixels[index];
                int gray = ((color >> 16) & 0xff) * 30 + ((color >> 8) & 0xff) * 59 + (color & 0xff) * 11;
                gray /= 100;
                boolean dark = gray < threshold;
                if (invert) dark = !dark;
                pixels[index] = dark ? 0xFF000000 : 0xFFFFFFFF;
            }
            output.setPixels(pixels, 0, outW, 0, 0, outW, outH);
        }
        if (scaled != source && scaled != output) {
            scaled.recycle();
        }
        return output;
    }

    private static BankAutomationException buildManualCaptchaRequiredException(String dataUrl, String phase) throws JSONException {
        JSONObject data = new JSONObject();
        String base64 = CaptchaSolver.extractPngBase64FromDataUrl(dataUrl);
        if (!base64.isEmpty()) {
            data.put("captchaImageBase64", base64);
        }
        if (phase != null && !phase.isEmpty()) {
            data.put("phase", phase);
        }
        BankAutomationException error = new BankAutomationException(
            "hua_nan_captcha_manual_required",
            "Hua Nan captcha recognition failed. Please enter the captcha manually."
        );
        error.attachData(data);
        return error;
    }

    /** SEMI_MANUAL resume: payload must include captchaCode + same connect credentials. */
    public static JSONObject submitCaptcha(
        Activity activity,
        WebView webView,
        BankAutomationVault vault,
        BankAutomationDebugTrace debugTrace,
        JSONObject payload
    ) throws Exception {
        ensureNotAborted();
        String captchaCode = CaptchaSolver.normalize(payload.optString("captchaCode"));
        if (!CaptchaSolver.validateCaptchaCandidate(captchaCode, true)) {
            throw new BankAutomationException(
                "hua_nan_captcha_invalid",
                "Hua Nan captcha code must be 4 digits"
            );
        }
        JSONObject connectPayload = new JSONObject(payload.toString());
        connectPayload.put("captchaCode", captchaCode);
        debugTrace.record("captcha_manual", "ok", "Resuming connect with user-provided captcha");
        return connect(activity, webView, vault, debugTrace, connectPayload);
    }

    private static BankAutomationException buildManualCaptchaRequiredException(String dataUrl) throws JSONException {
        return buildManualCaptchaRequiredException(dataUrl, "USER_INTERACTION_REQUIRED");
    }

    private static JSONArray discoverAccounts(BrowserSession session) throws Exception {
        Object result = session.evaluateJavaScript("""
            (() => {
              function text(value) { return String(value ?? '').trim(); }
              function digits(value) { return text(value).replace(/\\D+/g, ''); }
              function collectDocs() {
                const docs = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    if (win.document) docs.push(win.document);
                    for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
                  } catch (_e) {}
                }
                visit(window);
                return docs;
              }
              function looksLikeAccountField(name, id) {
                const key = (name + ' ' + id).toLowerCase();
                return /(account|acct|acno|accno|acctno|bankacct|帳號|帳戶)/i.test(key);
              }
              function currencyFrom(blob) {
                return /USD|美金|美元/i.test(blob) ? 'USD' : 'TWD';
              }
              function addAccount(found, rawId, blob, source) {
                const id = digits(rawId);
                if (id.length < 8 || id.length > 16) return;
                if (found.has(id)) return;
                const mask = id.slice(-4);
                found.set(id, {
                  providerAccountId: id,
                  accountName: 'Hua Nan ' + mask,
                  accountMask: mask,
                  currency: currencyFrom(blob),
                  source: source
                });
              }
              const found = new Map();
              for (const doc of collectDocs()) {
                // Structural anchors only — never scan arbitrary page text for digit blobs.
                const fields = Array.from(doc.querySelectorAll(
                  'input[type="hidden"], input[type="text"], input:not([type]), select, option'
                ));
                for (const field of fields) {
                  const name = text(field.getAttribute('name') || '');
                  const idAttr = text(field.getAttribute('id') || '');
                  if (!looksLikeAccountField(name, idAttr)) continue;
                  const value = text(field.value || field.getAttribute('value') || '');
                  addAccount(found, value, name + ' ' + idAttr + ' ' + value, 'input_name');
                }
                for (const el of Array.from(doc.querySelectorAll('[data-account], [data-acct], [data-acno]'))) {
                  const raw = text(
                    el.getAttribute('data-account')
                    || el.getAttribute('data-acct')
                    || el.getAttribute('data-acno')
                    || ''
                  );
                  addAccount(found, raw, raw, 'data_attr');
                }
                for (const el of Array.from(doc.querySelectorAll('a[href], form[action]'))) {
                  const href = text(el.getAttribute('href') || el.getAttribute('action') || '');
                  if (!/[?&](account|acct|acno|acctno)=/i.test(href) && !/[?&]trx=/i.test(href)) continue;
                  try {
                    const url = new URL(href, location.href);
                    for (const key of ['account', 'acct', 'acno', 'acctno', 'Account', 'ACNO']) {
                      const v = url.searchParams.get(key);
                      if (v) addAccount(found, v, href, 'query_param');
                    }
                  } catch (_e) {}
                }
              }
              return Array.from(found.values());
            })();
            """);
        if (!(result instanceof JSONArray)) {
            return new JSONArray();
        }
        JSONArray raw = (JSONArray) result;
        JSONArray normalized = new JSONArray();
        for (int index = 0; index < raw.length(); index += 1) {
            JSONObject item = raw.getJSONObject(index);
            String accountId = normalizeAccountId(item.optString("providerAccountId", item.optString("account_id")));
            if (accountId.isEmpty()) continue;
            String mask = normalizeText(item.optString("accountMask", item.optString("mask")));
            if (mask.isEmpty()) mask = accountId.substring(Math.max(0, accountId.length() - 4));
            String name = normalizeText(item.optString("accountName", item.optString("name")));
            if (name.isEmpty()) name = "Hua Nan " + mask;
            String currency = normalizeText(item.optString("currency"));
            if (currency.isEmpty()) currency = "TWD";
            JSONObject account = new JSONObject();
            account.put("providerAccountId", accountId);
            account.put("accountName", name);
            account.put("accountMask", mask);
            account.put("currency", currency);
            // Compatibility aliases for JS consumers (account_id / name / mask).
            account.put("account_id", accountId);
            account.put("name", name);
            account.put("mask", mask);
            account.put("type", "depository");
            normalized.put(account);
        }
        return normalized;
    }

    private static boolean openTransactionInquiry(
        BrowserSession session,
        BankAutomationDebugTrace debugTrace,
        String accountId,
        String startDate,
        String endDate
    ) throws Exception {
        debugTrace.record("h2_probe", "running", "Capturing masked transaction inquiry structure");
        LocalDate startLocal = parseDate(startDate);
        LocalDate endLocal = parseDate(endDate);
        LocalDate today = LocalDate.now(TAIPEI_ZONE);
        boolean todayOnly = startLocal != null && endLocal != null
            && startLocal.equals(endLocal)
            && startLocal.equals(today);
        String startRocYear = toRocYearCode(startLocal);
        String endRocYear = toRocYearCode(endLocal);
        int startMonth = startLocal == null ? 1 : startLocal.getMonthValue();
        int startDay = startLocal == null ? 1 : startLocal.getDayOfMonth();
        int endMonth = endLocal == null ? 1 : endLocal.getMonthValue();
        int endDay = endLocal == null ? 1 : endLocal.getDayOfMonth();

        Object opened = session.evaluateJavaScript(String.format(Locale.US, """
            (() => {
              const accountId = %s;
              const targetDigits = String(accountId || '').replace(/\\D+/g, '');
              function text(value) { return String(value ?? '').trim(); }
              function digits(value) { return text(value).replace(/\\D+/g, ''); }
              function maskHref(value) {
                return text(value).replace(/\\d{5,}/g, '****').slice(0, 180);
              }
              function collectDocs() {
                const docs = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    if (win.document) docs.push(win.document);
                    for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
                  } catch (_e) {}
                }
                visit(window);
                return docs;
              }
              function clickNode(node) {
                if (!node) return false;
                if (typeof node.click === 'function') {
                  node.click();
                  return true;
                }
                return false;
              }
              function hrefOf(node) {
                return text(node.getAttribute('href') || node.getAttribute('onclick') || '');
              }
              function isInquiryForm(doc) {
                if (!doc) return false;
                const hasAcct = Boolean(doc.querySelector('#acct1, select[name="acct1"]'));
                const hasYear = Boolean(doc.querySelector('select[name="S_Year"], select[name="E_Year"]'));
                const hasSubmit = Boolean(doc.querySelector('a[href*="doSubmit"]'))
                  || (typeof doc.defaultView !== 'undefined' && typeof doc.defaultView.doSubmit === 'function')
                  || (typeof window.doSubmit === 'function');
                const titleHit = /帳戶明細/.test(text(doc.body && doc.body.innerText));
                return (hasAcct && (hasYear || hasSubmit)) || (hasAcct && titleHit);
              }
              for (const doc of collectDocs()) {
                if (isInquiryForm(doc)) {
                  return { clicked: false, alreadyOnForm: true, match: 'already_on_form', hrefPattern: '' };
                }
              }
              function findInqMain(doc) {
                const links = Array.from(doc.querySelectorAll('a[href*="InqMain"], a[href*="inqMain"]'));
                const preferred = links.find((node) => {
                  const href = hrefOf(node);
                  if (!/trx=com\\.lb\\.wibc\\.trx\\.InqMain/i.test(href)) return false;
                  if (!targetDigits) return true;
                  return digits(href).includes(targetDigits) || /acct=/i.test(href);
                });
                if (preferred) return preferred;
                return links.find((node) => /trx=com\\.lb\\.wibc\\.trx\\.InqMain/i.test(hrefOf(node))) || null;
              }
              function findMingxi(doc) {
                return Array.from(doc.querySelectorAll('a')).find((node) => {
                  const label = text(node.textContent || node.value || '');
                  if (label !== '明細') return false;
                  const href = hrefOf(node);
                  if (!targetDigits) return true;
                  return digits(href).includes(targetDigits) || digits(text(node.closest('tr')?.textContent || '')).includes(targetDigits);
                }) || null;
              }
              function findInqAcctParent(doc) {
                const byFn = Array.from(doc.querySelectorAll('a[href*="InqAcctParent"], a[onclick*="InqAcctParent"]'))
                  .find(Boolean);
                if (byFn) return byFn;
                return Array.from(doc.querySelectorAll('a')).find((node) => text(node.textContent) === '帳務查詢') || null;
              }
              for (const doc of collectDocs()) {
                const inq = findInqMain(doc);
                if (inq && clickNode(inq)) {
                  return { clicked: true, alreadyOnForm: false, match: 'inq_main_href', hrefPattern: maskHref(hrefOf(inq)) };
                }
              }
              for (const doc of collectDocs()) {
                const mingxi = findMingxi(doc);
                if (mingxi && clickNode(mingxi)) {
                  return { clicked: true, alreadyOnForm: false, match: 'mingxi_text', hrefPattern: maskHref(hrefOf(mingxi)) };
                }
              }
              for (const doc of collectDocs()) {
                const parent = findInqAcctParent(doc);
                if (parent && clickNode(parent)) {
                  return { clicked: true, alreadyOnForm: false, match: 'inq_acct_parent', hrefPattern: maskHref(hrefOf(parent)), needRetryInqMain: true };
                }
              }
              return { clicked: false, alreadyOnForm: false, match: 'none', hrefPattern: '' };
            })();
            """, quoteJs(accountId)));
        JSONObject clickResult = asJsonObject(opened);
        boolean alreadyOnForm = clickResult.optBoolean("alreadyOnForm", false);
        boolean clicked = clickResult.optBoolean("clicked", false);
        String inquiryMatch = clickResult.optString("match", "none");

        if (clickResult.optBoolean("needRetryInqMain", false)) {
            session.waitForCondition("""
                (() => {
                  try {
                    const links = Array.from(document.querySelectorAll('a[href*="InqMain"]'));
                    return links.some((a) => /trx=com\\.lb\\.wibc\\.trx\\.InqMain/i.test(String(a.getAttribute('href') || '')))
                      || Array.from(document.querySelectorAll('a')).some((a) => String(a.textContent || '').trim() === '明細');
                  } catch (_e) { return false; }
                })();
                """, 12_000L, 400L, "hua_nan_transaction_page_timeout", "Hua Nan account inquiry menu did not expose InqMain");
            Object retry = session.evaluateJavaScript(String.format(Locale.US, """
                (() => {
                  const accountId = %s;
                  const targetDigits = String(accountId || '').replace(/\\D+/g, '');
                  function text(value) { return String(value ?? '').trim(); }
                  function digits(value) { return text(value).replace(/\\D+/g, ''); }
                  function maskHref(value) { return text(value).replace(/\\d{5,}/g, '****').slice(0, 180); }
                  function hrefOf(node) { return text(node.getAttribute('href') || node.getAttribute('onclick') || ''); }
                  const links = Array.from(document.querySelectorAll('a'));
                  const inq = links.find((node) => {
                    const href = hrefOf(node);
                    if (!/trx=com\\.lb\\.wibc\\.trx\\.InqMain/i.test(href)) return false;
                    if (!targetDigits) return true;
                    return digits(href).includes(targetDigits);
                  }) || links.find((node) => text(node.textContent) === '明細');
                  if (inq && typeof inq.click === 'function') {
                    inq.click();
                    return { clicked: true, match: 'inq_main_href_after_parent', hrefPattern: maskHref(hrefOf(inq)) };
                  }
                  return { clicked: false, match: 'none', hrefPattern: '' };
                })();
                """, quoteJs(accountId)));
            JSONObject retryResult = asJsonObject(retry);
            if (!retryResult.optBoolean("clicked", false)) {
                return false;
            }
            clicked = true;
            inquiryMatch = retryResult.optString("match", "inq_main_href_after_parent");
            clickResult.put("hrefPattern", retryResult.optString("hrefPattern", ""));
        }

        if (!alreadyOnForm && !clicked) {
            return false;
        }

        JSONObject h2Probe = captureStructuralProbe(session, "h2");
        putJsonValue(h2Probe, "inquiryMatch", inquiryMatch);
        putJsonValue(h2Probe, "hrefPattern", clickResult.optString("hrefPattern", ""));
        putJsonValue(h2Probe, "accountMask", maskAccountId(accountId));
        mergeInterceptSnapshot(h2Probe, session.interceptSnapshot());
        debugTrace.record("h2_probe", "ok", alreadyOnForm ? "Already on inquiry form" : "Inquiry entry clicked", h2Probe);

        try {
            session.waitForCondition("""
                (() => {
                  function ready(doc) {
                    if (!doc) return false;
                    const text = String(doc.body?.innerText ?? '');
                    const hasAcct = Boolean(doc.querySelector('#acct1, select[name="acct1"]'));
                    const hasYear = Boolean(doc.querySelector('select[name="S_Year"]'));
                    const hasSubmit = Boolean(doc.querySelector('a[href*="doSubmit"]')) || typeof window.doSubmit === 'function';
                    return (hasAcct && (hasYear || hasSubmit)) || /帳戶明細/.test(text);
                  }
                  try {
                    if (ready(document)) return true;
                    for (let i = 0; i < window.frames.length; i += 1) {
                      try { if (ready(window.frames[i].document)) return true; } catch (_e) {}
                    }
                  } catch (_e) {}
                  return false;
                })();
                """, 12_000L, 400L, "hua_nan_transaction_page_timeout", "Hua Nan transaction page did not become ready");
        } catch (BankAutomationException pageError) {
            JSONObject timeoutProbe = captureStructuralProbe(session, "h2");
            mergeInterceptSnapshot(timeoutProbe, session.interceptSnapshot());
            timeoutProbe.put("reason", "page_not_ready");
            timeoutProbe.put("inquiryMatch", inquiryMatch);
            debugTrace.record("h2_probe", "error", "Transaction page did not become ready", timeoutProbe);
            throw queryFailure(
                pageError.getCode(),
                pageError.getMessage(),
                "page_not_ready",
                timeoutProbe
            );
        }

        Object fillRaw = session.evaluateJavaScript(String.format(Locale.US, """
            (() => {
              const accountId = %s;
              const todayOnly = %s;
              const startRocYear = %s;
              const endRocYear = %s;
              const startMonth = %d;
              const startDay = %d;
              const endMonth = %d;
              const endDay = %d;
              function text(value) { return String(value ?? '').trim(); }
              function collectDocs() {
                const docs = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    if (win.document) docs.push({ doc: win.document, win });
                    for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
                  } catch (_e) {}
                }
                visit(window);
                return docs;
              }
              function setSelect(el, value) {
                if (!el) return false;
                const wanted = String(value);
                const opts = Array.from(el.options || []);
                let match = opts.find((o) => String(o.value) === wanted);
                if (!match) match = opts.find((o) => text(o.textContent) === wanted);
                if (!match && /^0+\\d+$/.test(wanted)) {
                  const asInt = String(parseInt(wanted, 10));
                  match = opts.find((o) => String(o.value) === asInt || text(o.textContent) === asInt);
                }
                if (!match) return false;
                el.value = match.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              function checkRadio(doc, name, value) {
                const radio = doc.querySelector('input[type="radio"][name="' + name + '"][value="' + value + '"]');
                if (!radio) return false;
                radio.checked = true;
                radio.click();
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              let target = null;
              for (const item of collectDocs()) {
                if (item.doc.querySelector('#acct1, select[name="acct1"], select[name="S_Year"]')) {
                  target = item;
                  break;
                }
              }
              if (!target) {
                return { ok: false, reason: 'form_not_found', hasDateInput: false, queryButtonFound: false, hasH2FormAnchors: false };
              }
              const doc = target.doc;
              const win = target.win || window;
              const acct = doc.querySelector('#acct1, select[name="acct1"]');
              let acctSet = false;
              if (acct) {
                acctSet = setSelect(acct, accountId);
                if (typeof win.changeAcct === 'function') {
                  try { win.changeAcct(0); } catch (_e) {}
                }
              }
              let inqType = todayOnly ? '1' : '3';
              checkRadio(doc, 'inqtype', inqType);
              if (typeof win.changeInqType === 'function') {
                try { win.changeInqType(); } catch (_e) {}
              }
              let datesFilled = todayOnly;
              if (!todayOnly) {
                const sY = setSelect(doc.querySelector('select[name="S_Year"]'), startRocYear);
                const sM = setSelect(doc.querySelector('select[name="S_Month"]'), startMonth);
                const sD = setSelect(doc.querySelector('select[name="S_Date"]'), startDay);
                const eY = setSelect(doc.querySelector('select[name="E_Year"]'), endRocYear);
                const eM = setSelect(doc.querySelector('select[name="E_Month"]'), endMonth);
                const eD = setSelect(doc.querySelector('select[name="E_Date"]'), endDay);
                datesFilled = sY && sM && sD && eY && eM && eD;
                if (typeof win.changeInqType === 'function') {
                  try { win.changeInqType(); } catch (_e) {}
                }
              }
              checkRadio(doc, 'ApplyType', '0');
              const preType = doc.querySelector('select[name="preType"]');
              if (preType) setSelect(preType, '0');
              let submitted = false;
              if (typeof win.doSubmit === 'function') {
                try { win.doSubmit(); submitted = true; } catch (_e) {}
              }
              if (!submitted) {
                const link = doc.querySelector('a[href*="doSubmit"]');
                if (link && typeof link.click === 'function') {
                  link.click();
                  submitted = true;
                }
              }
              const hasYear = Boolean(doc.querySelector('select[name="S_Year"], select[name="E_Year"]'));
              const hasSubmit = Boolean(doc.querySelector('a[href*="doSubmit"]')) || typeof win.doSubmit === 'function';
              return {
                ok: submitted && (todayOnly || datesFilled),
                acctSet,
                datesFilled,
                submitted,
                inqType,
                hasDateInput: hasYear,
                queryButtonFound: hasSubmit,
                hasH2FormAnchors: Boolean(acct) && hasYear && hasSubmit,
              };
            })();
            """,
            quoteJs(accountId),
            todayOnly ? "true" : "false",
            quoteJs(startRocYear),
            quoteJs(endRocYear),
            startMonth,
            startDay,
            endMonth,
            endDay
        ));
        JSONObject fillMeta = asJsonObject(fillRaw);
        JSONObject fillResult = captureStructuralProbe(session, "h2");
        mergeInterceptSnapshot(fillResult, session.interceptSnapshot());
        fillResult.put("inquiryMatch", inquiryMatch);
        fillResult.put("hasDateInput", fillMeta.optBoolean("hasDateInput", fillResult.optBoolean("hasDateInput", false)));
        fillResult.put("queryButtonFound", fillMeta.optBoolean("queryButtonFound", fillResult.optBoolean("queryButtonFound", false)));
        fillResult.put("hasH2FormAnchors", fillMeta.optBoolean("hasH2FormAnchors", fillResult.optBoolean("hasH2FormAnchors", false)));
        fillResult.put("inqType", fillMeta.optString("inqType", ""));
        if (!fillMeta.optBoolean("ok", false)
            && !fillResult.optBoolean("hasH2FormAnchors", false)
            && !fillResult.optBoolean("hasDateInput", false)
            && !fillResult.optBoolean("queryButtonFound", false)) {
            fillResult.put("reason", "missing_h2_anchors");
            debugTrace.record("h2_probe", "error", "Transaction inquiry missing date/query anchors", fillResult);
            return false;
        }
        if (!fillMeta.optBoolean("submitted", false)) {
            fillResult.put("reason", "missing_h2_anchors");
            debugTrace.record("h2_probe", "error", "Transaction inquiry submit (doSubmit) was not found", fillResult);
            return false;
        }
        debugTrace.record("h2_probe", "ok", "Inquiry form filled and submitted", fillMeta);

        try {
            session.waitForCondition("""
                (() => {
                  function scan(doc) {
                    if (!doc) return false;
                    const text = String(doc.body?.innerText ?? '');
                    if (/查無資料|沒有資料|no data/i.test(text)) return true;
                    const tables = Array.from(doc.querySelectorAll('table'));
                    for (const table of tables) {
                      const header = String(table.querySelector('tr')?.textContent || '');
                      if (/日期|摘要|說明|金額|支出|存入|餘額|交易/.test(header)) return true;
                      const rows = table.querySelectorAll('tr');
                      if (rows.length >= 2 && /\\d{4}[\\/.-]\\d{1,2}/.test(String(table.textContent || ''))) return true;
                    }
                    return false;
                  }
                  try {
                    if (scan(document)) return true;
                    for (let i = 0; i < window.frames.length; i += 1) {
                      try { if (scan(window.frames[i].document)) return true; } catch (_e) {}
                    }
                  } catch (_e) {}
                  return false;
                })();
                """, 12_000L, 400L, "hua_nan_transaction_query_failed", "Hua Nan transaction query did not finish in time");
        } catch (BankAutomationException queryError) {
            JSONObject timeoutProbe = captureStructuralProbe(session, "h2");
            mergeInterceptSnapshot(timeoutProbe, session.interceptSnapshot());
            timeoutProbe.put("reason", "query_timeout");
            timeoutProbe.put("inquiryMatch", inquiryMatch);
            debugTrace.record("h2_probe", "error", "Transaction query did not finish in time", timeoutProbe);
            throw queryFailure(
                queryError.getCode(),
                queryError.getMessage(),
                "query_timeout",
                timeoutProbe
            );
        }
        JSONObject doneProbe = captureStructuralProbe(session, "h2");
        mergeInterceptSnapshot(doneProbe, session.interceptSnapshot());
        doneProbe.put("reason", "ok");
        doneProbe.put("inquiryMatch", inquiryMatch);
        debugTrace.record("h2_probe", "ok", "Query wait completed", doneProbe);
        return true;
    }

    private static JSONArray parseTransactions(
        BrowserSession session,
        String accountId,
        String startDate,
        String endDate
    ) throws Exception {
        Object result = session.evaluateJavaScript(String.format(Locale.US, """
            (() => {
              const accountId = %s;
              function text(value) { return String(value ?? '').trim(); }
              function cells(row) {
                return Array.from(row.querySelectorAll('th,td')).map((cell) => text(cell.textContent));
              }
              function collectDocs() {
                const docs = [];
                const seen = new Set();
                function visit(win) {
                  if (!win || seen.has(win)) return;
                  seen.add(win);
                  try {
                    if (win.document) docs.push(win.document);
                    for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
                  } catch (_e) {}
                }
                visit(window);
                return docs;
              }
              function isFormControlTable(table) {
                const blob = text(table.textContent);
                if (/inqtype|S_Year|E_Year|送出資料|帳號（單選）|一般查詢/.test(blob)) return true;
                if (table.querySelector('select[name="S_Year"], select[name="acct1"], #acct1, input[name="inqtype"]')) return true;
                return false;
              }
              const rows = [];
              for (const doc of collectDocs()) {
                const tables = Array.from(doc.querySelectorAll('table'));
                for (const table of tables) {
                  if (isFormControlTable(table)) continue;
                  const bodyRows = Array.from(table.querySelectorAll('tr'));
                  if (bodyRows.length < 2) continue;
                  const header = cells(bodyRows[0]).map((value) => value.toLowerCase());
                  const looksTxn = header.some((h) => /日期|date|摘要|說明|金額|amount|支出|存入|餘額/.test(h))
                    || (/交易|明細/.test(text(table.textContent)) && /\\d{4}[\\/.-]\\d{1,2}/.test(text(table.textContent)));
                  if (!looksTxn) continue;
                  for (let index = 1; index < bodyRows.length; index += 1) {
                    const values = cells(bodyRows[index]);
                    if (values.length < 2) continue;
                    const joined = values.join(' ');
                    if (!joined || /合計|小計|查無|沒有資料/.test(joined)) continue;
                    if (!/\\d{4}[\\/.-]\\d{1,2}/.test(joined)) continue;
                    const dateMatch = joined.match(/(\\d{4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2})/);
                    const amountMatch = joined.match(/-?[\\d,]+(?:\\.\\d{1,2})?/);
                    const refMatch = joined.match(/(?:序號|參考|流水|Ref|SEQ)[^0-9A-Za-z]*([0-9A-Za-z-]{4,})/i)
                      || values.find((value) => /^[0-9A-Za-z-]{6,}$/.test(value));
                    rows.push({
                      cells: values,
                      postedAt: dateMatch ? dateMatch[1] : '',
                      amount: amountMatch ? amountMatch[0] : '',
                      summary: values.find((value) => /[\\u4e00-\\u9fffA-Za-z]/.test(value) && !/\\d{4}[\\/.-]\\d{1,2}/.test(value)) || '',
                      ref: typeof refMatch === 'string' ? refMatch : (refMatch && refMatch[1] ? refMatch[1] : ''),
                      accountId
                    });
                  }
                }
              }
              return rows;
            })();
            """, quoteJs(accountId)));
        if (!(result instanceof JSONArray)) {
            return new JSONArray();
        }
        JSONArray raw = (JSONArray) result;
        JSONArray out = new JSONArray();
        Map<String, Integer> occurrenceByKey = new HashMap<>();
        for (int index = 0; index < raw.length(); index += 1) {
            JSONObject row = raw.getJSONObject(index);
            JSONObject item = buildTransactionIdentity(accountId, row, startDate, endDate, occurrenceByKey);
            if (item != null) out.put(item);
        }
        return out;
    }

    /**
     * Prefer portal ref/seq; else {@code hncb_} + hash(account|postedAt|amount|summary). Never include balance.
     * Occurrence index 0 keeps v1 hash so existing rows are not rehashed (SYNC-01).
     */
    static JSONObject buildTransactionIdentity(
        String accountId,
        JSONObject row,
        String rangeStart,
        String rangeEnd
    ) throws Exception {
        return buildTransactionIdentity(accountId, row, rangeStart, rangeEnd, new HashMap<>());
    }

    static JSONObject buildTransactionIdentity(
        String accountId,
        JSONObject row,
        String rangeStart,
        String rangeEnd,
        Map<String, Integer> occurrenceByKey
    ) throws Exception {
        String postedAtText = firstNonEmpty(row.optString("postedAt"), row.optString("date"), row.optString("交易日"));
        String summary = firstNonEmpty(row.optString("summary"), row.optString("摘要"), row.optString("description"));
        long amountMinor = parseMinorAmount(firstNonEmpty(row.optString("amount"), row.optString("金額")));
        if (postedAtText.isEmpty() || amountMinor == 0L) {
            return null;
        }
        String portalRef = firstNonEmpty(
            row.optString("ref"),
            row.optString("seq"),
            row.optString("序號"),
            row.optString("參考號"),
            row.optString("providerTransactionId")
        );
        String identityScheme;
        String providerTransactionId;
        if (!portalRef.isEmpty()) {
            identityScheme = "huanan:portal-ref:v1";
            providerTransactionId = portalRef;
        } else {
            String base = accountId + "|" + postedAtText + "|" + amountMinor + "|" + summary;
            Map<String, Integer> counts = occurrenceByKey != null ? occurrenceByKey : new HashMap<>();
            int occurrence = counts.containsKey(base) ? counts.get(base) : 0;
            counts.put(base, occurrence + 1);
            String hashInput = occurrence == 0 ? base : base + "|occ:" + occurrence;
            identityScheme = occurrence == 0 ? "huanan:fallback-hash:v1" : "huanan:fallback-hash:v1-occ";
            providerTransactionId = "hncb_" + simpleHash(hashInput);
        }
        String postedAt = parsePostedAtIso(postedAtText);
        JSONObject item = new JSONObject();
        item.put("providerTransactionId", providerTransactionId);
        item.put("providerAccountId", accountId);
        item.put("postedAt", postedAt.isEmpty() ? nowIso() : postedAt);
        item.put("amountMinor", amountMinor);
        item.put("balanceMinor", JSONObject.NULL);
        item.put("currency", "TWD");
        item.put("transactionType", JSONObject.NULL);
        item.put("note", JSONObject.NULL);
        item.put("summary", summary.isEmpty() ? JSONObject.NULL : summary);
        item.put("description", summary.isEmpty() ? "Hua Nan transaction" : summary);
        item.put("merchant", "");
        item.put("status", "posted");
        JSONObject raw = new JSONObject();
        raw.put("accountId", accountId);
        raw.put("rangeStart", rangeStart);
        raw.put("rangeEnd", rangeEnd);
        raw.put("identity_scheme", identityScheme);
        raw.put("source", "dom_table");
        raw.put("row", row);
        item.put("rawJson", raw.toString());
        return item;
    }

    private static JSONArray dedupeTransactions(JSONArray transactions) throws Exception {
        JSONArray deduped = new JSONArray();
        List<String> seenKeys = new ArrayList<>();
        for (int index = 0; index < transactions.length(); index += 1) {
            JSONObject item = transactions.getJSONObject(index);
            String key = normalizeText(item.optString("providerAccountId"))
                + ":"
                + normalizeText(item.optString("providerTransactionId"));
            if (key.equals(":") || seenKeys.contains(key)) continue;
            seenKeys.add(key);
            deduped.put(item);
        }
        return deduped;
    }

    private static String buildCursor(String initialStartDate) throws Exception {
        JSONObject cursor = new JSONObject();
        cursor.put("initialStartDate", initialStartDate);
        return cursor.toString();
    }

    private static String buildConnectionId(String nationalId, String userCode) {
        String source = normalizeText(nationalId).toUpperCase(Locale.US) + ":" + normalizeText(userCode);
        return "hua_nan_identity_" + simpleHash(source);
    }

    private static String simpleHash(String input) {
        String source = input == null ? "" : input;
        long hash = 2166136261L;
        for (int index = 0; index < source.length(); index += 1) {
            hash ^= source.charAt(index);
            hash *= 16777619L;
        }
        return Long.toUnsignedString(hash, 36);
    }

    private static String requireText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        String value = normalizeText(payload.optString(key));
        if (value.isEmpty()) throw new BankAutomationException(code, message);
        return value;
    }

    private static String requireUpperText(JSONObject payload, String key, String code, String message) throws BankAutomationException {
        return requireText(payload, key, code, message).toUpperCase(Locale.US);
    }

    private static String requireDate(String value, String code, String message) throws BankAutomationException {
        LocalDate parsed = parseDate(value);
        if (parsed == null) throw new BankAutomationException(code, message);
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

    private static String parsePostedAtIso(String value) {
        String source = normalizeText(value).replace('.', '/').replace('-', '/');
        String[] parts = source.split("[/\\s:]+");
        if (parts.length < 3) return "";
        try {
            int year = Integer.parseInt(parts[0]);
            int month = Integer.parseInt(parts[1]);
            int day = Integer.parseInt(parts[2]);
            int hour = parts.length > 3 ? Integer.parseInt(parts[3]) : 0;
            int minute = parts.length > 4 ? Integer.parseInt(parts[4]) : 0;
            int second = parts.length > 5 ? Integer.parseInt(parts[5]) : 0;
            return LocalDate.of(year, month, day).atTime(hour, minute, second).atZone(TAIPEI_ZONE).toInstant().toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static long parseMinorAmount(String value) {
        String source = normalizeText(value);
        if (source.isEmpty()) return 0L;
        boolean negative = source.contains("(") || source.startsWith("-") || source.contains("支出");
        String numeric = source.replaceAll("[^0-9.]", "");
        if (numeric.isEmpty()) return 0L;
        double amount = Double.parseDouble(numeric);
        if (!Double.isFinite(amount) || amount == 0d) return 0L;
        long minor = Math.round(amount * 100d);
        return negative ? -minor : minor;
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            String normalized = normalizeText(value);
            if (!normalized.isEmpty()) return normalized;
        }
        return "";
    }

    private static void putJsonValue(JSONObject target, String key, Object value) {
        if (target == null || key == null || key.trim().isEmpty()) return;
        try {
            target.put(key, value);
        } catch (JSONException ignored) {
        }
    }

    private static String nowIso() {
        return Instant.now().toString();
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizeAccountId(String value) {
        return normalizeText(value).replaceAll("\\s+", "");
    }

    private static String quoteJs(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }

    static String maskAccountId(String accountId) {
        String digits = normalizeText(accountId).replaceAll("\\D+", "");
        if (digits.isEmpty()) return "";
        if (digits.length() <= 4) return "****";
        return "****" + digits.substring(digits.length() - 4);
    }

    static String redactUrlPath(String url) {
        String source = normalizeText(url);
        if (source.isEmpty()) return "";
        try {
            URI uri = new URI(source);
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            String query = uri.getRawQuery();
            StringBuilder kept = new StringBuilder();
            if (query != null && !query.isEmpty()) {
                for (String part : query.split("&")) {
                    int eq = part.indexOf('=');
                    String key = (eq < 0 ? part : part.substring(0, eq)).toLowerCase(Locale.US);
                    if (
                        "trx".equals(key)
                        || "state".equals(key)
                        || "target".equals(key)
                        || "recognition".equals(key)
                    ) {
                        if (kept.length() > 0) kept.append('&');
                        kept.append(part);
                    }
                }
            }
            String host = uri.getHost() == null ? "" : uri.getHost();
            String result = path;
            if (kept.length() > 0) result = path + "?" + kept;
            if (!host.isEmpty()) result = host + result;
            return result;
        } catch (Exception ignored) {
            return source.replaceAll("(?i)(jsessionid|session|token|sid)=[^&]+", "$1=redacted");
        }
    }

    static boolean isHncbHost(String url) {
        return normalizeText(url).toLowerCase(Locale.US).contains("hncb.com.tw");
    }

    /**
     * Phase A: observe-only. GET replay stays false until an H2 URL allowlist is frozen.
     */
    static boolean shouldReplayTransactionInterceptRequest(String method) {
        return false;
    }

    static String interceptSkipReason(String method) {
        String normalized = normalizeText(method);
        if (normalized.isEmpty()) normalized = "GET";
        if ("POST".equalsIgnoreCase(normalized) || "PUT".equalsIgnoreCase(normalized)) {
            return INTERCEPT_SKIP_REASON_POST;
        }
        return INTERCEPT_SKIP_REASON_OBSERVE_ONLY;
    }

    static boolean looksLikeJsonUrl(String url) {
        String normalized = normalizeText(url).toLowerCase(Locale.US);
        return normalized.contains(".json") || normalized.contains("/json");
    }

    static JSONObject asJsonObject(Object raw) {
        if (raw instanceof JSONObject) return (JSONObject) raw;
        if (raw instanceof String) {
            String text = normalizeText((String) raw);
            if (text.isEmpty() || "null".equals(text)) return new JSONObject();
            try {
                return new JSONObject(text);
            } catch (JSONException ignored) {
                return new JSONObject();
            }
        }
        return new JSONObject();
    }

    static JSONObject expectedH1ProbeShape() throws JSONException {
        JSONObject probe = new JSONObject();
        for (String key : H1_PROBE_REQUIRED_KEYS) {
            probe.put(key, JSONObject.NULL);
        }
        return probe;
    }

    static JSONObject expectedH2ProbeShape() throws JSONException {
        JSONObject probe = new JSONObject();
        for (String key : H2_PROBE_REQUIRED_KEYS) {
            probe.put(key, JSONObject.NULL);
        }
        return probe;
    }

    private static BankAutomationException queryFailure(
        String code,
        String message,
        String reason,
        JSONObject probe
    ) {
        BankAutomationException error = new BankAutomationException(code, message);
        JSONObject data = new JSONObject();
        putJsonValue(data, "reason", reason);
        if (probe != null) {
            putJsonValue(data, "probe", probe);
        }
        error.attachData(data);
        return error;
    }

    private static void mergeInterceptSnapshot(JSONObject target, JSONObject snapshot) {
        if (target == null || snapshot == null) return;
        putJsonValue(target, "getCount", snapshot.optInt("getCount"));
        putJsonValue(target, "postCount", snapshot.optInt("postCount"));
        putJsonValue(target, "skipCount", snapshot.optInt("skipCount"));
        putJsonValue(target, "jsonHintCount", snapshot.optInt("jsonHintCount"));
        putJsonValue(target, "skipReason", snapshot.optString("lastSkipReason"));
        putJsonValue(target, "pathSamples", snapshot.optJSONArray("pathSamples"));
    }

    private static JSONObject captureStructuralProbe(BrowserSession session, String kind) {
        try {
            Object raw = session.evaluateJavaScript("""
                (() => {
                  function text(value) { return String(value ?? '').trim(); }
                  function redactPath(href) {
                    try {
                      const url = new URL(href, location.href);
                      const kept = [];
                      for (const key of ['trx', 'state', 'target', 'Recognition']) {
                        const value = url.searchParams.get(key);
                        if (value) kept.push(key + '=' + value);
                      }
                      return url.host + url.pathname + (kept.length ? ('?' + kept.join('&')) : '');
                    } catch (_e) {
                      return String(href || '').replace(/\\d{8,}/g, '****').slice(0, 180);
                    }
                  }
                  const frames = [];
                  let readableFrameCount = 0;
                  let opaqueFrameCount = 0;
                  const seen = new Set();
                  function visit(win) {
                    if (!win || seen.has(win)) return;
                    seen.add(win);
                    try {
                      const href = String(win.location && win.location.href || '');
                      readableFrameCount += 1;
                      const doc = win.document;
                      const forms = Array.from(doc.querySelectorAll('form')).slice(0, 8).map((form) => ({
                        name: text(form.getAttribute('name')),
                        id: text(form.id),
                        actionPath: redactPath(form.getAttribute('action') || href)
                      }));
                      const inputs = Array.from(doc.querySelectorAll('input, select')).slice(0, 24).map((el) => ({
                        name: text(el.name),
                        id: text(el.id),
                        type: text(el.type || el.tagName)
                      }));
                      const tables = Array.from(doc.querySelectorAll('table')).slice(0, 6);
                      const tableHeaders = [];
                      const tableIds = [];
                      for (const table of tables) {
                        tableIds.push(text(table.id || table.className).slice(0, 80));
                        const firstRow = table.querySelector('tr');
                        if (firstRow) {
                          tableHeaders.push(
                            Array.from(firstRow.querySelectorAll('th,td')).map((cell) => text(cell.textContent).slice(0, 20)).slice(0, 8)
                          );
                        }
                      }
                      const blob = text(doc.body && doc.body.innerText).slice(0, 4000);
                      const structuralAccountFieldCount = Array.from(doc.querySelectorAll(
                        'input[name*="account" i], input[name*="acct" i], input[name*="acno" i], input[id*="account" i], input[id*="acct" i], [data-account], [data-acct], [data-acno]'
                      )).length;
                      const hasEmptyText = /查無資料|沒有資料|no data/i.test(blob);
                      const dateFields = inputs.filter((item) =>
                        /date|start|end|from|to|起|迄|開始|結束|S_Year|S_Month|S_Date|E_Year|E_Month|E_Date|inqtype|Y_YM|M_YM/i
                          .test(item.name + item.id)
                      );
                      const queryButtonFound = Array.from(doc.querySelectorAll('input[type="button"], input[type="submit"], button'))
                        .some((btn) => /查詢|Query|Search|送出/i.test(text(btn.value || btn.textContent || '')))
                        || Array.from(doc.querySelectorAll('a[href*="doSubmit"]')).length > 0
                        || typeof win.doSubmit === 'function';
                      const hasAcct = inputs.some((item) => item.id === 'acct1' || item.name === 'acct1')
                        || Boolean(doc.querySelector('#acct1'));
                      const hasH2FormAnchors = hasAcct && dateFields.length > 0 && queryButtonFound;
                      frames.push({
                        path: redactPath(href),
                        formCount: forms.length,
                        tableCount: tables.length,
                        forms,
                        inputs,
                        tableHeaders,
                        tableIds,
                        structuralAccountFieldCount,
                        hasTable: tables.length > 0,
                        hasDateInput: dateFields.length > 0,
                        dateFields,
                        queryButtonFound,
                        hasH2FormAnchors,
                        hasEmptyText
                      });
                      for (let i = 0; i < win.frames.length; i += 1) visit(win.frames[i]);
                    } catch (_e) {
                      opaqueFrameCount += 1;
                    }
                  }
                  visit(window);
                  const first = frames[0] || {
                    path: '',
                    forms: [],
                    inputs: [],
                    tableHeaders: [],
                    tableIds: [],
                    digitBlobCount: 0,
                    hasTable: false,
                    hasDateInput: false,
                    dateFields: [],
                    queryButtonFound: false,
                    hasH2FormAnchors: false,
                    hasEmptyText: false
                  };
                  let emptyInIframe = false;
                  let anyH2FormAnchors = Boolean(first.hasH2FormAnchors);
                  for (let i = 1; i < frames.length; i += 1) {
                    if (frames[i].hasEmptyText) emptyInIframe = true;
                    if (frames[i].hasH2FormAnchors) anyH2FormAnchors = true;
                  }
                  return {
                    kind: 'probe',
                    readableFrameCount,
                    opaqueFrameCount,
                    frames: frames.slice(0, 4),
                    forms: first.forms,
                    inputs: first.inputs,
                    tableHeaders: first.tableHeaders,
                    tableIds: first.tableIds,
                    digitBlobCount: first.digitBlobCount,
                    hasTable: first.hasTable,
                    hasDateInput: first.hasDateInput,
                    dateFields: first.dateFields,
                    queryButtonFound: first.queryButtonFound,
                    hasH2FormAnchors: anyH2FormAnchors,
                    hasEmptyText: first.hasEmptyText,
                    emptyInIframe,
                    inquiryMatch: 'none',
                    hrefPattern: ''
                  };
                })();
                """);
            JSONObject probe = asJsonObject(raw);
            if (probe.length() > 0) {
                putJsonValue(probe, "kind", kind);
                return probe;
            }
        } catch (Exception ignored) {
        }
        JSONObject fallback = new JSONObject();
        putJsonValue(fallback, "kind", kind);
        putJsonValue(fallback, "readableFrameCount", 0);
        putJsonValue(fallback, "opaqueFrameCount", 0);
        putJsonValue(fallback, "forms", new JSONArray());
        putJsonValue(fallback, "inputs", new JSONArray());
        putJsonValue(fallback, "tableHeaders", new JSONArray());
        putJsonValue(fallback, "digitBlobCount", 0);
        putJsonValue(fallback, "inquiryMatch", "none");
        putJsonValue(fallback, "hrefPattern", "");
        putJsonValue(fallback, "hasTable", false);
        putJsonValue(fallback, "hasDateInput", false);
        putJsonValue(fallback, "dateFields", new JSONArray());
        putJsonValue(fallback, "queryButtonFound", false);
        putJsonValue(fallback, "hasH2FormAnchors", false);
        putJsonValue(fallback, "hasEmptyText", false);
        return fallback;
    }

    private static final class BrowserSession {
        private final WebView webView;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final CookieManager cookieManager = CookieManager.getInstance();
        private final AtomicReference<CountDownLatch> navigationLatchRef = new AtomicReference<>(null);
        private final AtomicReference<String> lastFinishedUrlRef = new AtomicReference<>("");
        private volatile String lastCaptchaSignature = "";
        private final Object interceptLock = new Object();
        private int interceptGetCount;
        private int interceptPostCount;
        private int interceptSkipCount;
        private int interceptJsonHintCount;
        private String lastSkipReason = "";
        private final List<String> interceptPathSamples = new ArrayList<>();

        BrowserSession(Activity activity, WebView webView) throws BankAutomationException {
            this.webView = webView;
            runOnUiThreadAndWait(() -> webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    lastFinishedUrlRef.set(normalizeText(url));
                    CountDownLatch latch = navigationLatchRef.getAndSet(null);
                    if (latch != null) latch.countDown();
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    observeNetworkRequest(request);
                    return null;
                }
            }));
        }

        JSONObject interceptSnapshot() {
            JSONObject snapshot = new JSONObject();
            synchronized (interceptLock) {
                putJsonValue(snapshot, "getCount", interceptGetCount);
                putJsonValue(snapshot, "postCount", interceptPostCount);
                putJsonValue(snapshot, "skipCount", interceptSkipCount);
                putJsonValue(snapshot, "jsonHintCount", interceptJsonHintCount);
                putJsonValue(snapshot, "lastSkipReason", lastSkipReason);
                JSONArray samples = new JSONArray();
                for (String sample : interceptPathSamples) {
                    samples.put(sample);
                }
                putJsonValue(snapshot, "pathSamples", samples);
            }
            return snapshot;
        }

        private void observeNetworkRequest(WebResourceRequest request) {
            if (request == null || request.getUrl() == null) return;
            String url = String.valueOf(request.getUrl());
            if (!isHncbHost(url)) return;
            String method = normalizeText(request.getMethod());
            if (method.isEmpty()) method = "GET";
            String path = redactUrlPath(url);
            synchronized (interceptLock) {
                if ("GET".equalsIgnoreCase(method)) {
                    interceptGetCount += 1;
                } else if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)) {
                    interceptPostCount += 1;
                }
                if (!shouldReplayTransactionInterceptRequest(method)) {
                    interceptSkipCount += 1;
                    lastSkipReason = interceptSkipReason(method);
                }
                if (looksLikeJsonUrl(url)) {
                    interceptJsonHintCount += 1;
                }
                if (!path.isEmpty() && interceptPathSamples.size() < INTERCEPT_PATH_SAMPLE_LIMIT && !interceptPathSamples.contains(path)) {
                    interceptPathSamples.add(path);
                }
            }
        }

        void loadUrl(String url) throws BankAutomationException {
            CountDownLatch latch = new CountDownLatch(1);
            navigationLatchRef.set(latch);
            lastFinishedUrlRef.set("");
            runOnUiThreadAndWait(() -> webView.loadUrl(url));
            waitForNavigation(url, latch);
            waitForCondition("""
                (() => {
                  try {
                    const state = String(document.readyState ?? '').toLowerCase();
                    const href = String(location?.href ?? '').toLowerCase();
                    return Boolean(document.body) && href !== 'about:blank'
                      && (state === 'interactive' || state === 'complete');
                  } catch (_e) { return false; }
                })();
                """, 15_000L, 300L, "hua_nan_dom_ready_timeout", "Hua Nan page did not become ready in time");
        }

        void waitForLoginForm() throws BankAutomationException {
            waitForCondition("""
                (() => {
                  const form = document.querySelector('#LoginForm_post, form[name="LoginForm"]');
                  const user = document.querySelector('#USERIDTEXT, #USERID, input[name="USERIDTEXT"]');
                  const nick = document.querySelector('#NICKNAME, input[name="NICKNAME"]');
                  const pass = document.querySelector('#password, input[name="PASSWORD"]');
                  const captcha = document.querySelector('#TrxCaptchaKey, input[name="TrxCaptchaKey"]');
                  return Boolean(form && user && nick && pass && captcha);
                })();
                """, 15_000L, 300L, "hua_nan_login_page_mismatch", "Hua Nan login form was not found");
        }

        boolean isLoginPage() throws Exception {
            Object result = evaluateJavaScript("""
                (() => {
                  return Boolean(
                    document.querySelector('#LoginForm_post, form[name="LoginForm"]')
                    && document.querySelector('#USERIDTEXT, input[name="USERIDTEXT"]')
                    && document.querySelector('#TrxCaptchaKey, input[name="TrxCaptchaKey"]')
                  );
                })();
                """);
            return Boolean.TRUE.equals(result);
        }

        void waitForCaptchaReady(String previousSignature) throws BankAutomationException {
            String expectedPrevious = normalizeText(previousSignature);
            long deadline = System.currentTimeMillis() + CAPTCHA_READY_TIMEOUT_MS;
            while (System.currentTimeMillis() < deadline) {
                try {
                    Object raw = evaluateJavaScript("""
                        (() => {
                          const img = document.querySelector('#code_Cap, img[name="code_Cap"], img[src*="CaptchaImage_2.jsp"]');
                          if (!img) return { ready: false, signature: '', dataUrl: '', src: '' };
                          const src = String(img.currentSrc || img.src || '');
                          const complete = Boolean(img.complete);
                          const width = Number(img.naturalWidth || img.width || 0);
                          const height = Number(img.naturalHeight || img.height || 0);
                          let dataUrl = '';
                          try {
                            if (complete && width > 0 && height > 0) {
                              const canvas = document.createElement('canvas');
                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext('2d');
                              ctx.drawImage(img, 0, 0);
                              dataUrl = canvas.toDataURL('image/png');
                            }
                          } catch (_e) {}
                          const signature = [src, width, height, String(dataUrl.length)].join('|');
                          return {
                            ready: complete && width >= 20 && height >= 10,
                            signature,
                            dataUrl,
                            src
                          };
                        })();
                        """);
                    if (raw instanceof JSONObject) {
                        JSONObject snapshot = (JSONObject) raw;
                        String signature = normalizeText(snapshot.optString("signature"));
                        lastCaptchaSignature = signature;
                        if (snapshot.optBoolean("ready", false)
                            && (expectedPrevious.isEmpty() || !expectedPrevious.equals(signature))) {
                            return;
                        }
                        if (snapshot.optBoolean("ready", false) && !expectedPrevious.isEmpty()) {
                            // Same signature after refresh can still be usable after a short wait.
                            return;
                        }
                    }
                } catch (Exception ignored) {
                }
                sleep(250L);
            }
            throw new BankAutomationException("hua_nan_captcha_not_ready", "Hua Nan captcha image was not ready in time");
        }

        String captureCaptchaDataUrl() throws Exception {
            Object raw = evaluateJavaScript("""
                (() => {
                  const img = document.querySelector('#code_Cap, img[name="code_Cap"], img[src*="CaptchaImage_2.jsp"]');
                  if (!img) return '';
                  try {
                    const width = Number(img.naturalWidth || img.width || 0);
                    const height = Number(img.naturalHeight || img.height || 0);
                    if (!img.complete || width <= 0 || height <= 0) return String(img.currentSrc || img.src || '');
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    return canvas.toDataURL('image/png');
                  } catch (_e) {
                    return String(img.currentSrc || img.src || '');
                  }
                })();
                """);
            String value = raw == null ? "" : String.valueOf(raw);
            if (CaptchaSolver.isDataUrlUsable(value)) {
                return value;
            }
            String fetched = fetchCaptchaImageDataUrl();
            return CaptchaSolver.isDataUrlUsable(fetched) ? fetched : value;
        }

        private String fetchCaptchaImageDataUrl() {
            try {
                byte[] bytes = downloadBinary(CAPTCHA_ABS_URL + "?reload=" + System.currentTimeMillis());
                if (bytes == null || bytes.length == 0) return "";
                return "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
            } catch (Exception error) {
                Log.d(TAG, "Direct captcha fetch failed", error);
                return "";
            }
        }

        private byte[] downloadBinary(String urlText) throws IOException, BankAutomationException {
            URL url = new URL(urlText);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(12_000);
            connection.setReadTimeout(12_000);
            connection.setRequestProperty("User-Agent", webView.getSettings().getUserAgentString());
            String cookies = captureCookies();
            if (!cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
            try {
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
                    return output.toByteArray();
                }
            } finally {
                connection.disconnect();
            }
        }

        void refreshCaptcha() throws Exception {
            String previous = lastCaptchaSignature;
            evaluateJavaScript("""
                (() => {
                  if (typeof window.chgCaptcha === 'function') {
                    window.chgCaptcha();
                    return true;
                  }
                  const img = document.querySelector('#code_Cap, img[name="code_Cap"], img[src*="CaptchaImage_2.jsp"]');
                  if (!img) return false;
                  img.src = '/netbank/pages/jsp/html/CaptchaImage_2.jsp?reload=' + Date.now();
                  const input = document.querySelector('#TrxCaptchaKey, input[name="TrxCaptchaKey"]');
                  if (input) input.value = '';
                  return true;
                })();
                """);
            waitForCaptchaReady(previous);
        }

        void submitLogin(String nationalId, String userCode, String password, String captchaText) throws Exception {
            Object result = evaluateJavaScript(String.format(Locale.US, """
                (() => {
                  const nationalId = %s;
                  const userCode = %s;
                  const password = %s;
                  const captcha = %s;
                  function setValue(el, value) {
                    if (!el) return;
                    el.focus();
                    el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  const userText = document.querySelector('#USERIDTEXT, input[name="USERIDTEXT"]');
                  const userHidden = document.querySelector('#USERID, input[name="USERID"]');
                  const nick = document.querySelector('#NICKNAME, input[name="NICKNAME"]');
                  const pass = document.querySelector('#password, input[name="PASSWORD"]');
                  const captchaInput = document.querySelector('#TrxCaptchaKey, input[name="TrxCaptchaKey"]');
                  if (!userText || !nick || !pass || !captchaInput) return false;
                  setValue(userText, nationalId);
                  if (typeof window.syncHiddenUSERID === 'function') {
                    window.syncHiddenUSERID();
                  }
                  if (userHidden) setValue(userHidden, nationalId);
                  setValue(nick, userCode);
                  setValue(pass, password);
                  setValue(captchaInput, captcha);
                  if (typeof window.doSubmit === 'function') {
                    window.doSubmit();
                    return true;
                  }
                  const form = document.querySelector('#LoginForm_post, form[name="LoginForm"]');
                  if (form && typeof form.submit === 'function') {
                    form.submit();
                    return true;
                  }
                  return false;
                })();
                """, quoteJs(nationalId), quoteJs(userCode), quoteJs(password), quoteJs(captchaText)));
            if (!Boolean.TRUE.equals(result)) {
                throw new BankAutomationException("hua_nan_login_trigger_missing", "Hua Nan login trigger was not found");
            }
        }

        boolean waitForLoginSuccess() throws Exception {
            long deadline = System.currentTimeMillis() + 18_000L;
            while (System.currentTimeMillis() < deadline) {
                if (!isLoginPage()) {
                    Object ready = evaluateJavaScript("""
                        (() => {
                          const text = String(document.body?.innerText ?? '');
                          if (/驗證碼|圖形驗證|密碼錯誤|代號錯誤|身分證|登入失敗|alert/i.test(text)
                              && document.querySelector('#LoginForm_post, form[name="LoginForm"]')) {
                            return false;
                          }
                          return Boolean(document.body) && !document.querySelector('#TrxCaptchaKey');
                        })();
                        """);
                    if (Boolean.TRUE.equals(ready)) return true;
                }
                sleep(600L);
            }
            return false;
        }

        String captureCookies() throws BankAutomationException {
            String cookies = callOnUiThreadAndWait(() -> cookieManager.getCookie(COOKIE_URL));
            return cookies == null ? "" : cookies.trim();
        }

        void restoreCookies(String cookieHeader) throws Exception {
            String normalized = normalizeText(cookieHeader);
            if (normalized.isEmpty()) return;
            for (String cookie : normalized.split(";")) {
                String pair = normalizeText(cookie);
                if (pair.isEmpty()) continue;
                CountDownLatch latch = callOnUiThreadAndWait(() -> {
                    CountDownLatch innerLatch = new CountDownLatch(1);
                    cookieManager.setCookie(COOKIE_URL, pair, value -> innerLatch.countDown());
                    return innerLatch;
                });
                awaitLatch(latch, 5, "hua_nan_cookie_set_timeout", "Hua Nan cookie write timed out");
            }
            runOnUiThreadAndWait(cookieManager::flush);
        }

        void clearSessionCookies() throws BankAutomationException {
            CountDownLatch latch = callOnUiThreadAndWait(() -> {
                CountDownLatch innerLatch = new CountDownLatch(1);
                cookieManager.removeSessionCookies(value -> innerLatch.countDown());
                return innerLatch;
            });
            awaitLatch(latch, 5, "hua_nan_cookie_clear_timeout", "Hua Nan cookie clear timed out");
            runOnUiThreadAndWait(cookieManager::flush);
        }

        void waitForCondition(String script, long timeoutMs, long pollMs, String code, String message) throws BankAutomationException {
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                try {
                    if (Boolean.TRUE.equals(evaluateJavaScript(script))) return;
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
                throw new BankAutomationException("hua_nan_js_eval_timeout", "Hua Nan automation script timed out");
            }
            String value = rawResult.get();
            if (value == null) return null;
            Object parsed = new JSONTokener(value).nextValue();
            if (parsed == JSONObject.NULL) return null;
            return parsed;
        }

        private void waitForNavigation(String requestedUrl, CountDownLatch latch) throws BankAutomationException {
            long deadline = System.currentTimeMillis() + 30_000L;
            while (System.currentTimeMillis() < deadline) {
                try {
                    if (latch.await(350L, TimeUnit.MILLISECONDS)) return;
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new BankAutomationException("hua_nan_navigation_timeout", "Hua Nan page load timed out");
                }
                String finished = normalizeText(lastFinishedUrlRef.get());
                if (!finished.isEmpty() && (requestedUrl == null || finished.contains("hncb.com.tw") || finished.equals(requestedUrl))) {
                    return;
                }
            }
            throw new BankAutomationException("hua_nan_navigation_timeout", "Hua Nan page load timed out");
        }

        private void awaitLatch(CountDownLatch latch, int seconds, String code, String message) throws BankAutomationException {
            try {
                if (!latch.await(seconds, TimeUnit.SECONDS)) throw new BankAutomationException(code, message);
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
            awaitLatch(latch, 20, "hua_nan_ui_thread_timeout", "Hua Nan UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("hua_nan_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
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
            awaitLatch(latch, 20, "hua_nan_ui_thread_timeout", "Hua Nan UI thread operation timed out");
            if (errorRef.get() != null) {
                throw new BankAutomationException("hua_nan_ui_thread_failed", String.valueOf(errorRef.get().getMessage()));
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
}
