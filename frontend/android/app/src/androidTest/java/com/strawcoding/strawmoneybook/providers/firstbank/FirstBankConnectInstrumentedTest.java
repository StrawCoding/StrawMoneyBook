package com.strawcoding.strawmoneybook.providers.firstbank;

import android.content.Intent;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.strawcoding.strawmoneybook.BankAutomationActivity;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Live First Bank connect smoke — credentials only via instrumentation args (-e), never committed.
 */
@RunWith(AndroidJUnit4.class)
@LargeTest
public class FirstBankConnectInstrumentedTest {
    @Test
    public void connectWhenCredentialsProvided() throws Exception {
        var args = InstrumentationRegistry.getArguments();
        String nationalId = args.getString("nationalId", "").trim();
        String userCode = args.getString("userCode", "").trim();
        String password = args.getString("password", "");
        if (nationalId.isEmpty() || userCode.isEmpty() || password.isEmpty()) {
            return;
        }

        JSONObject payload = new JSONObject();
        payload.put("providerId", "first_bank_tw");
        payload.put("provider", "first_bank_tw");
        payload.put("nationalId", nationalId);
        payload.put("repeatSeq", args.getString("repeatSeq", "0"));
        payload.put("userCode", userCode);
        payload.put("password", password);
        payload.put("initialSyncStartDate", args.getString("initialSyncStartDate", "2025-10-01"));
        payload.put("connectionId", "first_bank_instrumented_smoke");
        String captchaCode = args.getString("captchaCode", "").trim();
        if (captchaCode.length() == 4) {
            payload.put("captchaCode", captchaCode);
        }

        Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), BankAutomationActivity.class);
        intent.putExtra(BankAutomationActivity.EXTRA_ACTION, BankAutomationActivity.ACTION_CONNECT_BANK);
        intent.putExtra(BankAutomationActivity.EXTRA_PAYLOAD_JSON, payload.toString());

        try (ActivityScenario<BankAutomationActivity> scenario = ActivityScenario.launch(intent)) {
            long deadline = System.currentTimeMillis() + 150_000L;
            while (System.currentTimeMillis() < deadline && BankAutomationActivity.isBusy()) {
                Thread.sleep(500L);
            }
            Thread.sleep(2_000L);
        }
    }
}
