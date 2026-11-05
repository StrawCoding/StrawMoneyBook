package com.strawcoding.strawmoneybook.providers.firstbank;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Intent;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.strawcoding.strawmoneybook.BankAutomationActivity;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Live connect + sync — credentials via instrumentation args (-e) only.
 */
@RunWith(AndroidJUnit4.class)
@LargeTest
public class FirstBankConnectSyncInstrumentedTest {
    private static final String CONNECTION_ID = "first_bank_instrumented_smoke";

    @Test
    public void connectAndSyncProducesTransactions() throws Exception {
        var args = InstrumentationRegistry.getArguments();
        String nationalId = args.getString("nationalId", "").trim();
        String userCode = args.getString("userCode", "").trim();
        String password = args.getString("password", "");
        if (nationalId.isEmpty() || userCode.isEmpty() || password.isEmpty()) {
            return;
        }

        String initialSyncStartDate = args.getString("initialSyncStartDate", "2026-10-06");
        String captchaCode = args.getString("captchaCode", "").trim();

        BankAutomationActivity.clearLastAutomationOutcome();
        JSONObject connectPayload = basePayload(nationalId, userCode, password, initialSyncStartDate);
        if (captchaCode.length() == 4) {
            connectPayload.put("captchaCode", captchaCode);
        }
        runAutomation(BankAutomationActivity.ACTION_CONNECT_BANK, connectPayload, 190_000L);

        assertNull("connect should not error", BankAutomationActivity.getLastAutomationErrorCode());
        String connectJson = BankAutomationActivity.getLastAutomationResultJson();
        assertNotNull(connectJson);
        JSONObject connectResult = new JSONObject(connectJson);
        JSONArray accounts = connectResult.optJSONArray("accounts");
        assertNotNull(accounts);
        assertTrue("expected at least one account after connect", accounts.length() > 0);

        JSONArray accountIds = new JSONArray();
        for (int i = 0; i < accounts.length(); i += 1) {
            JSONObject account = accounts.getJSONObject(i);
            String accountId = account.optString("account_id", account.optString("accountId", ""));
            if (!accountId.isEmpty()) {
                accountIds.put(accountId);
            }
        }
        assertTrue("account ids required for sync", accountIds.length() > 0);

        BankAutomationActivity.clearLastAutomationOutcome();
        JSONObject syncPayload = basePayload(nationalId, userCode, password, initialSyncStartDate);
        syncPayload.put("connectionId", CONNECTION_ID);
        syncPayload.put("accountIds", accountIds);
        syncPayload.put("cursor", initialSyncStartDate);
        syncPayload.put("lookbackDays", 120);
        runAutomation(BankAutomationActivity.ACTION_SYNC_BANK, syncPayload, 360_000L);

        assertNull("sync should not error: " + BankAutomationActivity.getLastAutomationErrorCode(), BankAutomationActivity.getLastAutomationErrorCode());
        String syncJson = BankAutomationActivity.getLastAutomationResultJson();
        assertNotNull(syncJson);
        JSONObject syncResult = new JSONObject(syncJson);
        JSONArray added = syncResult.optJSONArray("added");
        assertNotNull(added);
        assertTrue("expected at least one transaction row", added.length() > 0);

        JSONObject first = added.getJSONObject(0);
        assertTrue(first.has("postedAt"));
        assertTrue(first.has("amountMinor"));
        assertTrue(first.has("providerTransactionId"));
    }

    private static JSONObject basePayload(String nationalId, String userCode, String password, String initialSyncStartDate) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("providerId", "first_bank_tw");
        payload.put("provider", "first_bank_tw");
        payload.put("nationalId", nationalId);
        payload.put("repeatSeq", "0");
        payload.put("userCode", userCode);
        payload.put("password", password);
        payload.put("initialSyncStartDate", initialSyncStartDate);
        payload.put("connectionId", CONNECTION_ID);
        return payload;
    }

    private static void runAutomation(String action, JSONObject payload, long waitMs) throws InterruptedException {
        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), BankAutomationActivity.class);
        intent.putExtra(BankAutomationActivity.EXTRA_ACTION, action);
        intent.putExtra(BankAutomationActivity.EXTRA_PAYLOAD_JSON, payload.toString());
        try (ActivityScenario<BankAutomationActivity> scenario = ActivityScenario.launch(intent)) {
            long deadline = System.currentTimeMillis() + waitMs;
            while (System.currentTimeMillis() < deadline && BankAutomationActivity.isBusy()) {
                Thread.sleep(500L);
            }
            Thread.sleep(2_000L);
        }
    }
}
