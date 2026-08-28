package com.strawcoding.strawmoneybook.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class CarrierSyncContractTest {
    @Test
    public void readLookbackDaysClampsToFourteen() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("lookbackDays", 99);
        assertEquals(14, CarrierSyncContract.readLookbackDays(payload));
    }

    @Test
    public void resolveConnectionIdUsesExplicitOrCardNo() throws Exception {
        JSONObject explicit = new JSONObject();
        explicit.put("connectionId", "custom-id");
        assertEquals("custom-id", CarrierSyncContract.resolveConnectionId(explicit));

        JSONObject fromPhone = new JSONObject();
        fromPhone.put("cardNo", "0912345678");
        assertEquals("natgov_mobile_0912345678", CarrierSyncContract.resolveConnectionId(fromPhone));
    }

    @Test
    public void isQueryApiUrlMatchesPortalJsonEndpoints() {
        assertTrue(CarrierSyncContract.isQueryApiUrl(
            "https://service-mc.einvoice.nat.gov.tw/ptl/portal/api/foo/query"
        ));
        assertFalse(CarrierSyncContract.isQueryApiUrl("https://example.com/invoices"));
    }
}
