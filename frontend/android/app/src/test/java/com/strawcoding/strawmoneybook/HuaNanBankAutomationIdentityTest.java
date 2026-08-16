package com.strawcoding.strawmoneybook;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

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
}
