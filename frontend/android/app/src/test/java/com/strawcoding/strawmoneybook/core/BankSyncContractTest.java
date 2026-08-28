package com.strawcoding.strawmoneybook.core;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.time.LocalDate;

public class BankSyncContractTest {
    @Test
    public void readLastSyncWatermarkPrefersLastSyncAtOverSnakeCase() throws Exception {
        org.json.JSONObject payload = new org.json.JSONObject();
        payload.put("lastSyncAt", "2026-08-20T00:00:00.000Z");
        payload.put("last_sync_at", "2026-08-10T00:00:00.000Z");
        assertEquals("2026-08-20T00:00:00.000Z", BankSyncContract.readLastSyncWatermark(payload));
    }

    @Test
    public void readLookbackDaysClampsToMaxWindow() throws Exception {
        org.json.JSONObject payload = new org.json.JSONObject();
        payload.put("lookbackDays", 99);
        assertEquals(30, BankSyncContract.readLookbackDays(payload));
    }

    @Test
    public void resolveQueryStartDateAppliesMandatoryLookback() {
        LocalDate start = BankSyncContract.resolveQueryStartDate(
            "2026-01-01",
            "2026-08-20T00:00:00.000Z",
            "",
            3
        );
        assertEquals(LocalDate.parse("2026-08-17"), start);
    }

    @Test
    public void parseDateReturnsNullForBlank() {
        assertNull(BankSyncContract.parseDate(""));
    }
}
