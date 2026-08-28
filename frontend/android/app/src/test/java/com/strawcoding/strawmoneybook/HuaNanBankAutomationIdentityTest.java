package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDate;
import java.time.ZoneId;

public class HuaNanBankAutomationIdentityTest {

    @Test
    public void prefersPortalRefWithoutBalanceInHash() throws Exception {
        JSONObject row = new JSONObject();
        row.put("postedAt", "2026/08/16");
        row.put("amount", "1,234.00");
        row.put("summary", "轉帳");
        row.put("ref", "SEQ998877");
        row.put("balance", "999999");

        JSONObject item = HuaNanBankAutomation.buildTransactionIdentity(
            "123456789012",
            row,
            "2026-08-01",
            "2026-08-16"
        );
        assertNotNull(item);
        assertEquals("SEQ998877", item.getString("providerTransactionId"));
        JSONObject raw = new JSONObject(item.getString("rawJson"));
        assertEquals("huanan:portal-ref:v1", raw.getString("identity_scheme"));
        assertFalse(item.getString("providerTransactionId").contains("999999"));
    }

    @Test
    public void fallbackHashUsesHncbPrefixAndExcludesBalance() throws Exception {
        JSONObject row = new JSONObject();
        row.put("postedAt", "2026-08-15");
        row.put("amount", "-50");
        row.put("summary", "超商");
        row.put("balance", "8888.00");

        JSONObject item = HuaNanBankAutomation.buildTransactionIdentity(
            "987654321098",
            row,
            "2026-08-01",
            "2026-08-16"
        );
        assertNotNull(item);
        String id = item.getString("providerTransactionId");
        assertTrue(id.startsWith("hncb_"));
        JSONObject raw = new JSONObject(item.getString("rawJson"));
        assertEquals("huanan:fallback-hash:v1", raw.getString("identity_scheme"));
        assertFalse(id.contains("8888"));
    }

    @Test
    public void fallbackHashKeepsV1ForFirstOccurrenceAndDisambiguatesDuplicates() throws Exception {
        JSONObject first = new JSONObject();
        first.put("postedAt", "2026-08-15");
        first.put("amount", "-50");
        first.put("summary", "超商");

        JSONObject second = new JSONObject();
        second.put("postedAt", "2026-08-15");
        second.put("amount", "-50");
        second.put("summary", "超商");

        java.util.Map<String, Integer> occurrenceByKey = new java.util.HashMap<>();
        JSONObject firstItem = HuaNanBankAutomation.buildTransactionIdentity(
            "987654321098",
            first,
            "2026-08-01",
            "2026-08-16",
            occurrenceByKey
        );
        JSONObject secondItem = HuaNanBankAutomation.buildTransactionIdentity(
            "987654321098",
            second,
            "2026-08-01",
            "2026-08-16",
            occurrenceByKey
        );
        JSONObject solo = HuaNanBankAutomation.buildTransactionIdentity(
            "987654321098",
            first,
            "2026-08-01",
            "2026-08-16"
        );

        assertEquals(solo.getString("providerTransactionId"), firstItem.getString("providerTransactionId"));
        assertFalse(firstItem.getString("providerTransactionId").equals(secondItem.getString("providerTransactionId")));
        JSONObject firstRaw = new JSONObject(firstItem.getString("rawJson"));
        JSONObject secondRaw = new JSONObject(secondItem.getString("rawJson"));
        assertEquals("huanan:fallback-hash:v1", firstRaw.getString("identity_scheme"));
        assertEquals("huanan:fallback-hash:v1-occ", secondRaw.getString("identity_scheme"));
    }

    @Test
    public void buildAccountSyncResultMarksPartialWhenAnchorsMissingAndNoRows() throws Exception {
        JSONObject probe = new JSONObject();
        probe.put("hasDateInput", false);
        probe.put("queryButtonFound", false);
        probe.put("hasEmptyText", false);
        JSONObject partial = HuaNanBankAutomation.buildAccountSyncResult(
            null,
            "123456789012",
            LocalDate.now(ZoneId.of("Asia/Taipei")),
            LocalDate.now(ZoneId.of("Asia/Taipei")),
            0,
            probe
        );
        assertEquals("partial", partial.getString("status"));
        assertEquals("hua_nan_transaction_query_partial", partial.getString("code"));
        assertFalse(partial.has("coveredThrough"));
    }

    @Test
    public void syncStatusPartialDoesNotClaimTopLevelCoveredThrough() throws Exception {
        org.json.JSONArray accountResults = new org.json.JSONArray();
        accountResults.put(BankAutomationSyncContract.accountResultPartial(
            "123456789012",
            "hua_nan_transaction_query_partial",
            "incomplete",
            0
        ));
        assertEquals("partial_success", BankAutomationSyncContract.syncStatusFromAccountResults(accountResults));
        // Account-level partial never carries coveredThrough; callers must omit top-level watermark too.
        assertFalse(accountResults.getJSONObject(0).has("coveredThrough"));
    }

    @Test
    public void buildAccountSyncResultOkForExplicitEmptyWithAnchors() throws Exception {
        JSONObject probe = new JSONObject();
        probe.put("hasDateInput", true);
        probe.put("queryButtonFound", true);
        probe.put("hasEmptyText", true);
        JSONObject ok = HuaNanBankAutomation.buildAccountSyncResult(
            null,
            "123456789012",
            LocalDate.of(2026, 8, 16),
            LocalDate.of(2026, 8, 16),
            0,
            probe
        );
        assertEquals("ok", ok.getString("status"));
        assertEquals("2026-08-16", ok.getString("coveredThrough"));
    }
}
